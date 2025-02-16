import { PublicKey } from "@solana/web3.js";
import { AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  decreaseLiquidityQuoteByLiquidityWithParams,
  TokenExtensionUtil
} from "@orca-so/whirlpools-sdk";
import { DecimalUtil, Percentage } from "@orca-so/common-sdk";

//LANG:JP スクリプト実行前に環境変数定義が必要です
//LANG:EN Environment variables must be defined before script execution
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json
// WHIRLPOOL_POSITION=address_of_position

async function main() {
  //LANG:JP WhirlpoolClient 作成
  //LANG:EN Create WhirlpoolClient
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  //LANG:JP 環境変数 WHIRLPOOL_POSITION からポジションのアドレスを読み込み
  //LANG:EN Retrieve the position address from the WHIRLPOOL_POSITION environment variable
  const position_address = process.env.WHIRLPOOL_POSITION;
  const position_pubkey = new PublicKey(position_address);
  console.log("position address:", position_pubkey.toBase58());

  //LANG:JP ポジション・プール取得
  //LANG:EN Get the position and the pool to which the position belongs
  const position = await client.getPosition(position_pubkey);
  const whirlpool = await client.getPool(position.getData().whirlpool);

  //LANG:JP 引き出す流動性を割合で指定 (30%)
  //LANG:EN Set the percentage of liquidity to be withdrawn (30%)
  const liquidity = position.getData().liquidity;
  const delta_liquidity = liquidity.mul(new BN(30)).div(new BN(100));

  console.log("liquidity:", liquidity.toString());
  console.log("delta_liquidity:", delta_liquidity.toString());

  //LANG:JP 許容するスリッページを設定
  //LANG:EN Set acceptable slippage
  const slippage = Percentage.fromFraction(10, 1000); // 1%

  //LANG:JP 見積もりを取得
  //LANG:EN Obtain withdraw estimation
  const whirlpool_data = whirlpool.getData();
  const token_a = whirlpool.getTokenAInfo();
  const token_b = whirlpool.getTokenBInfo();
  const quote = decreaseLiquidityQuoteByLiquidityWithParams({
    //LANG:JP プール状態をそのまま渡す
    //LANG:EN Pass the pool state as is
    sqrtPrice: whirlpool_data.sqrtPrice,
    tickCurrentIndex: whirlpool_data.tickCurrentIndex,
    //LANG:JP 価格帯はポジションのものをそのまま渡す
    //LANG:EN Pass the price range of the position as is
    tickLowerIndex: position.getData().tickLowerIndex,
    tickUpperIndex: position.getData().tickUpperIndex,
    //LANG:JP 引き出す流動性
    //LANG:EN Liquidity to be withdrawn
    liquidity: delta_liquidity,
    //LANG:JP スリッページ
    //LANG:EN Acceptable slippage
    slippageTolerance: slippage,
    //LANG:JP TokenExtensions のトークン情報を取得
    //LANG:EN Get token info for TokenExtensions
    tokenExtensionCtx: await TokenExtensionUtil.buildTokenExtensionContext(ctx.fetcher, whirlpool_data),
  });

  //LANG:JP 見積もり結果表示
  //LANG:EN Output the estimation
  console.log("devSAMO min output:", DecimalUtil.fromBN(quote.tokenMinA, token_a.decimals).toFixed(token_a.decimals));
  console.log("devUSDC min output:", DecimalUtil.fromBN(quote.tokenMinB, token_b.decimals).toFixed(token_b.decimals));

  //LANG:JP トランザクション実行前の流動性を表示
  //LANG:EN Output the liquidity before transaction execution
  console.log("liquidity(before):", position.getData().liquidity.toString());

  //LANG:JP トランザクションを作成
  //LANG:EN Create a transaction
  const decrease_liquidity_tx = await position.decreaseLiquidity(quote);

  //LANG:JP トランザクションを送信
  //LANG:EN Send the transaction
  const signature = await decrease_liquidity_tx.buildAndExecute();
  console.log("signature:", signature);

  //LANG:JP トランザクション完了待ち
  //LANG:EN Wait for the transaction to complete
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({ signature, ...latest_blockhash }, "confirmed");

  //LANG:JP トランザクション実行後の流動性を表示
  //LANG:EN Output the liquidity after transaction execution
  console.log("liquidity(after):", (await position.refreshData()).liquidity.toString());
}

main();