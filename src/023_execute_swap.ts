import { PublicKey } from "@solana/web3.js";
import { Provider } from "@project-serum/anchor";
import { DecimalUtil, Percentage } from "@orca-so/common-sdk";
import {
  WhirlpoolContext, AccountFetcher, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil, PoolUtil, swapQuoteWithParams
} from "@orca-so/whirlpools-sdk";
import Decimal from "decimal.js";

// スクリプト実行前に環境変数定義が必要です
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json

async function main() {
  // WhirlpoolClient 作成
  const provider = Provider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const fetcher = new AccountFetcher(ctx.connection);
  const client = buildWhirlpoolClient(ctx, fetcher);

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

  // 1個目のトークンを a、2個目のトークンを b としているため a_to_b = true は devSAMO >> devUSDC 方向のスワップ
  // devSAMO << devUSDC 方向のため false にする
  const a_to_b = false;

  // スワップをシミュレーションするために必要なアカウントを取得
  const whirlpool_data = await whirlpool.getData();
  const tick_array_address = PoolUtil.getTickArrayPublicKeysForSwap(
      whirlpool_data.tickCurrentIndex,
      whirlpool_data.tickSpacing,
      a_to_b,
      ctx.program.programId,
      whirlpool_pubkey
  );
  const tick_array_sequence_data = await fetcher.listTickArrays(tick_array_address, true);

  // スワップの見積もり取得(シミュレーション実行)
  const quote = swapQuoteWithParams({
    // スワップの方向
    aToB: a_to_b,
    // 入力するトークン
    amountSpecifiedIsInput: true,
    tokenAmount: DecimalUtil.toU64(amount_in, devUSDC.decimals),
    // 許容するスリッページ (10/1000 = 1%)
    slippageTolerance: Percentage.fromFraction(10, 1000),
    // シミュレーションに使うデータやアカウント
    whirlpoolData: whirlpool_data,
    tickArrayAddresses: tick_array_address,
    tickArrays: tick_array_sequence_data,
  });

  // 見積もり結果表示
  console.log("estimatedAmountIn:", DecimalUtil.fromU64(quote.estimatedAmountIn, devUSDC.decimals).toString(), "devUSDC");
  console.log("estimatedAmountOut:", DecimalUtil.fromU64(quote.estimatedAmountOut, devSAMO.decimals).toString(), "devSAMO");
  console.log("otherAmountThreshold:", DecimalUtil.fromU64(quote.otherAmountThreshold, devSAMO.decimals).toString(), "devSAMO");

  // トランザクションを送信
  const tx = await whirlpool.swap(quote);
  const signature = await tx.buildAndExecute();
  console.log("signature:", signature);

  // トランザクション完了待ち
  await ctx.connection.confirmTransaction(signature, "confirmed");
}

main();