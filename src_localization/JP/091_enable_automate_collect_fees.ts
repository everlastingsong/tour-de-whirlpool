import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@project-serum/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil, WhirlpoolIx
} from "@orca-so/whirlpools-sdk";
import {
  deriveATA, TransactionBuilder
} from "@orca-so/common-sdk";
import {
  ClockworkProvider, TriggerInput,
} from "@clockwork-xyz/sdk";
import {
  TOKEN_PROGRAM_ID, Token
} from "@solana/spl-token";

// スクリプト実行前に環境変数定義が必要です
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json
// WHIRLPOOL_POSITION=address_of_position

async function main() {
  // WhirlpoolClient 作成
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  // 環境変数 WHIRLPOOL_POSITION からポジションのアドレスを読み込み
  const position_address = process.env.WHIRLPOOL_POSITION;
  const position_pubkey = new PublicKey(position_address);
  console.log("position address:", position_pubkey.toBase58());

  // ポジション・プール取得
  const position = await client.getPosition(position_pubkey);
  const position_owner = ctx.wallet.publicKey;
  const position_token_account = await deriveATA(position_owner, position.getData().positionMint);
  const whirlpool_pubkey = position.getData().whirlpool;
  const whirlpool = await client.getPool(whirlpool_pubkey);
  const token_a = whirlpool.getTokenAInfo();
  const token_b = whirlpool.getTokenBInfo();

  // トークンアカウント取得
  const ata_a = await deriveATA(position_owner, token_a.mint);
  const ata_b = await deriveATA(position_owner, token_b.mint);

  // TickArray および Tick の取得
  const tick_spacing = whirlpool.getData().tickSpacing;
  const tick_array_lower_pubkey = PDAUtil.getTickArrayFromTickIndex(position.getData().tickLowerIndex, tick_spacing, whirlpool_pubkey, ctx.program.programId).publicKey;
  const tick_array_upper_pubkey = PDAUtil.getTickArrayFromTickIndex(position.getData().tickUpperIndex, tick_spacing, whirlpool_pubkey, ctx.program.programId).publicKey;

  // CLOCKWORK のアカウントアドレス計算
  const clockwork_provider = ClockworkProvider.fromAnchorProvider(provider);
  const clockwork_thread_id = `harvest-${position_pubkey.toBase58().slice(0, 8)}`;
  const [clockwork_thread_pda] = clockwork_provider.getThreadPDA(ctx.wallet.publicKey, clockwork_thread_id);
  console.log("clockwork thread pda:", clockwork_thread_pda.toBase58());

  // フィーやリワードの情報を最新化する命令を作成
  let update_fee_and_rewards_ix = WhirlpoolIx.updateFeesAndRewardsIx(
    ctx.program,
    {
      whirlpool: position.getData().whirlpool,
      position: position_pubkey,
      tickArrayLower: tick_array_lower_pubkey,
      tickArrayUpper: tick_array_upper_pubkey,
    }
  );
  
  // フィー回収の命令を作成
  let collect_fees_ix = WhirlpoolIx.collectFeesIx(
    ctx.program,
    {
      whirlpool: whirlpool_pubkey,
      position: position_pubkey,
      positionAuthority: clockwork_thread_pda, // Clockwork
      positionTokenAccount: position_token_account,
      tokenOwnerAccountA: ata_a,
      tokenOwnerAccountB: ata_b,
      tokenVaultA: whirlpool.getData().tokenVaultA, 
      tokenVaultB: whirlpool.getData().tokenVaultB,
    }
  );

  // ポジションのトークンの権限を Clockwork に委譲する命令を作成
  const delegate_ix = Token.createApproveInstruction(
    TOKEN_PROGRAM_ID,
    position_token_account,
    clockwork_thread_pda,
    ctx.wallet.publicKey,
    [],
    1,
  );

  // Clockwork のスレッドを作成する命令を作成
  const clockwork_trigger: TriggerInput = {
    cron: {
      // sec min hour day-of-month month day-of-week year
      schedule: "0 */10 * * * * *", // 10 分ごと
      skippable: true,
    },
  };
  const create_thread_ix = await clockwork_provider.threadCreate(
    ctx.wallet.publicKey,
    clockwork_thread_id,
    [
      ...update_fee_and_rewards_ix.instructions,
      ...collect_fees_ix.instructions,
    ],
    clockwork_trigger,
    100_000_000, // 0.1SOL
  );

  // トランザクション組み立て
  const tx_builder = new TransactionBuilder(ctx.connection, ctx.wallet);
  tx_builder.addInstruction({
    instructions: [],
    cleanupInstructions: [
      delegate_ix,
      create_thread_ix,
    ],
    signers: [],
  });

  // トランザクション実行
  const size = await tx_builder.txnSize();
  console.log("transaction size", size);
  const signature = await tx_builder.buildAndExecute();
  console.log("signature", signature);

  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({signature, ...latest_blockhash}, "confirmed");
}

main();
