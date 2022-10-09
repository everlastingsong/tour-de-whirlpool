import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@project-serum/anchor";
import { DecimalUtil, Percentage } from "@orca-so/common-sdk";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil, swapQuoteByInputToken
} from "@orca-so/whirlpools-sdk";
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
  //LANG:JP Whirlpool のプールは (プログラム, Config, 1個目のトークンのミントアドレス, 2個目のトークンのミントアドレス, ティックスペース)
  //LANG:JP の 5 要素で特定されます (DBで考えると5列の複合プライマリキーです)
  //LANG:EN Whirlpools are identified by 5 elements (Program, Config, mint address of the 1st token,
  //LANG:EN mint address of the 2nd token, tick spacing), similar to the 5 column compound primary key in DB
  const tick_spacing = 64;
  const whirlpool_pubkey = PDAUtil.getWhirlpool(
      ORCA_WHIRLPOOL_PROGRAM_ID,
      NEBULA_WHIRLPOOLS_CONFIG,
      devSAMO.mint, devUSDC.mint, tick_spacing).publicKey;
  console.log("whirlpool_key:", whirlpool_pubkey.toBase58());
  const whirlpool = await client.getPool(whirlpool_pubkey);

  //LANG:JP 1 devUSDC トークンを devSAMO にスワップします
  //LANG:EN Swap 1 devUSDC for devSAMO
  const amount_in = new Decimal("1" /* devUSDC */);

  //LANG:JP スワップの見積もり取得(シミュレーション実行)
  //LANG:EN Obtain swap estimation (run simulation)
  const quote = await swapQuoteByInputToken(
    whirlpool,
    //LANG:JP 入力するトークン
    //LANG:EN Input token and amount
    devUSDC.mint,
    DecimalUtil.toU64(amount_in, devUSDC.decimals),
    //LANG:JP 許容するスリッページ (10/1000 = 1%)
    //LANG:EN Acceptable slippage (10/1000 = 1%)
    Percentage.fromFraction(10, 1000),
    ctx.program.programId,
    ctx.fetcher,
    true
  );

  //LANG:JP 見積もり結果表示
  //LANG:EN Output the estimation
  console.log("estimatedAmountIn:", DecimalUtil.fromU64(quote.estimatedAmountIn, devUSDC.decimals).toString(), "devUSDC");
  console.log("estimatedAmountOut:", DecimalUtil.fromU64(quote.estimatedAmountOut, devSAMO.decimals).toString(), "devSAMO");
  console.log("otherAmountThreshold:", DecimalUtil.fromU64(quote.otherAmountThreshold, devSAMO.decimals).toString(), "devSAMO");
}

main();