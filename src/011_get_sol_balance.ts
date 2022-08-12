import { Keypair, Connection } from "@solana/web3.js";
import secret from "../wallet.json";

const RPC_ENDPOINT_URL = "https://api.devnet.solana.com";
const COMMITMENT = 'confirmed';

async function main() {
  //LANG:JP Devnet の RPC への要求用のコネクションを作成
  //LANG:EN Create a connection for sending RPC requests to Devnet
  const connection = new Connection(RPC_ENDPOINT_URL, COMMITMENT);

  //LANG:JP wallet.json から秘密鍵を読み込み (秘密鍵と公開鍵のペアは Keypair クラスで管理する)
  //LANG:EN Read in the private key from wallet.json (The public and private key pair will be managed using the Keypair class)
  const keypair = Keypair.fromSecretKey(new Uint8Array(secret));

  //LANG:JP 使用する RPC とウォレットの公開鍵を表示
  //LANG:JP 公開鍵を表示する場合は Base58 形式の文字列で表示する
  //LANG:EN Display the RPC and the wallet's public key
  //LANG:EN When displaying the public key, use base58 encoding
  console.log("endpoint", connection.rpcEndpoint);
  console.log("wallet pubkey:", keypair.publicKey.toBase58());

  //LANG:JP SOL 残高取得
  //LANG:JP Connection クラスの getBalance メソッドを利用する
  //LANG:JP https://solana-labs.github.io/solana-web3.js/classes/Connection.html#getBalance
  //LANG:EN Obtain the SOL balance
  //LANG:EN Use the getBalance method from the Connection class
  //LANG:EN https://solana-labs.github.io/solana-web3.js/classes/Connection.html#getBalance
  const sol_balance = await connection.getBalance(keypair.publicKey);

  //LANG:JP SOL 残高表示
  //LANG:JP lamports 単位の整数で内部管理されているため SOL 単位にするには 10^9 で割る (1 SOL = 10^9 lamports)
  //LANG:EN Display the SOL balance
  //LANG:EN Since SOL is internally managed as an integer value and denominated in lamports,
  //LANG:EN divide by 10^9 to obtain a value denominated in SOL.
  console.log("lamports:", sol_balance);
  console.log("SOL:", sol_balance / 10**9);
}

main();
