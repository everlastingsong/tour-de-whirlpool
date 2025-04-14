import { Keypair, Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import secret from "../../wallet.json";

const RPC_ENDPOINT_URL = "https://api.devnet.solana.com";
const COMMITMENT = 'confirmed';

async function main() {
  // https://everlastingsong.github.io/nebula/
  // devToken specification
  const tokenDefs = {
    "BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k": {name: "devUSDC", decimals: 6, program: TOKEN_PROGRAM_ID},
    "H8UekPGwePSmQ3ttuYGPU1szyFfjZR4N53rymSFwpLPm": {name: "devUSDT", decimals: 6, program: TOKEN_PROGRAM_ID},
    "Jd4M8bfJG3sAkd82RsGWyEXoaBXQP7njFzBwEaCTuDa":  {name: "devSAMO", decimals: 9, program: TOKEN_PROGRAM_ID},
    "Afn8YB1p4NsoZeS5XJBZ18LTfEy5NFPwN46wapZcBQr6": {name: "devTMAC", decimals: 6, program: TOKEN_PROGRAM_ID},
    "Hy5ZLF26P3bjfVtrt4qDQCn6HGhS5izb5SNv7P9qmgcG": {name: "devPYUSD", decimals: 6, program: TOKEN_2022_PROGRAM_ID},
    "9fcwFnknB7cZrpVYQxoFgt9haYe59G7bZyTYJ4PkYjbS": {name: "devBERN", decimals: 5, program: TOKEN_2022_PROGRAM_ID},
    "FKUPCock94bCnKqsi7UgqxnpzQ43c6VHEYhuEPXYpoBk": {name: "devSUSD", decimals: 6, program: TOKEN_2022_PROGRAM_ID},
  };

  // 토큰 이름을 받아 mint 주소로 변환
  const devTokenName = process.argv[process.argv.length - 1];
  const devTokenMint = new PublicKey(Object.keys(tokenDefs).find(key => tokenDefs[key].name === devTokenName));
  const devTokenProgram = tokenDefs[devTokenMint.toBase58()].program;
  // Devnet RPC 연결 생성
  const connection = new Connection(RPC_ENDPOINT_URL, COMMITMENT);

  // wallet.json에서 비밀키를 로드 (공개키/비밀키 쌍은 Keypair로 관리)
  const keypair = Keypair.fromSecretKey(new Uint8Array(secret));

  // 사용 중인 RPC와 지갑의 공개키를 출력
  console.log("endpoint:", connection.rpcEndpoint);
  console.log("wallet pubkey:", keypair.publicKey.toBase58());

  // 트랜잭션 생성 후 명령 추가
  // 0.2 SOL을 보내면 devToken을 배포하는 프로그램의 distribute 명령을 실행 (튜토리얼 핵심 내용 아님)
  const DEVTOKEN_DISTRIBUTOR_PROGRAM_ID = new PublicKey("Bu2AaWnVoveQT47wP4obpmmZUwK9bN9ah4w6Vaoa93Y9");
  const DEVTOKEN_ADMIN = new PublicKey("3otH3AHWqkqgSVfKFkrxyDqd2vK6LcaqigHrFEmWcGuo");
  const PDA = new PublicKey("3pgfe1L6jcq59uy3LZmmeSCk9mwVvHXjn21nSvNr8D6x");

  const user = keypair.publicKey;
  const vault = getAssociatedTokenAddressSync(devTokenMint, PDA, true, devTokenProgram);
  const userVault = getAssociatedTokenAddressSync(devTokenMint, user, true, devTokenProgram);
  const ix = new TransactionInstruction({
    programId: DEVTOKEN_DISTRIBUTOR_PROGRAM_ID,
    keys: [
      { pubkey: devTokenMint, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: PDA, isSigner: false, isWritable: false },
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: userVault, isSigner: false, isWritable: true },
      { pubkey: DEVTOKEN_ADMIN, isSigner: false, isWritable: true },
      { pubkey: devTokenProgram, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([0xBF, 0x2C, 0xDF, 0xCF, 0xA4, 0xEC, 0x7E, 0x3D]), // instruction code for distribute
  });

  const tx = new Transaction();
  tx.add(ix);

  // 트랜잭션 전파
  const signers = [keypair];
  const signature = await connection.sendTransaction(tx, signers);
  console.log("signature:", signature);

  // 트랜잭션 반영까지 대기
  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({signature, ...latestBlockhash});

  // 토큰 잔액 조회 (Connection 클래스의 getTokenAccountBalance 메서드 사용)
  const devTokenBalance = await connection.getTokenAccountBalance(userVault);

  // 토큰 잔액 출력
  console.log(`${devTokenName}:`, devTokenBalance.value.uiAmount);
}

main();
