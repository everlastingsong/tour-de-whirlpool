import { Keypair, Connection } from "@solana/web3.js";
import secret from "../../../wallet.json";

const RPC_ENDPOINT_URL = "https://api.devnet.solana.com";
const COMMITMENT = 'confirmed';

async function main() {
  // Devnet RPC에 요청을 보내기 위한 커넥션 생성
  const connection = new Connection(RPC_ENDPOINT_URL, COMMITMENT);

  // wallet.json에서 개인키 로딩 (공개키/비밀키 쌍은 Keypair 클래스로 관리됩니다)
  const keypair = Keypair.fromSecretKey(new Uint8Array(secret));

  // 사용 중인 RPC와 지갑의 공개 키를 출력
  // 공개 키를 표시할 때는 Base58 형식의 문자열을 사용함
  console.log("endpoint:", connection.rpcEndpoint);
  console.log("wallet pubkey:", keypair.publicKey.toBase58());

  // SOL 잔액을 조회
  // Connection 클래스의 getBalance 함수를 활용
  const sol_balance = await connection.getBalance(keypair.publicKey);

  // SOL 잔액을 로그로 출력
  // lamports 단위이므로 10^9로 나누어 실제 SOL 단위로 변환 (1 SOL = 10^9 lamports)
  console.log("lamports:", sol_balance);
  console.log("SOL:", sol_balance / 10**9);
}

main();
