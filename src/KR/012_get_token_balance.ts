import { Keypair, Connection } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { DecimalUtil } from "@orca-so/common-sdk";
import { unpackAccount } from "@solana/spl-token";
import BN from "bn.js";
import secret from "../../wallet.json";

const RPC_ENDPOINT_URL = "https://api.devnet.solana.com";
const COMMITMENT = 'confirmed';

async function main() {
  // RPC에 연결을 초기화하고 개인키를 불러옴
  const connection = new Connection(RPC_ENDPOINT_URL, COMMITMENT);
  const keypair = Keypair.fromSecretKey(new Uint8Array(secret));
  console.log("endpoint:", connection.rpcEndpoint);
  console.log("wallet pubkey:", keypair.publicKey.toBase58());

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

  // 지갑의 공개 키로부터 토큰 계정을 조회
  //
  // {
  //   context: { apiVersion: '1.10.24', slot: 140791186 },
  //   value: [
  //     { account: [Object], pubkey: [PublicKey] },
  //     { account: [Object], pubkey: [PublicKey] },
  //     { account: [Object], pubkey: [PublicKey] },
  //     { account: [Object], pubkey: [PublicKey] }
  //   ]
  // }
  const accounts = await connection.getTokenAccountsByOwner(
    keypair.publicKey,
    { programId: TOKEN_PROGRAM_ID }
  );
  console.log("getTokenAccountsByOwner:", accounts);
  const accounts2022 = await connection.getTokenAccountsByOwner(
    keypair.publicKey,
    { programId: TOKEN_2022_PROGRAM_ID }
  );
  console.log("getTokenAccountsByOwner(2022):", accounts2022);
  const allAccounts = [...accounts.value, ...accounts2022.value];

  // 토큰 계정 데이터를 디코딩
  for (let i=0; i<allAccounts.length; i++) {
    const value = allAccounts[i];

    // 디코딩
    const parsedTokenAccount = unpackAccount(value.pubkey, value.account, value.account.owner);

    // mint 주소를 사용해 어떤 토큰 계정인지 식별
    const mint = parsedTokenAccount.mint;
    const tokenDef = tokenDefs[mint.toBase58()];
    // devToken이 아닌 계정은 무시
    if ( tokenDef === undefined ) continue;

    // 잔액을 amount 필드에 저장
    const amount = parsedTokenAccount.amount;

    // 잔액은 정수형으로 관리되므로 UI 표시를 위해 변환이 필요
    const uiAmount = DecimalUtil.fromBN(new BN(amount.toString()), tokenDef.decimals);

    console.log(
      "TokenAccount:", value.pubkey.toBase58(),
      "\n  mint:", mint.toBase58(),
      "\n  name:", tokenDef.name,
      "\n  amount:", amount.toString(),
      "\n  ui_amount:", uiAmount.toString()
    );
  }
}

main();
