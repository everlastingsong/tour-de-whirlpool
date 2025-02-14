import { Keypair, Connection } from "@solana/web3.js";
import secret from "../../wallet.json";

const RPC_ENDPOINT_URL = "https://api.devnet.solana.com";
const COMMITMENT = 'confirmed';

async function main() {
  // Devnet の RPC への要求用のコネクションを作成
  const connection = new Connection(RPC_ENDPOINT_URL, COMMITMENT);

  // wallet.json から秘密鍵を読み込み (秘密鍵と公開鍵のペアは Keypair クラスで管理する)
  const keypair = Keypair.fromSecretKey(new Uint8Array(secret));

  // 使用する RPC とウォレットの公開鍵を表示
  // 公開鍵を表示する場合は Base58 形式の文字列で表示する
  console.log("endpoint:", connection.rpcEndpoint);
  console.log("wallet pubkey:", keypair.publicKey.toBase58());

  // トランザクションを送信
  const signature = await connection.requestAirdrop(keypair.publicKey, 1_000_000_000); // 1 SOL
  console.log("signature:", signature);

  // トランザクション完了待ち
  const latest_blockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({signature, ...latest_blockhash});

  // SOL 残高取得
  // Connection クラスの getBalance メソッドを利用する
  const sol_balance = await connection.getBalance(keypair.publicKey);

  // SOL 残高表示
  // lamports 単位の整数で内部管理されているため SOL 単位にするには 10^9 で割る (1 SOL = 10^9 lamports)
  console.log("lamports:", sol_balance);
  console.log("SOL:", sol_balance / 10**9);
}

main();
