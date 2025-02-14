import { Keypair, Connection, PublicKey, Transaction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, AccountLayout, getAssociatedTokenAddressSync, createTransferCheckedInstruction } from "@solana/spl-token";
import { resolveOrCreateATA, ZERO } from "@orca-so/common-sdk";
import secret from "../../wallet.json";

const RPC_ENDPOINT_URL = "https://api.devnet.solana.com";
const COMMITMENT = 'confirmed';

async function main() {
  // Initialize a connection to the RPC and read in private key
  const connection = new Connection(RPC_ENDPOINT_URL, COMMITMENT);
  const keypair = Keypair.fromSecretKey(new Uint8Array(secret));
  console.log("endpoint:", connection.rpcEndpoint);
  console.log("wallet pubkey:", keypair.publicKey.toBase58());

  // devSAMO
  // https://everlastingsong.github.io/nebula/
  const DEV_SAMO_MINT = new PublicKey("Jd4M8bfJG3sAkd82RsGWyEXoaBXQP7njFzBwEaCTuDa");
  const DEV_SAMO_DECIMALS = 9;

  // Destination wallet for the devSAMO
  const dest_pubkey = new PublicKey("vQW71yo6X1FjTwt9gaWtHYeoGMu7W9ehSmNiib7oW5G");

  // Amount to send
  const amount = 1_000_000_000; // 1 devSAMO

  // Obtain the associated token account from the source wallet
  const src_token_account = getAssociatedTokenAddressSync(DEV_SAMO_MINT, keypair.publicKey);

  // Obtain the associated token account for the destination wallet.
  const { address: dest_token_account, ...create_ata_ix } = await resolveOrCreateATA(
    connection,
    dest_pubkey,
    DEV_SAMO_MINT,
    () => connection.getMinimumBalanceForRentExemption(AccountLayout.span),
    ZERO,
    keypair.publicKey
  );

  // Create the instruction to send devSAMO
  const transfer_ix = createTransferCheckedInstruction(
    src_token_account,
    DEV_SAMO_MINT,
    dest_token_account,
    keypair.publicKey,
    amount,
    DEV_SAMO_DECIMALS,
    [],
    TOKEN_PROGRAM_ID
  );

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
