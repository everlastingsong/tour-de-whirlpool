import { PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { DecimalUtil, Percentage } from "@orca-so/common-sdk";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil, swapQuoteByInputToken, IGNORE_CACHE
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
  const DEVNET_WHIRLPOOLS_CONFIG = new PublicKey("FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR");

  //LANG:JP devSAMO/devUSDC プール取得
  //LANG:EN Get devSAMO/devUSDC whirlpool
  //LANG:JP Whirlpool のプールは (プログラム, Config, 1個目のトークンのミントアドレス, 2個目のトークンのミントアドレス, ティックスペース)
  //LANG:JP の 5 要素で特定されます (DBで考えると5列の複合プライマリキーです)
  //LANG:EN Whirlpools are identified by 5 elements (Program, Config, mint address of the 1st token,
  //LANG:EN mint address of the 2nd token, tick spacing), similar to the 5 column compound primary key in DB
  const tick_spacing = 64;
  const whirlpool_pubkey = PDAUtil.getWhirlpool(
      ORCA_WHIRLPOOL_PROGRAM_ID,
      DEVNET_WHIRLPOOLS_CONFIG,
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
    DecimalUtil.toBN(amount_in, devUSDC.decimals),
    //LANG:JP 許容するスリッページ (10/1000 = 1%)
    //LANG:EN Acceptable slippage (10/1000 = 1%)
    Percentage.fromFraction(10, 1000),
    ctx.program.programId,
    ctx.fetcher,
    IGNORE_CACHE,
  );

  //LANG:JP 見積もり結果表示
  //LANG:EN Output the estimation
  console.log("estimatedAmountIn:", DecimalUtil.fromBN(quote.estimatedAmountIn, devUSDC.decimals).toString(), "devUSDC");
  console.log("estimatedAmountOut:", DecimalUtil.fromBN(quote.estimatedAmountOut, devSAMO.decimals).toString(), "devSAMO");
  console.log("otherAmountThreshold:", DecimalUtil.fromBN(quote.otherAmountThreshold, devSAMO.decimals).toString(), "devSAMO");

  //LANG:JP プライオリティ・フィーを追加する命令を作成
  //LANG:EN Create instructions to add priority fee
  const estimated_compute_units = 300_000; // ~ 1_400_000 CU
  const additional_fee_in_lamports = 10_000; // 0.00001 SOL

  const setComputeUnitPriceIx = ComputeBudgetProgram.setComputeUnitPrice({
    //LANG:JP プライオリティ・フィーは 1 CU に対して何 micro lamports 追加で支払うか指定する
    //LANG:EN Specify how many micro lamports to pay in addition for 1 CU
    microLamports: Math.floor((additional_fee_in_lamports * 1_000_000) / estimated_compute_units),
  });
  const set_compute_unit_limit_ix = ComputeBudgetProgram.setComputeUnitLimit({
    //LANG:JP Solana のネットワーク手数料をトランザクション開始時に確定するために CU を明示的に指定する
    //LANG:JP 指定しない場合自動で計算されるが、多く見積もられても返金されないため指定することがほとんど
    //LANG:EN To determine the Solana network fee at the start of the transaction, explicitly specify CU
    //LANG:EN If not specified, it will be calculated automatically. But it is almost always specified
    //LANG:EN because even if it is estimated to be large, it will not be refunded
    units: estimated_compute_units,
  });

  //LANG:JP トランザクションの先頭に命令を追加
  //LANG:EN Add instructions to the beginning of the transaction
  const tx = await whirlpool.swap(quote);
  tx.prependInstruction({
    instructions: [set_compute_unit_limit_ix, setComputeUnitPriceIx],
    cleanupInstructions: [],
    signers: [],
  });

  //LANG:JP トランザクションを送信
  //LANG:EN Send the transaction
  const signature = await tx.buildAndExecute();
  console.log("signature:", signature);

  //LANG:JP トランザクション完了待ち
  //LANG:EN Wait for the transaction to complete
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({signature, ...latest_blockhash}, "confirmed");
}

main();