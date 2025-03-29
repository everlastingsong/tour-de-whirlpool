import {
  Keypair, Connection, SystemProgram,
  PublicKey, TransactionMessage, VersionedTransaction
} from "@solana/web3.js";
import secret from "../../wallet.json";

const RPC_ENDPOINT_URL = "https://api.devnet.solana.com";
const COMMITMENT = 'confirmed';

async function main() {
  // RPC 연결을 초기화하고 개인키를 로딩
  const connection = new Connection(RPC_ENDPOINT_URL, COMMITMENT);
  const keypair = Keypair.fromSecretKey(new Uint8Array(secret));
  console.log("endpoint:", connection.rpcEndpoint);
  console.log("wallet pubkey:", keypair.publicKey.toBase58());

  // SOL을 전송할 대상
  const dest_pubkey = new PublicKey("vQW71yo6X1FjTwt9gaWtHYeoGMu7W9ehSmNiib7oW5G");

  // 전송할 금액
  const amount = 10_000_000; // lamports = 0.01 SOL

  // SOL을 전송하기 위한 명령을 생성
  const transfer_ix = SystemProgram.transfer({
    fromPubkey: keypair.publicKey,
    toPubkey: dest_pubkey,
    lamports: amount,
  });

  // 트랜잭션을 생성하고 명령을 추가
  const messageV0 = new TransactionMessage({
    payerKey: keypair.publicKey,
    recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    instructions: [transfer_ix],
  }).compileToV0Message();
  const tx = new VersionedTransaction(messageV0);
  tx.sign([keypair]);

  // 트랜잭션을 전송
  const signature = await connection.sendTransaction(tx);
  console.log("signature:", signature);

  // 트랜잭션 완료를 대기
  const latest_blockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest_blockhash });
}

main();
