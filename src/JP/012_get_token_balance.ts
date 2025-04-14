import { Keypair, Connection } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { DecimalUtil } from "@orca-so/common-sdk";
import { unpackAccount } from "@solana/spl-token";
import BN from "bn.js";
import secret from "../../wallet.json";

const RPC_ENDPOINT_URL = "https://api.devnet.solana.com";
const COMMITMENT = 'confirmed';

async function main() {
  // RPC へのコネクション作成、秘密鍵読み込み
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

  // ウォレットの公開鍵からトークンアカウントを取得
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

  // トークンアカウントのデータをデコード
  for (let i=0; i<allAccounts.length; i++) {
    const value = allAccounts[i];

    // デコード
    const parsedTokenAccount = unpackAccount(value.pubkey, value.account, value.account.owner);

    // mint アドレスからどのトークンのトークンアカウントか特定
    const mint = parsedTokenAccount.mint;
    const tokenDef = tokenDefs[mint.toBase58()];
    // devToken 以外は無視
    if ( tokenDef === undefined ) continue;

    // 残高は amount
    const amount = parsedTokenAccount.amount;

    // 残高は整数で管理されているため、UI 表示用に変換
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
