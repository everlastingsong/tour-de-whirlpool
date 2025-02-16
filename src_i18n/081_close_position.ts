import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID } from "@orca-so/whirlpools-sdk";
import { Percentage } from "@orca-so/common-sdk";

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

  //LANG:JP 許容するスリッページを設定
  //LANG:EN Set acceptable slippage
  const slippage = Percentage.fromFraction(10, 1000); // 1%

  //LANG:JP ポジション・プール取得
  //LANG:EN Get the position and the pool to which the position belongs
  const position = await client.getPosition(position_pubkey);
  const whirlpool_pubkey = position.getData().whirlpool;
  const whirlpool = await client.getPool(whirlpool_pubkey);
  const close_position_tx = await whirlpool.closePosition(position_pubkey, slippage);

  //LANG:JP トランザクションを送信
  //LANG:JP Close は手数料やリワードの回収など必要な処理を多く含むため、2つ以上のトランザクションに分割される場合があります。
  //LANG:JP ただし、多くの場合は1つのトランザクションであることを期待できます。
  //LANG:EN Send the transaction
  //LANG:EN Since Close includes various necessary processes such as fee and reward collection, it may be split into two or more transactions.
  //LANG:EN However, in most cases, you can expect it to be a single transaction.
  for (const tx of close_position_tx) {
    const signature = await tx.buildAndExecute();
    console.log("signature:", signature);

    //LANG:JP トランザクション完了待ち
    //LANG:EN Wait for the transaction to complete
    const latest_blockhash = await ctx.connection.getLatestBlockhash();
    await ctx.connection.confirmTransaction({ signature, ...latest_blockhash }, "confirmed");
  }
}

main();