import { Keypair, Connection } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { DecimalUtil } from "@orca-so/common-sdk";
import { unpackAccount } from "@solana/spl-token";
import BN from "bn.js";
import secret from "../../wallet.json";

const RPC_ENDPOINT_URL = "https://api.devnet.solana.com";
const COMMITMENT = 'confirmed';

async function main() {
  // Initialize a connection to the RPC and read in private key
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

  // Obtain the token accounts from the wallet's public key
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

  // Deserialize token account data
  for (let i=0; i<accounts.value.length; i++) {
    const value = accounts.value[i];

    // Deserialize
    const parsed_token_account = unpackAccount(value.pubkey, value.account);

    // Use the mint address to determine which token account is for which token
    const mint = parsed_token_account.mint;
    const token_def = token_defs[mint.toBase58()];
    // Ignore non-devToken accounts
    if ( token_def === undefined ) continue;

    // The balance is "amount"
    const amount = parsed_token_account.amount;

    // The balance is managed as an integer value, so it must be converted for UI display
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
