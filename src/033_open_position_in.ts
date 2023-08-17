import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil, PriceMath, increaseLiquidityQuoteByInputTokenWithParams
} from "@orca-so/whirlpools-sdk";
import { DecimalUtil, Percentage } from "@orca-so/common-sdk";
import Decimal from "decimal.js";

//LANG:JP スクリプト実行前に環境変数定義が必要です
//LANG:EN Environment variables must be defined before script execution
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json

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

  //LANG:JP Whirlpool の Config アカウント
  //LANG:EN WhirlpoolsConfig account
  // devToken ecosystem / Orca Whirlpools
  const NEBULA_WHIRLPOOLS_CONFIG = new PublicKey("FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR");

  //LANG:JP devSAMO/devUSDC プール取得
  //LANG:EN Get devSAMO/devUSDC whirlpool
  const tick_spacing = 64;
  const whirlpool_pubkey = PDAUtil.getWhirlpool(
      ORCA_WHIRLPOOL_PROGRAM_ID,
      NEBULA_WHIRLPOOLS_CONFIG,
      devSAMO.mint, devUSDC.mint, tick_spacing).publicKey;
  console.log("whirlpool_key:", whirlpool_pubkey.toBase58());
  const whirlpool = await client.getPool(whirlpool_pubkey);

  //LANG:JP プールにおける現在価格を取得
  //LANG:EN Get the current price of the pool
  const sqrt_price_x64 = whirlpool.getData().sqrtPrice;
  const price = PriceMath.sqrtPriceX64ToPrice(sqrt_price_x64, devSAMO.decimals, devUSDC.decimals);
  console.log("price:", price.toFixed(devUSDC.decimals));

  //LANG:JP 価格帯とデポジットするトークンの量、許容するスリッページを設定
  //LANG:EN Set price range, amount of tokens to deposit, and acceptable slippage
  const lower_price = new Decimal("0.005");
  const upper_price = new Decimal("0.02");
  const dev_usdc_amount = DecimalUtil.toBN(new Decimal("1" /* devUSDC */), devUSDC.decimals);
  const slippage = Percentage.fromFraction(10, 1000); // 1%

  //LANG:JP 価格帯を調整 (全ての価格が設定可能ではなく、範囲指定に利用できる価格は決まっている(InitializableTickIndexに対応する価格))
  //LANG:EN Adjust price range (not all prices can be set, only a limited number of prices are available for range specification)
  //LANG:EN (prices corresponding to InitializableTickIndex are available)
  const whirlpool_data = whirlpool.getData();
  const token_a = whirlpool.getTokenAInfo();
  const token_b = whirlpool.getTokenBInfo();
  const lower_tick_index = PriceMath.priceToInitializableTickIndex(lower_price, token_a.decimals, token_b.decimals, whirlpool_data.tickSpacing);
  const upper_tick_index = PriceMath.priceToInitializableTickIndex(upper_price, token_a.decimals, token_b.decimals, whirlpool_data.tickSpacing);
  console.log("lower & upper tick_index", lower_tick_index, upper_tick_index);
  console.log("lower & upper price",
    PriceMath.tickIndexToPrice(lower_tick_index, token_a.decimals, token_b.decimals).toFixed(token_b.decimals),
    PriceMath.tickIndexToPrice(upper_tick_index, token_a.decimals, token_b.decimals).toFixed(token_b.decimals)
  );

  //LANG:JP 見積もりを取得
  //LANG:EN Obtain deposit estimation
  const quote = increaseLiquidityQuoteByInputTokenWithParams({
    //LANG:JP プールの定義や状態をそのまま渡す
    //LANG:EN Pass the pool definition and state
    tokenMintA: token_a.mint,
    tokenMintB: token_b.mint,
    sqrtPrice: whirlpool_data.sqrtPrice,
    tickCurrentIndex: whirlpool_data.tickCurrentIndex,
    //LANG:JP 価格帯
    //LANG:EN Price range
    tickLowerIndex: lower_tick_index,
    tickUpperIndex: upper_tick_index,
    //LANG:JP 入力にするトークン
    //LANG:EN Input token and amount
    inputTokenMint: devUSDC.mint,
    inputTokenAmount: dev_usdc_amount,
    //LANG:JP スリッページ
    //LANG:EN Acceptable slippage
    slippageTolerance: slippage,
  });

  //LANG:JP 見積もり結果表示
  //LANG:EN Output the estimation
  console.log("devSAMO max input", DecimalUtil.fromBN(quote.tokenMaxA, token_a.decimals).toFixed(token_a.decimals));
  console.log("devUSDC max input", DecimalUtil.fromBN(quote.tokenMaxB, token_b.decimals).toFixed(token_b.decimals));

  //LANG:JP トランザクションを作成
  //LANG:EN Create a transaction
  const open_position_tx = await whirlpool.openPositionWithMetadata(
    lower_tick_index,
    upper_tick_index,
    quote
  );

  //LANG:JP トランザクションを送信
  //LANG:EN Send the transaction
  const signature = await open_position_tx.tx.buildAndExecute();
  console.log("signature:", signature);
  console.log("position NFT:", open_position_tx.positionMint.toBase58());

  //LANG:JP トランザクション完了待ち
  //LANG:EN Wait for the transaction to complete
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({signature, ...latest_blockhash}, "confirmed");
}

main();