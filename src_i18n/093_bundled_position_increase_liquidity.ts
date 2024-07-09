import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil, increaseLiquidityQuoteByInputTokenWithParams, IGNORE_CACHE, PositionBundleUtil,
  TokenExtensionUtil
} from "@orca-so/whirlpools-sdk";
import { DecimalUtil, Percentage, TransactionBuilder } from "@orca-so/common-sdk";
import Decimal from "decimal.js";

//LANG:JP スクリプト実行前に環境変数定義が必要です
//LANG:EN Environment variables must be defined before script execution
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json
// WHIRLPOOL_POSITION_BUNDLE=address_of_position_bundle

async function main() {
  //LANG:JP WhirlpoolClient 作成
  //LANG:EN Create WhirlpoolClient
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  //LANG:JP トークン定義
  //LANG:EN Token definition
  // devToken specification
  // https://everlastingsong.github.io/nebula/
  const devUSDC = {mint: new PublicKey("BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k"), decimals: 6};
  const devSAMO = {mint: new PublicKey("Jd4M8bfJG3sAkd82RsGWyEXoaBXQP7njFzBwEaCTuDa"), decimals: 9};

  //LANG:JP 環境変数 WHIRLPOOL_POSITION_BUNDLE から PositionBundle のアドレスを読み込み
  //LANG:EN Retrieve the position bundle address from the WHIRLPOOL_POSITION_BUNDLE environment variable
  const position_bundle_address = process.env.WHIRLPOOL_POSITION_BUNDLE;
  const position_bundle_pubkey = new PublicKey(position_bundle_address);
  console.log("position bundle address:", position_bundle_pubkey.toBase58());

  //LANG:JP PositionBundle アカウントを取得
  //LANG:EN Get PositionBundle account
  const position_bundle = await ctx.fetcher.getPositionBundle(position_bundle_pubkey, IGNORE_CACHE);

  //LANG:JP PositionBundle における使用中の bundle index を取得
  //LANG:EN Get the bundle index in use in PositionBundle
  const occupied_bundle_indexes = PositionBundleUtil.getOccupiedBundleIndexes(position_bundle);
  console.log("occupied bundle indexes (first 10):", occupied_bundle_indexes.slice(0, 10));

  //LANG:JP PositionBundle で管理するポジションのアドレスを 2 個取得
  //LANG:EN Get two addresses of positions managed by PositionBundle
  const bundled_position_one_pda = PDAUtil.getBundledPosition(ctx.program.programId, position_bundle.positionBundleMint, occupied_bundle_indexes[0]);
  const bundled_position_two_pda = PDAUtil.getBundledPosition(ctx.program.programId, position_bundle.positionBundleMint, occupied_bundle_indexes[1]);
  console.log(`bundled position one (${occupied_bundle_indexes[0]}) pubkey:`, bundled_position_one_pda.publicKey.toBase58());
  console.log(`bundled position two (${occupied_bundle_indexes[1]}) pubkey:`, bundled_position_two_pda.publicKey.toBase58());

  //LANG:JP ポジション・プール取得
  //LANG:EN Get the positions and the pools to which the positions belong
  const position_one = await client.getPosition(bundled_position_one_pda.publicKey);
  const whirlpool_one = await client.getPool(position_one.getData().whirlpool);
  const position_two = await client.getPosition(bundled_position_two_pda.publicKey);
  const whirlpool_two = await client.getPool(position_two.getData().whirlpool);

  //LANG:JP 追加デポジットするトークンの量、許容するスリッページを設定
  //LANG:EN Set amount of tokens to deposit and acceptable slippage
  const dev_usdc_amount_one = DecimalUtil.toBN(new Decimal("1" /* devUSDC */), devUSDC.decimals);
  const dev_usdc_amount_two = DecimalUtil.toBN(new Decimal("2" /* devUSDC */), devUSDC.decimals);
  const slippage = Percentage.fromFraction(10, 1000); // 1%

  //LANG:JP 見積もりを取得
  //LANG:EN Obtain deposit estimation
  const whirlpool_data_one = whirlpool_one.getData();
  const token_a_one = whirlpool_one.getTokenAInfo();
  const token_b_one = whirlpool_one.getTokenBInfo();
  const quote_one = increaseLiquidityQuoteByInputTokenWithParams({
    tokenMintA: token_a_one.mint,
    tokenMintB: token_b_one.mint,
    sqrtPrice: whirlpool_data_one.sqrtPrice,
    tickCurrentIndex: whirlpool_data_one.tickCurrentIndex,
    tickLowerIndex: position_one.getData().tickLowerIndex,
    tickUpperIndex: position_one.getData().tickUpperIndex,
    inputTokenMint: devUSDC.mint,
    inputTokenAmount: dev_usdc_amount_one,
    slippageTolerance: slippage,
    tokenExtensionCtx: await TokenExtensionUtil.buildTokenExtensionContext(ctx.fetcher, whirlpool_data_one),
  });

  const whirlpool_data_two = whirlpool_two.getData();
  const token_a_two = whirlpool_two.getTokenAInfo();
  const token_b_two = whirlpool_two.getTokenBInfo();
  const quote_two = increaseLiquidityQuoteByInputTokenWithParams({
    tokenMintA: token_a_two.mint,
    tokenMintB: token_b_two.mint,
    sqrtPrice: whirlpool_data_two.sqrtPrice,
    tickCurrentIndex: whirlpool_data_two.tickCurrentIndex,
    tickLowerIndex: position_two.getData().tickLowerIndex,
    tickUpperIndex: position_two.getData().tickUpperIndex,
    inputTokenMint: devUSDC.mint,
    inputTokenAmount: dev_usdc_amount_two,
    slippageTolerance: slippage,
    tokenExtensionCtx: await TokenExtensionUtil.buildTokenExtensionContext(ctx.fetcher, whirlpool_data_two),
  });

  //LANG:JP 見積もり結果表示
  //LANG:EN Output the estimation
  console.log("devSAMO max input one:", DecimalUtil.fromBN(quote_one.tokenMaxA, token_a_one.decimals).toFixed(token_a_one.decimals));
  console.log("devUSDC max input one:", DecimalUtil.fromBN(quote_one.tokenMaxB, token_b_one.decimals).toFixed(token_b_one.decimals));
  console.log("devSAMO max input two:", DecimalUtil.fromBN(quote_two.tokenMaxA, token_a_two.decimals).toFixed(token_a_two.decimals));
  console.log("devUSDC max input two:", DecimalUtil.fromBN(quote_two.tokenMaxB, token_b_two.decimals).toFixed(token_b_two.decimals));

  //LANG:JP トランザクション実行前の流動性を表示
  //LANG:EN Output the liquidity before transaction execution
  console.log("liquidity(before) one:", position_one.getData().liquidity.toString());
  console.log("liquidity(before) two:", position_two.getData().liquidity.toString());

  //LANG:JP トランザクションを作成 (BundledPosition も作成後は通常のポジションと同じ方法で操作可能)
  //LANG:EN Create a transaction (After opening BundledPosition, it can be operated in the same way as a normal position)
  const increase_liquidity_tx_one = await position_one.increaseLiquidity(quote_one);
  const increase_liquidity_tx_two = await position_two.increaseLiquidity(quote_two);

  //LANG:JP トランザクション組み立て
  //LANG:EN Create a transaction and add the instruction
  const tx_builder = new TransactionBuilder(ctx.connection, ctx.wallet);
  tx_builder
    .addInstruction(increase_liquidity_tx_one.compressIx(true))
    .addInstruction(increase_liquidity_tx_two.compressIx(true));

  //LANG:JP トランザクションを送信
  //LANG:EN Send the transaction
  const signature = await tx_builder.buildAndExecute();
  console.log("signature:", signature);

  //LANG:JP トランザクション完了待ち
  //LANG:EN Wait for the transaction to complete
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({signature, ...latest_blockhash}, "confirmed");

  //LANG:JP トランザクション実行後の流動性を表示
  //LANG:EN Output the liquidity after transaction execution
  console.log("liquidity(after) one:", (await position_one.refreshData()).liquidity.toString());
  console.log("liquidity(after) two:", (await position_two.refreshData()).liquidity.toString());
}

main();