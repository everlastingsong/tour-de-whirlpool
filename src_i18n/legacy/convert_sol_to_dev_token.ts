import { Keypair, Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import secret from "../../wallet.json";

const RPC_ENDPOINT_URL = "https://api.devnet.solana.com";
const COMMITMENT = 'confirmed';

async function main() {
  // https://everlastingsong.github.io/nebula/
  // devToken specification
  const token_defs = {
    "BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k": {name: "devUSDC", decimals: 6},
    "H8UekPGwePSmQ3ttuYGPU1szyFfjZR4N53rymSFwpLPm": {name: "devUSDT", decimals: 6},
    "Jd4M8bfJG3sAkd82RsGWyEXoaBXQP7njFzBwEaCTuDa":  {name: "devSAMO", decimals: 9},
    "Afn8YB1p4NsoZeS5XJBZ18LTfEy5NFPwN46wapZcBQr6": {name: "devTMAC", decimals: 6},
  };

  //LANG:JP トークン名を受け取り mint アドレスに変換
  //LANG:EN Convert the token name to the mint address
  //LANG:KR 토큰 이름을 받아 mint 주소로 변환
  const devTokenName = process.argv[process.argv.length - 1];
  const devTokenMint = new PublicKey(Object.keys(token_defs).find(key => token_defs[key].name === devTokenName));
  //LANG:JP Devnet の RPC への要求用のコネクションを作成
  //LANG:EN Create a connection for sending RPC requests to Devnet
  //LANG:KR Devnet RPC 연결 생성
  const connection = new Connection(RPC_ENDPOINT_URL, COMMITMENT);

  //LANG:JP wallet.json から秘密鍵を読み込み (秘密鍵と公開鍵のペアは Keypair クラスで管理する)
  //LANG:EN Read in the private key from wallet.json (The public and private key pair will be managed using the Keypair class)
  //LANG:KR wallet.json에서 비밀키를 로드 (공개키/비밀키 쌍은 Keypair로 관리)
  const keypair = Keypair.fromSecretKey(new Uint8Array(secret));

  //LANG:JP 使用する RPC とウォレットの公開鍵を表示
  //LANG:JP 公開鍵を表示する場合は Base58 形式の文字列で表示する
  //LANG:EN Display the RPC and the wallet's public key
  //LANG:EN When displaying the public key, use base58 encoding
  //LANG:KR 사용 중인 RPC와 지갑의 공개키를 출력
  console.log("endpoint:", connection.rpcEndpoint);
  console.log("wallet pubkey:", keypair.publicKey.toBase58());

  //LANG:JP トランザクションを作成し、命令を追加
  //LANG:JP 0.2 SOL を送ると、devToken を配布するプログラムの distribute 命令を実行する(チュートリアルの本筋ではないため詳細は割愛)
  //LANG:EN Create a transaction and add the instruction
  //LANG:EN Send 0.2 SOL to execute the distribute instruction of the program that distributes devToken
  //LANG:EN (details omitted since this is not the main part of the tutorial)
  //LANG:KR 트랜잭션 생성 후 명령 추가
  //LANG:KR 0.2 SOL을 보내면 devToken을 배포하는 프로그램의 distribute 명령을 실행 (튜토리얼 핵심 내용 아님)
  const DEVTOKEN_DISTRIBUTOR_PROGRAM_ID = new PublicKey("Bu2AaWnVoveQT47wP4obpmmZUwK9bN9ah4w6Vaoa93Y9");
  const DEVTOKEN_ADMIN = new PublicKey("3otH3AHWqkqgSVfKFkrxyDqd2vK6LcaqigHrFEmWcGuo");
  const PDA = new PublicKey("3pgfe1L6jcq59uy3LZmmeSCk9mwVvHXjn21nSvNr8D6x");

  const user = keypair.publicKey;
  const vault = getAssociatedTokenAddressSync(devTokenMint, PDA, true);
  const user_vault = getAssociatedTokenAddressSync(devTokenMint, user);
  const ix = new TransactionInstruction({
    programId: DEVTOKEN_DISTRIBUTOR_PROGRAM_ID,
    keys: [
      { pubkey: devTokenMint, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: PDA, isSigner: false, isWritable: false },
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: user_vault, isSigner: false, isWritable: true },
      { pubkey: DEVTOKEN_ADMIN, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([0xBF, 0x2C, 0xDF, 0xCF, 0xA4, 0xEC, 0x7E, 0x3D]), // instruction code for distribute
  });

  const tx = new Transaction();
  tx.add(ix);

  //LANG:JP トランザクションを送信
  //LANG:EN Send the transaction
  //LANG:KR 트랜잭션 전파
  const signers = [keypair];
  const signature = await connection.sendTransaction(tx, signers);
  console.log("signature:", signature);

  //LANG:JP トランザクション完了待ち
  //LANG:EN Wait for the transaction to complete
  //LANG:KR 트랜잭션 반영까지 대기
  const latest_blockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({signature, ...latest_blockhash});

  //LANG:JP トークン残高取得
  //LANG:JP Connection クラスの getTokenAccountBalance メソッドを利用する
  //LANG:EN Obtain the token balance
  //LANG:EN Use the getTokenAccountBalance method from the Connection class
  //LANG:KR 토큰 잔액 조회 (Connection 클래스의 getTokenAccountBalance 메서드 사용)
  const dev_token_balance = await connection.getTokenAccountBalance(user_vault);

  //LANG:JP トークン残高表示
  //LANG:EN Display the token balance
  //LANG:KR 토큰 잔액 출력
  console.log(`${devTokenName}:`, dev_token_balance.value.uiAmount);
}

main();
