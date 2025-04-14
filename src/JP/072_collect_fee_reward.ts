import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil, PoolUtil, WhirlpoolIx
} from "@orca-so/whirlpools-sdk";
import {
  Instruction, EMPTY_INSTRUCTION, resolveOrCreateATA,
  TransactionBuilder
} from "@orca-so/common-sdk";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

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
  const position_mint = position.getData().positionMint;
  const position_mint_program_id = position.getPositionMintTokenProgramId();
  const position_token_account = getAssociatedTokenAddressSync(position_mint, position_owner, false, position_mint_program_id);
  const whirlpool_pubkey = position.getData().whirlpool;
  const whirlpool = await client.getPool(whirlpool_pubkey);
  const token_a = whirlpool.getTokenAInfo();
  const token_b = whirlpool.getTokenBInfo();

  // TickArray および Tick の取得
  const tick_spacing = whirlpool.getData().tickSpacing;
  const tick_array_lower_pubkey = PDAUtil.getTickArrayFromTickIndex(position.getData().tickLowerIndex, tick_spacing, whirlpool_pubkey, ctx.program.programId).publicKey;
  const tick_array_upper_pubkey = PDAUtil.getTickArrayFromTickIndex(position.getData().tickUpperIndex, tick_spacing, whirlpool_pubkey, ctx.program.programId).publicKey;

  // フィーやリワードの受け取りに必要なトークンアカウントを作成
  // 受け取るトークンのミントアドレスを収集
  const tokens_to_be_collected = new Set<string>();
  tokens_to_be_collected.add(token_a.mint.toBase58());
  tokens_to_be_collected.add(token_b.mint.toBase58());
  whirlpool.getData().rewardInfos.map((reward_info) => {
    if (PoolUtil.isRewardInitialized(reward_info)) {
      tokens_to_be_collected.add(reward_info.mint.toBase58());
    }
  });

  // トークンアカウントのアドレス取得および存在しない場合の作成命令を取得
  const required_ta_ix: Instruction[] = [];
  const token_account_map = new Map<string, { token_account: PublicKey; token_program: PublicKey }>();
  for (let mint_b58 of tokens_to_be_collected) {
    const mint = new PublicKey(mint_b58);
    // 存在する場合は ix は EMPTY_INSTRUCTION
    const { address, ...ix } = await resolveOrCreateATA(
      ctx.connection,
      position_owner,
      mint,
      () => ctx.fetcher.getAccountRentExempt()
    );
    required_ta_ix.push(ix);
    token_account_map.set(mint_b58, { token_account: address, token_program: ix.tokenProgram });
  }

  // フィーやリワードの情報を最新化する命令を作成
  const update_fee_and_rewards_ix = WhirlpoolIx.updateFeesAndRewardsIx(
    ctx.program, 
    {
      whirlpool: position.getData().whirlpool,
      position: position_pubkey,
      tickArrayLower: tick_array_lower_pubkey,
      tickArrayUpper: tick_array_upper_pubkey,
    }
  );

  // フィー回収の命令を作成
  const token_account_a = token_account_map.get(token_a.mint.toBase58());
  const token_account_b = token_account_map.get(token_b.mint.toBase58());
  const collect_fees_ix = WhirlpoolIx.collectFeesV2Ix(
    ctx.program,
    {
      whirlpool: whirlpool_pubkey,
      position: position_pubkey,
      positionAuthority: position_owner,
      positionTokenAccount: position_token_account,
      tokenMintA: whirlpool.getData().tokenMintA,
      tokenMintB: whirlpool.getData().tokenMintB,
      tokenOwnerAccountA: token_account_a.token_account,
      tokenOwnerAccountB: token_account_b.token_account,
      tokenProgramA: token_account_a.token_program,
      tokenProgramB: token_account_b.token_program,
      tokenVaultA: whirlpool.getData().tokenVaultA,
      tokenVaultB: whirlpool.getData().tokenVaultB,
    }
  );

  // リワード回収の命令を作成
  const collect_reward_ix = [EMPTY_INSTRUCTION, EMPTY_INSTRUCTION, EMPTY_INSTRUCTION];
  for (let i = 0; i < whirlpool.getData().rewardInfos.length; i++) {
    const reward_info = whirlpool.getData().rewardInfos[i];
    if (!PoolUtil.isRewardInitialized(reward_info)) continue;

    const reward_account = token_account_map.get(reward_info.mint.toBase58());
    collect_reward_ix[i] = WhirlpoolIx.collectRewardV2Ix(
      ctx.program,
      {
        whirlpool: whirlpool_pubkey,
        position: position_pubkey,
        positionAuthority: position_owner,
        positionTokenAccount: position_token_account,
        rewardIndex: i,
        rewardMint: reward_info.mint,
        rewardOwnerAccount: reward_account.token_account,
        rewardTokenProgram: reward_account.token_program,
        rewardVault: reward_info.vault,
      }
    );
  }

  // トランザクション組み立て
  const tx_builder = new TransactionBuilder(ctx.connection, ctx.wallet);

  // トークンアカウント作成
  required_ta_ix.map((ix) => tx_builder.addInstruction(ix));

  // 更新&フィー回収&リワード回収
  tx_builder
    .addInstruction(update_fee_and_rewards_ix)
    .addInstruction(collect_fees_ix)
    .addInstruction(collect_reward_ix[0])
    .addInstruction(collect_reward_ix[1])
    .addInstruction(collect_reward_ix[2]);

  // トランザクションを送信
  const signature = await tx_builder.buildAndExecute();
  console.log("signature:", signature);

  // トランザクション完了待ち
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({ signature, ...latest_blockhash }, "confirmed");
}

main();
