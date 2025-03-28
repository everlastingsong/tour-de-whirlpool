import { Keypair, Connection } from "@solana/web3.js";
import secret from "../wallet.json";

const RPC_ENDPOINT_URL = "https://api.devnet.solana.com";
const COMMITMENT = 'confirmed';

async function main() {
  //LANG:JP Devnet の RPC への要求用のコネクションを作成
  //LANG:EN Create a connection for sending RPC requests to Devnet
  //LANG:KR Devnet RPC에 요청을 보낼 수 있는 커넥션 생성
  const connection = new Connection(RPC_ENDPOINT_URL, COMMITMENT);

  //LANG:JP wallet.json から秘密鍵を読み込み (秘密鍵と公開鍵のペアは Keypair クラスで管理する)
  //LANG:EN Read in the private key from wallet.json (The public and private key pair will be managed using the Keypair class)
  //LANG:KR wallet.json에서 비밀키를 로드 (공개키/비밀키 페어는 Keypair 클래스로 관리)
  const keypair = Keypair.fromSecretKey(new Uint8Array(secret));

  //LANG:JP 使用する RPC とウォレットの公開鍵を表示
  //LANG:JP 公開鍵を表示する場合は Base58 形式の文字列で表示する
  //LANG:EN Display the RPC and the wallet's public key
  //LANG:EN When displaying the public key, use base58 encoding
  //LANG:KR 사용 중인 RPC와 지갑의 공개키를 표시
  console.log("endpoint:", connection.rpcEndpoint);
  console.log("wallet pubkey:", keypair.publicKey.toBase58());

  //LANG:JP トランザクションを送信
  //LANG:EN Send the transaction
  //LANG:KR 에어드랍 요청 트랜잭션 전파
  const signature = await connection.requestAirdrop(keypair.publicKey, 1_000_000_000); // 1 SOL
  console.log("signature:", signature);

  //LANG:JP トランザクション完了待ち
  //LANG:EN Wait for the transaction to complete
  //LANG:KR 트랜잭션 반영까지 대기함
  const latest_blockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({signature, ...latest_blockhash});

  //LANG:JP SOL 残高取得
  //LANG:JP Connection クラスの getBalance メソッドを利用する
  //LANG:EN Obtain the SOL balance
  //LANG:EN Use the getBalance method from the Connection class
  //LANG:KR SOL 잔액을 조회 (getBalance 함수 사용)
  const sol_balance = await connection.getBalance(keypair.publicKey);

  //LANG:JP SOL 残高表示
  //LANG:JP lamports 単位の整数で内部管理されているため SOL 単位にするには 10^9 で割る (1 SOL = 10^9 lamports)
  //LANG:EN Display the SOL balance
  //LANG:EN Since SOL is internally managed as an integer value and denominated in lamports,
  //LANG:EN divide by 10^9 to obtain a value denominated in SOL.
  //LANG:KR SOL 잔액 출력 (lamports 단위를 SOL로 변환하려면 10^9로 나눔)
  console.log("lamports:", sol_balance);
  console.log("SOL:", sol_balance / 10**9);
}

main();
