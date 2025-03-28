import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil, IGNORE_CACHE, PositionBundleUtil, decreaseLiquidityQuoteByLiquidityWithParams, PositionBundleData, WhirlpoolClient, PoolUtil, WhirlpoolIx,
  TokenExtensionUtil
} from "@orca-so/whirlpools-sdk";
import { DecimalUtil, EMPTY_INSTRUCTION, Instruction, Percentage, TransactionBuilder, resolveOrCreateATA } from "@orca-so/common-sdk";
import { BN } from "bn.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

// スクリプト実行前に環境変数定義が必要です
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json
// WHIRLPOOL_POSITION_BUNDLE=address_of_position_bundle

async function close_bundled_position(client: WhirlpoolClient, position_bundle_pubkey: PublicKey, position_bundle: PositionBundleData, bundle_index: number) {
  const ctx = client.getContext();

  const bundled_position_pda = PDAUtil.getBundledPosition(ctx.program.programId, position_bundle.positionBundleMint, bundle_index);
  const bundled_position_pubkey = bundled_position_pda.publicKey;
  console.log(`bundled position (${bundle_index}) pubkey:`, bundled_position_pubkey.toBase58());

  // 許容するスリッページを設定
  const slippage = Percentage.fromFraction(10, 1000); // 1%

  // ポジション・プール取得
  const position = await client.getPosition(bundled_position_pubkey);
  const position_bundle_owner = ctx.wallet.publicKey;
  const position_bundle_token_account = getAssociatedTokenAddressSync(position.getData().positionMint, position_bundle_owner);
  const whirlpool_pubkey = position.getData().whirlpool;
  const whirlpool = await client.getPool(whirlpool_pubkey);
  const whirlpool_data = whirlpool.getData();

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
    if ( PoolUtil.isRewardInitialized(reward_info) ) {
      tokens_to_be_collected.add(reward_info.mint.toBase58());
    }
  });

  // トークンアカウントのアドレス取得および存在しない場合の作成命令を取得
  const required_ta_ix: Instruction[] = [];
  const token_account_map = new Map<string, PublicKey>();
  for ( let mint_b58 of tokens_to_be_collected ) {
    const mint = new PublicKey(mint_b58);
    // 存在する場合は ix は EMPTY_INSTRUCTION
    const {address, ...ix} = await resolveOrCreateATA(
      ctx.connection,
      position_bundle_owner,
      mint,
      () => ctx.fetcher.getAccountRentExempt()
    );
    required_ta_ix.push(ix);
    token_account_map.set(mint_b58, address);
  }

  // フィーやリワードの情報を最新化する命令を作成
  let update_fee_and_rewards_ix = position.getData().liquidity.isZero()
    ? EMPTY_INSTRUCTION
    : WhirlpoolIx.updateFeesAndRewardsIx(
      ctx.program, 
      {
        whirlpool: position.getData().whirlpool,
        position: bundled_position_pubkey,
        tickArrayLower: tick_array_lower_pubkey,
        tickArrayUpper: tick_array_upper_pubkey,
      }
    );

  // フィー回収の命令を作成
  let collect_fees_ix = WhirlpoolIx.collectFeesIx(
    ctx.program,
    {
      whirlpool: whirlpool_pubkey,
      position: bundled_position_pubkey,
      positionAuthority: position_bundle_owner,
      positionTokenAccount: position_bundle_token_account,
      tokenOwnerAccountA: token_account_map.get(token_a.mint.toBase58()),
      tokenOwnerAccountB: token_account_map.get(token_b.mint.toBase58()),
      tokenVaultA: whirlpool.getData().tokenVaultA,
      tokenVaultB: whirlpool.getData().tokenVaultB,
    }
  );

  // リワード回収の命令を作成
  const collect_reward_ix = [EMPTY_INSTRUCTION, EMPTY_INSTRUCTION, EMPTY_INSTRUCTION];
  for (let i=0; i<whirlpool.getData().rewardInfos.length; i++) {
    const reward_info = whirlpool.getData().rewardInfos[i];
    if ( !PoolUtil.isRewardInitialized(reward_info) ) continue;

    collect_reward_ix[i] = WhirlpoolIx.collectRewardIx(
      ctx.program,
      {
        whirlpool: whirlpool_pubkey,
        position: bundled_position_pubkey,
        positionAuthority: position_bundle_owner,
        positionTokenAccount: position_bundle_token_account,
        rewardIndex: i,
        rewardOwnerAccount: token_account_map.get(reward_info.mint.toBase58()),
        rewardVault: reward_info.vault,
      }
    );
  }

  // 引き出せるトークン量を取得
  const quote = decreaseLiquidityQuoteByLiquidityWithParams({
    sqrtPrice: whirlpool_data.sqrtPrice,
    tickCurrentIndex: whirlpool_data.tickCurrentIndex,
    tickLowerIndex: position.getData().tickLowerIndex,
    tickUpperIndex: position.getData().tickUpperIndex,
    liquidity: position.getData().liquidity,
    slippageTolerance: slippage,
    tokenExtensionCtx: await TokenExtensionUtil.buildTokenExtensionContext(ctx.fetcher, whirlpool_data),
  });

  // 見積もり結果表示
  console.log("devSAMO min output:", DecimalUtil.fromBN(quote.tokenMinA, token_a.decimals).toFixed(token_a.decimals));
  console.log("devUSDC min output:", DecimalUtil.fromBN(quote.tokenMinB, token_b.decimals).toFixed(token_b.decimals));
  // 流動性を引き出す命令を作成
  const decrease_liquidity_ix = position.getData().liquidity.isZero()
    ? EMPTY_INSTRUCTION
    : WhirlpoolIx.decreaseLiquidityIx(
      ctx.program,
      {
        ...quote,
        whirlpool: whirlpool_pubkey,
        position: bundled_position_pubkey,
        positionAuthority: position_bundle_owner,
        positionTokenAccount: position_bundle_token_account,
        tokenOwnerAccountA: token_account_map.get(token_a.mint.toBase58()),
        tokenOwnerAccountB: token_account_map.get(token_b.mint.toBase58()),
        tokenVaultA: whirlpool.getData().tokenVaultA,
        tokenVaultB: whirlpool.getData().tokenVaultB,
        tickArrayLower: tick_array_lower_pubkey,
        tickArrayUpper: tick_array_upper_pubkey,
      }
    );

  // PositionBundle で管理するポジションをクローズする命令を作成
  const close_bundled_position_ix = WhirlpoolIx.closeBundledPositionIx(
    ctx.program,
    {
      bundledPosition: bundled_position_pubkey,
      positionBundleAuthority: position_bundle_owner,
      positionBundleTokenAccount: position_bundle_token_account,
      positionBundle: position_bundle_pubkey,
      bundleIndex: bundle_index,
      receiver: position_bundle_owner,
    }
  );

  // トランザクション組み立て
  const tx_builder = new TransactionBuilder(ctx.connection, ctx.wallet);
  // トークンアカウント作成
  required_ta_ix.map((ix) => tx_builder.addInstruction(ix));
  tx_builder
    // 更新&フィー回収&リワード回収
    .addInstruction(update_fee_and_rewards_ix)
    .addInstruction(collect_fees_ix)
    .addInstruction(collect_reward_ix[0])
    .addInstruction(collect_reward_ix[1])
    .addInstruction(collect_reward_ix[2])
    // 流動性引き出し
    .addInstruction(decrease_liquidity_ix)
    // クローズ・ポジション
    .addInstruction(close_bundled_position_ix);

  // トランザクションを送信
  const signature = await tx_builder.buildAndExecute();
  console.log("signature:", signature);

  // トランザクション完了待ち
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({signature, ...latest_blockhash}, "confirmed");
}

