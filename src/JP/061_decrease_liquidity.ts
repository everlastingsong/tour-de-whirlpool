import { PublicKey } from "@solana/web3.js";
import { AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  decreaseLiquidityQuoteByLiquidityWithParams,
  TokenExtensionUtil
} from "@orca-so/whirlpools-sdk";
import { DecimalUtil, Percentage } from "@orca-so/common-sdk";

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
  const whirlpool = await client.getPool(position.getData().whirlpool);

  // 引き出す流動性を割合で指定 (30%)
  const liquidity = position.getData().liquidity;
  const delta_liquidity = liquidity.mul(new BN(30)).div(new BN(100));

  console.log("liquidity:", liquidity.toString());
  console.log("delta_liquidity:", delta_liquidity.toString());

  // 許容するスリッページを設定
  const slippage = Percentage.fromFraction(10, 1000); // 1%

  // 見積もりを取得
  const whirlpool_data = whirlpool.getData();
  const token_a = whirlpool.getTokenAInfo();
  const token_b = whirlpool.getTokenBInfo();
  const quote = decreaseLiquidityQuoteByLiquidityWithParams({
    // プール状態をそのまま渡す
    sqrtPrice: whirlpool_data.sqrtPrice,
    tickCurrentIndex: whirlpool_data.tickCurrentIndex,
    // 価格帯はポジションのものをそのまま渡す
    tickLowerIndex: position.getData().tickLowerIndex,
    tickUpperIndex: position.getData().tickUpperIndex,
    // 引き出す流動性
    liquidity: delta_liquidity,
    // スリッページ
    slippageTolerance: slippage,
    // TokenExtensions のトークン情報を取得
    tokenExtensionCtx: await TokenExtensionUtil.buildTokenExtensionContext(ctx.fetcher, whirlpool_data),
  });

  // 見積もり結果表示
  console.log("devSAMO min output:", DecimalUtil.fromBN(quote.tokenMinA, token_a.decimals).toFixed(token_a.decimals));
  console.log("devUSDC min output:", DecimalUtil.fromBN(quote.tokenMinB, token_b.decimals).toFixed(token_b.decimals));

  // トランザクション実行前の流動性を表示
  console.log("liquidity(before):", position.getData().liquidity.toString());

  // トランザクションを作成
  const decrease_liquidity_tx = await position.decreaseLiquidity(quote);

  // トランザクションを送信
  const signature = await decrease_liquidity_tx.buildAndExecute();
  console.log("signature:", signature);

  // トランザクション完了待ち
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({signature, ...latest_blockhash}, "confirmed");

  // トランザクション実行後の流動性を表示
  console.log("liquidity(after):", (await position.refreshData()).liquidity.toString());
}

main();
