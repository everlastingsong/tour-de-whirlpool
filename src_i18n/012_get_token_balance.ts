import { Keypair, Connection } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { DecimalUtil } from "@orca-so/common-sdk";
import { unpackAccount } from "@solana/spl-token";
import BN from "bn.js";
import secret from "../wallet.json";

const RPC_ENDPOINT_URL = "https://api.devnet.solana.com";
const COMMITMENT = 'confirmed';

async function main() {
  //LANG:JP RPC へのコネクション作成、秘密鍵読み込み
  //LANG:EN Initialize a connection to the RPC and read in private key
  //LANG:KR RPC에 연결을 초기화하고 개인키를 불러옴
  const connection = new Connection(RPC_ENDPOINT_URL, COMMITMENT);
  const keypair = Keypair.fromSecretKey(new Uint8Array(secret));
  console.log("endpoint:", connection.rpcEndpoint);
  console.log("wallet pubkey:", keypair.publicKey.toBase58());

  // https://everlastingsong.github.io/nebula/
  // devToken specification
  const token_defs = {
    "BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k": {name: "devUSDC", decimals: 6},
    "H8UekPGwePSmQ3ttuYGPU1szyFfjZR4N53rymSFwpLPm": {name: "devUSDT", decimals: 6},
    "Jd4M8bfJG3sAkd82RsGWyEXoaBXQP7njFzBwEaCTuDa":  {name: "devSAMO", decimals: 9},
    "Afn8YB1p4NsoZeS5XJBZ18LTfEy5NFPwN46wapZcBQr6": {name: "devTMAC", decimals: 6},
  };

  //LANG:JP ウォレットの公開鍵からトークンアカウントを取得
  //LANG:EN Obtain the token accounts from the wallet's public key
  //LANG:KR 지갑의 공개 키로부터 토큰 계정을 조회
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

  //LANG:JP トークンアカウントのデータをデコード
  //LANG:EN Deserialize token account data
  //LANG:KR 토큰 계정 데이터를 디코딩
  for (let i=0; i<accounts.value.length; i++) {
    const value = accounts.value[i];

    //LANG:JP デコード
    //LANG:EN Deserialize
    //LANG:KR 디코딩
    const parsed_token_account = unpackAccount(value.pubkey, value.account);

    //LANG:JP mint アドレスからどのトークンのトークンアカウントか特定
    //LANG:EN Use the mint address to determine which token account is for which token
    //LANG:KR mint 주소를 사용해 어떤 토큰 계정인지 식별
    const mint = parsed_token_account.mint;
    const token_def = token_defs[mint.toBase58()];
    //LANG:JP devToken 以外は無視
    //LANG:EN Ignore non-devToken accounts
    //LANG:KR devToken이 아닌 계정은 무시
    if ( token_def === undefined ) continue;

    //LANG:JP 残高は amount
    //LANG:EN The balance is "amount"
    //LANG:KR 잔액을 amount 필드에 저장
    const amount = parsed_token_account.amount;

    //LANG:JP 残高は整数で管理されているため、UI 表示用に変換
    //LANG:EN The balance is managed as an integer value, so it must be converted for UI display
    //LANG:KR 잔액은 정수형으로 관리되므로 UI 표시를 위해 변환이 필요
    const ui_amount = DecimalUtil.fromBN(new BN(amount.toString()), token_def.decimals);

    console.log(
      "TokenAccount:", value.pubkey.toBase58(),
      "\n  mint:", mint.toBase58(),
      "\n  name:", token_def.name,
      "\n  amount:", amount.toString(),
      "\n  ui_amount:", ui_amount.toString()
    );
  }
}

main();