import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@project-serum/anchor";
import { DecimalUtil, Percentage, deriveATA, TransactionBuilder } from "@orca-so/common-sdk";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil, WhirlpoolIx, SwapUtils
} from "@orca-so/whirlpools-sdk";
import Decimal from "decimal.js";
import {
  ClockworkProvider, TriggerInput,
} from "@clockwork-xyz/sdk";
import {
  TOKEN_PROGRAM_ID, Token
} from "@solana/spl-token";

// スクリプト実行前に環境変数定義が必要です
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json

async function main() {
  // WhirlpoolClient 作成
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  // トークン定義
  // https://everlastingsong.github.io/nebula/
  const devUSDC = {mint: new PublicKey("BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k"), decimals: 6};
  const devSAMO = {mint: new PublicKey("Jd4M8bfJG3sAkd82RsGWyEXoaBXQP7njFzBwEaCTuDa"), decimals: 9};

  // Whirlpool の Config アカウント
  const NEBULA_WHIRLPOOLS_CONFIG = new PublicKey("FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR");

  // devSAMO/devUSDC プール取得
  const tick_spacing = 64;
  const whirlpool_pubkey = PDAUtil.getWhirlpool(
      ORCA_WHIRLPOOL_PROGRAM_ID,
      NEBULA_WHIRLPOOLS_CONFIG,
      devSAMO.mint, devUSDC.mint, tick_spacing).publicKey;
  console.log("whirlpool_key:", whirlpool_pubkey.toBase58());
  const whirlpool = await client.getPool(whirlpool_pubkey);

  // 1 devUSDC トークンを devSAMO にスワップします
  const amount_in = new Decimal("1" /* devUSDC */);

  // トークンアカウント取得
  const ata_dev_samo = await deriveATA(ctx.wallet.publicKey, devSAMO.mint);
  const ata_dev_usdc = await deriveATA(ctx.wallet.publicKey, devUSDC.mint);

  // CLOCKWORK のアカウントアドレス計算
  const clockwork_provider = ClockworkProvider.fromAnchorProvider(provider);
  const clockwork_thread_id = `trade-${whirlpool_pubkey.toBase58().slice(0, 8)}`;
  const [clockwork_thread_pda] = clockwork_provider.getThreadPDA(ctx.wallet.publicKey, clockwork_thread_id);
  console.log("clockwork thread pda:", clockwork_thread_pda.toBase58());

  // スワップ命令作成
  const tickarrays = SwapUtils.getTickArrayPublicKeys(
    whirlpool.getData().tickCurrentIndex,
    whirlpool.getData().tickSpacing,
    false,
    ctx.program.programId,
    whirlpool_pubkey,
  );
  const swap_ix = WhirlpoolIx.swapIx(
    ctx.program,
    {
      whirlpool: whirlpool_pubkey,
      amountSpecifiedIsInput: true,
      amount: DecimalUtil.toU64(amount_in, devUSDC.decimals),
      aToB: false,
      otherAmountThreshold: SwapUtils.getDefaultOtherAmountThreshold(true),
      sqrtPriceLimit: SwapUtils.getDefaultSqrtPriceLimit(false),
      tokenVaultA: whirlpool.getData().tokenVaultA,
      tokenVaultB: whirlpool.getData().tokenVaultB,
      tokenAuthority: clockwork_thread_pda, // Clockwork
      tokenOwnerAccountA: ata_dev_samo,
      tokenOwnerAccountB: ata_dev_usdc,
      tickArray0: tickarrays[0],
      tickArray1: tickarrays[1],
      tickArray2: tickarrays[2],
      oracle: PDAUtil.getOracle(ctx.program.programId, whirlpool_pubkey).publicKey,
    }
  );

  // トークンの権限を Clockwork に委譲する命令を作成
  const delegate_ix = Token.createApproveInstruction(
    TOKEN_PROGRAM_ID,
    ata_dev_usdc,
    clockwork_thread_pda,
    ctx.wallet.publicKey,
    [],
    DecimalUtil.toU64(amount_in.mul(100), devUSDC.decimals),
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
      ...swap_ix.instructions,
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
