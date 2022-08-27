import { Keypair, Connection } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { TokenUtil, DecimalUtil } from "@orca-so/common-sdk";
import secret from "../wallet.json";

const RPC_ENDPOINT_URL = "https://api.devnet.solana.com";
const COMMITMENT = 'confirmed';

async function main() {
  //LANG:JP RPC へのコネクション作成、秘密鍵読み込み
  //LANG:EN Initialize a connection to the RPC and read in private key
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
  for (let i=0; i<accounts.value.length; i++) {
    const value = accounts.value[i];

    //LANG:JP デコード
    //LANG:EN Deserialize
    const parsed_token_account = TokenUtil.deserializeTokenAccount(value.account.data);
    //LANG:JP mint アドレスからどのトークンのトークンアカウントか特定
    //LANG:EN Use the mint address to determine which token account is for which token
    const mint = parsed_token_account.mint;
    const token_def = token_defs[mint.toBase58()];
    //LANG:JP devToken 以外は無視
    //LANG:EN Ignore non-devToken accounts
    if ( token_def === undefined ) continue;

    //LANG:JP 残高は amount
    //LANG:EN The balance is "amount"
    const amount = parsed_token_account.amount;
    //LANG:JP 残高は整数で管理されているため、UI 表示用に変換
    //LANG:EN The balance is managed as an integer value, so it must be converted for UI display
    const ui_amount = DecimalUtil.fromU64(amount, token_def.decimals);

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