import { Keypair, Connection } from "@solana/web3.js";
import secret from "../../wallet.json";

const RPC_ENDPOINT_URL = "https://api.devnet.solana.com";
const COMMITMENT = 'confirmed';

async function main() {
  // Create a connection for sending RPC requests to Devnet
  const connection = new Connection(RPC_ENDPOINT_URL, COMMITMENT);

  // Read in the private key from wallet.json (The public and private key pair will be managed using the Keypair class)
  const keypair = Keypair.fromSecretKey(new Uint8Array(secret));

  // Display the RPC and the wallet's public key
  // When displaying the public key, use base58 encoding
  console.log("endpoint:", connection.rpcEndpoint);
  console.log("wallet pubkey:", keypair.publicKey.toBase58());

  // Obtain the SOL balance
  // Use the getBalance method from the Connection class
  const sol_balance = await connection.getBalance(keypair.publicKey);

  // Display the SOL balance
  // Since SOL is internally managed as an integer value and denominated in lamports,
  // divide by 10^9 to obtain a value denominated in SOL.
  console.log("lamports:", sol_balance);
  console.log("SOL:", sol_balance / 10**9);
}

main();
