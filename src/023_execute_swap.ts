import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@project-serum/anchor";
import { DecimalUtil, Percentage } from "@orca-so/common-sdk";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil, swapQuoteByInputToken
} from "@orca-so/whirlpools-sdk";
import Decimal from "decimal.js";

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
  // devToken specification
  // https://everlastingsong.github.io/nebula/
  const devUSDC = {mint: new PublicKey("BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k"), decimals: 6};
  const devSAMO = {mint: new PublicKey("Jd4M8bfJG3sAkd82RsGWyEXoaBXQP7njFzBwEaCTuDa"), decimals: 9};

  // Whirlpool の Config アカウント
  // devToken ecosystem / Orca Whirlpools
  const NEBULA_WHIRLPOOLS_CONFIG = new PublicKey("FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR");

  // devSAMO/devUSDC プール取得
  // Whirlpool のプールは (プログラム, Config, 1個目のトークンのミントアドレス, 2個目のトークンのミントアドレス, ティックスペース)
  // の 5 要素で特定されます (DBで考えると5列の複合プライマリキーです)
  const tick_spacing = 64;
  const whirlpool_pubkey = PDAUtil.getWhirlpool(
      ORCA_WHIRLPOOL_PROGRAM_ID,
      NEBULA_WHIRLPOOLS_CONFIG,
      devSAMO.mint, devUSDC.mint, tick_spacing).publicKey;
  console.log("whirlpool_key:", whirlpool_pubkey.toBase58());
  const whirlpool = await client.getPool(whirlpool_pubkey);

  // 1 devUSDC トークンを devSAMO にスワップします
  const amount_in = new Decimal("1" /* devUSDC */);

  // スワップの見積もり取得(シミュレーション実行)
  const quote = await swapQuoteByInputToken(
    whirlpool,
    // 入力するトークン
    devUSDC.mint,
    DecimalUtil.toU64(amount_in, devUSDC.decimals),
    // 許容するスリッページ (10/1000 = 1%)
    Percentage.fromFraction(10, 1000),
    ctx.program.programId,
    ctx.fetcher,
    true
  );

  // 見積もり結果表示
  console.log("estimatedAmountIn:", DecimalUtil.fromU64(quote.estimatedAmountIn, devUSDC.decimals).toString(), "devUSDC");
  console.log("estimatedAmountOut:", DecimalUtil.fromU64(quote.estimatedAmountOut, devSAMO.decimals).toString(), "devSAMO");
  console.log("otherAmountThreshold:", DecimalUtil.fromU64(quote.otherAmountThreshold, devSAMO.decimals).toString(), "devSAMO");

  // トランザクションを送信
  const tx = await whirlpool.swap(quote);
  const signature = await tx.buildAndExecute();
  console.log("signature:", signature);

  // トランザクション完了待ち
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({signature, ...latest_blockhash}, "confirmed");
}

main();