async function main() {
  // WhirlpoolClient 作成
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  // 環境変数 WHIRLPOOL_POSITION_BUNDLE から PositionBundle のアドレスを読み込み
  const position_bundle_address = process.env.WHIRLPOOL_POSITION_BUNDLE;
  const position_bundle_pubkey = new PublicKey(position_bundle_address);
  console.log("position bundle address:", position_bundle_pubkey.toBase58());

  // PositionBundle アカウントを取得
  const position_bundle_pre = await ctx.fetcher.getPositionBundle(position_bundle_pubkey, IGNORE_CACHE);

  // PositionBundle における使用中の bundle index を取得
  const occupied_bundle_indexes_pre = PositionBundleUtil.getOccupiedBundleIndexes(position_bundle_pre);
  console.log("occupied bundle indexes(pre):", occupied_bundle_indexes_pre);

  for (const index of occupied_bundle_indexes_pre) {
    await close_bundled_position(client, position_bundle_pubkey, position_bundle_pre, index);
  }

  // PositionBundle アカウントを再取得
  const position_bundle_post = await ctx.fetcher.getPositionBundle(position_bundle_pubkey, IGNORE_CACHE);

  // PositionBundle における使用中の bundle index を取得
  const occupied_bundle_indexes_post = PositionBundleUtil.getOccupiedBundleIndexes(position_bundle_post);
  console.log("occupied bundle indexes(post):", occupied_bundle_indexes_post);
}

main();
