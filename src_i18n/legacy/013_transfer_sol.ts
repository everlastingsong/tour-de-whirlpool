import {
  Keypair, Connection, SystemProgram,
  PublicKey, TransactionMessage, VersionedTransaction
} from "@solana/web3.js";
import secret from "../../wallet.json";

const RPC_ENDPOINT_URL = "https://api.devnet.solana.com";
const COMMITMENT = 'confirmed';

async function main() {
  //LANG:JP RPC へのコネクション作成、秘密鍵読み込み
  //LANG:EN Initialize a connection to the RPC and read in private key
  //LANG:KR RPC 연결을 초기화하고 개인키를 로딩
  const connection = new Connection(RPC_ENDPOINT_URL, COMMITMENT);
  const keypair = Keypair.fromSecretKey(new Uint8Array(secret));
  console.log("endpoint:", connection.rpcEndpoint);
  console.log("wallet pubkey:", keypair.publicKey.toBase58());

  //LANG:JP SOLの宛先
  //LANG:EN SOL destination
  //LANG:KR SOL을 전송할 대상
  const dest_pubkey = new PublicKey("vQW71yo6X1FjTwt9gaWtHYeoGMu7W9ehSmNiib7oW5G");

  //LANG:JP 送る量
  //LANG:EN Amount to send
  //LANG:KR 전송할 금액
  const amount = 10_000_000; // lamports = 0.01 SOL

  //LANG:JP SOLを送る命令を作成
  //LANG:EN Build the instruction to send SOL
  //LANG:KR SOL을 전송하기 위한 명령을 생성
  const transfer_ix = SystemProgram.transfer({
    fromPubkey: keypair.publicKey,
    toPubkey: dest_pubkey,
    lamports: amount,
  });

  //LANG:JP トランザクションを作成し、命令を追加
  //LANG:EN Create a transaction and add the instruction
  //LANG:KR 트랜잭션을 생성하고 명령을 추가
  const messageV0 = new TransactionMessage({
    payerKey: keypair.publicKey,
    recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    instructions: [transfer_ix],
  }).compileToV0Message();
  const tx = new VersionedTransaction(messageV0);
  tx.sign([keypair]);

  //LANG:JP トランザクションを送信
  //LANG:EN Send the transaction
  //LANG:KR 트랜잭션을 전송
  const signature = await connection.sendTransaction(tx);
  console.log("signature:", signature);

  //LANG:JP トランザクション完了待ち
  //LANG:EN Wait for the transaction to complete
  //LANG:KR 트랜잭션 완료를 대기
  const latest_blockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest_blockhash });
}

main();
