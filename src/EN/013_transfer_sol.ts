import { Keypair, Connection, SystemProgram, PublicKey, Transaction, VersionedMessage, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import secret from "../../wallet.json";

const RPC_ENDPOINT_URL = "https://api.devnet.solana.com";
const COMMITMENT = 'confirmed';

async function main() {
  // Initialize a connection to the RPC and read in private key
  const connection = new Connection(RPC_ENDPOINT_URL, COMMITMENT);
  const keypair = Keypair.fromSecretKey(new Uint8Array(secret));
  console.log("endpoint:", connection.rpcEndpoint);
  console.log("wallet pubkey:", keypair.publicKey.toBase58());

  // SOL destination
  const dest_pubkey = new PublicKey("vQW71yo6X1FjTwt9gaWtHYeoGMu7W9ehSmNiib7oW5G");

  // Amount to send
  const amount = 10_000_000; // lamports = 0.01 SOL

  // Build the instruction to send SOL
  const transfer_ix = SystemProgram.transfer({
    fromPubkey: keypair.publicKey,
    toPubkey: dest_pubkey,
    lamports: amount,
  });

  // Create a transaction and add the instruction
  const messageV0 = new TransactionMessage({
    payerKey: keypair.publicKey,
    recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    instructions: [transfer_ix],
  }).compileToV0Message();
  const tx = new VersionedTransaction(messageV0);
  tx.sign([keypair]);

  // Send the transaction
  const signature = await connection.sendTransaction(tx);
  console.log("signature:", signature);

  // Wait for the transaction to complete
  const latest_blockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest_blockhash }, "confirmed");
}

main();
