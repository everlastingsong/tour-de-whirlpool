import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil, IGNORE_CACHE, PositionBundleUtil, decreaseLiquidityQuoteByLiquidityWithParams,
  TokenExtensionUtil
} from "@orca-so/whirlpools-sdk";
import { DecimalUtil, Percentage, TransactionBuilder } from "@orca-so/common-sdk";
import { BN } from "bn.js";

// スクリプト実行前に環境変数定義が必要です
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json
// WHIRLPOOL_POSITION_BUNDLE=address_of_position_bundle

async function main() {
  // WhirlpoolClient 作成
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  // トークン定義
  // devToken specification
  // https://everlastingsong.github.io/nebula/
  const devUSDC = {mint: new PublicKey("BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k"), decimals: 6};
  const devSAMO = {mint: new PublicKey("Jd4M8bfJG3sAkd82RsGWyEXoaBXQP7njFzBwEaCTuDa"), decimals: 9};

  // 環境変数 WHIRLPOOL_POSITION_BUNDLE から PositionBundle のアドレスを読み込み
  const position_bundle_address = process.env.WHIRLPOOL_POSITION_BUNDLE;
  const position_bundle_pubkey = new PublicKey(position_bundle_address);
  console.log("position bundle address:", position_bundle_pubkey.toBase58());

  // PositionBundle アカウントを取得
  const position_bundle = await ctx.fetcher.getPositionBundle(position_bundle_pubkey, IGNORE_CACHE);

  // PositionBundle における使用中の bundle index を取得
  const occupied_bundle_indexes = PositionBundleUtil.getOccupiedBundleIndexes(position_bundle);
  console.log("occupied bundle indexes (first 10):", occupied_bundle_indexes.slice(0, 10));

  // PositionBundle で管理するポジションのアドレスを 2 個取得
  const bundled_position_one_pda = PDAUtil.getBundledPosition(ctx.program.programId, position_bundle.positionBundleMint, occupied_bundle_indexes[0]);
  const bundled_position_two_pda = PDAUtil.getBundledPosition(ctx.program.programId, position_bundle.positionBundleMint, occupied_bundle_indexes[1]);
  console.log(`bundled position one (${occupied_bundle_indexes[0]}) pubkey:`, bundled_position_one_pda.publicKey.toBase58());
  console.log(`bundled position two (${occupied_bundle_indexes[1]}) pubkey:`, bundled_position_two_pda.publicKey.toBase58());

  // ポジション・プール取得
  const position_one = await client.getPosition(bundled_position_one_pda.publicKey);
  const whirlpool_one = await client.getPool(position_one.getData().whirlpool);
  const position_two = await client.getPosition(bundled_position_two_pda.publicKey);
  const whirlpool_two = await client.getPool(position_two.getData().whirlpool);

  // 引き出す流動性を割合で指定 (30%)
  const liquidity_one = position_one.getData().liquidity;
  const delta_liquidity_one = liquidity_one.mul(new BN(30)).div(new BN(100));
  const liquidity_two = position_two.getData().liquidity;
  const delta_liquidity_two = liquidity_two.mul(new BN(30)).div(new BN(100));

  console.log("liquidity one:", liquidity_one.toString());
  console.log("delta_liquidity one:", delta_liquidity_one.toString());
  console.log("liquidity two:", liquidity_two.toString());
  console.log("delta_liquidity two:", delta_liquidity_two.toString());

  // 許容するスリッページを設定
  const slippage = Percentage.fromFraction(10, 1000); // 1%

  // 見積もりを取得
  const whirlpool_data_one = whirlpool_one.getData();
  const token_a_one = whirlpool_one.getTokenAInfo();
  const token_b_one = whirlpool_one.getTokenBInfo();
  const quote_one = decreaseLiquidityQuoteByLiquidityWithParams({
    sqrtPrice: whirlpool_data_one.sqrtPrice,
    tickCurrentIndex: whirlpool_data_one.tickCurrentIndex,
    tickLowerIndex: position_one.getData().tickLowerIndex,
    tickUpperIndex: position_one.getData().tickUpperIndex,
    liquidity: delta_liquidity_one,
    slippageTolerance: slippage,
    tokenExtensionCtx: await TokenExtensionUtil.buildTokenExtensionContext(ctx.fetcher, whirlpool_data_one),
  });

  const whirlpool_data_two = whirlpool_two.getData();
  const token_a_two = whirlpool_two.getTokenAInfo();
  const token_b_two = whirlpool_two.getTokenBInfo();
  const quote_two = decreaseLiquidityQuoteByLiquidityWithParams({
    sqrtPrice: whirlpool_data_two.sqrtPrice,
    tickCurrentIndex: whirlpool_data_two.tickCurrentIndex,
    tickLowerIndex: position_two.getData().tickLowerIndex,
    tickUpperIndex: position_two.getData().tickUpperIndex,
    liquidity: delta_liquidity_two,
    slippageTolerance: slippage,
    tokenExtensionCtx: await TokenExtensionUtil.buildTokenExtensionContext(ctx.fetcher, whirlpool_data_two),
  });

  // 見積もり結果表示
  console.log("devSAMO min output one:", DecimalUtil.fromBN(quote_one.tokenMinA, token_a_one.decimals).toFixed(token_a_one.decimals));
  console.log("devUSDC min output one:", DecimalUtil.fromBN(quote_one.tokenMinB, token_b_one.decimals).toFixed(token_b_one.decimals));
  console.log("devSAMO min output two:", DecimalUtil.fromBN(quote_two.tokenMinA, token_a_two.decimals).toFixed(token_a_two.decimals));
  console.log("devUSDC min output two:", DecimalUtil.fromBN(quote_two.tokenMinB, token_b_two.decimals).toFixed(token_b_two.decimals));

  // トランザクション実行前の流動性を表示
  console.log("liquidity(before) one:", position_one.getData().liquidity.toString());
  console.log("liquidity(before) two:", position_two.getData().liquidity.toString());

  // トランザクションを作成 (BundledPosition も作成後は通常のポジションと同じ方法で操作可能)
  const decrease_liquidity_tx_one = await position_one.decreaseLiquidity(quote_one);
  const decrease_liquidity_tx_two = await position_two.decreaseLiquidity(quote_two);

  // トランザクション組み立て
  const tx_builder = new TransactionBuilder(ctx.connection, ctx.wallet);
  tx_builder
    .addInstruction(decrease_liquidity_tx_one.compressIx(true))
    .addInstruction(decrease_liquidity_tx_two.compressIx(true));

  // トランザクションを送信
  const signature = await tx_builder.buildAndExecute();
  console.log("signature:", signature);

  // トランザクション完了待ち
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({signature, ...latest_blockhash}, "confirmed");

  // トランザクション実行後の流動性を表示
  console.log("liquidity(after) one:", (await position_one.refreshData()).liquidity.toString());
  console.log("liquidity(after) two:", (await position_two.refreshData()).liquidity.toString());
}

main();
