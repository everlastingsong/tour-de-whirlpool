import { Keypair, Connection } from "@solana/web3.js";
import secret from "../../../wallet.json";

const RPC_ENDPOINT_URL = "https://api.devnet.solana.com";
const COMMITMENT = 'confirmed';

async function main() {
  // Devnet RPC에 요청을 보낼 수 있는 커넥션 생성
  const connection = new Connection(RPC_ENDPOINT_URL, COMMITMENT);

  // wallet.json에서 비밀키를 로드 (공개키/비밀키 페어는 Keypair 클래스로 관리)
  const keypair = Keypair.fromSecretKey(new Uint8Array(secret));

  // 사용 중인 RPC와 지갑의 공개키를 표시
  console.log("endpoint:", connection.rpcEndpoint);
  console.log("wallet pubkey:", keypair.publicKey.toBase58());

  // 에어드랍 요청 트랜잭션 전파
  const signature = await connection.requestAirdrop(keypair.publicKey, 1_000_000_000); // 1 SOL
  console.log("signature:", signature);

  // 트랜잭션 반영까지 대기함
  const latest_blockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({signature, ...latest_blockhash});

  // SOL 잔액을 조회 (getBalance 함수 사용)
  const sol_balance = await connection.getBalance(keypair.publicKey);

  // SOL 잔액 출력 (lamports 단위를 SOL로 변환하려면 10^9로 나눔)
  console.log("lamports:", sol_balance);
  console.log("SOL:", sol_balance / 10**9);
}

main();
