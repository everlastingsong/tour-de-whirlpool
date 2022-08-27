import { Keypair, Connection, PublicKey, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, Token, AccountLayout } from "@solana/spl-token";
import { DecimalUtil, deriveATA, resolveOrCreateATA } from "@orca-so/common-sdk";
import secret from "../wallet.json";

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
  const src_token_account = await deriveATA(keypair.publicKey, DEV_SAMO_MINT);

  // Obtain the associated token account for the destination wallet.
  const {address: dest_token_account, ...create_ata_ix} = await resolveOrCreateATA(
    connection,
    dest_pubkey,
    DEV_SAMO_MINT,
    ()=>connection.getMinimumBalanceForRentExemption(AccountLayout.span),
    DecimalUtil.toU64(DecimalUtil.fromNumber(0)),
    keypair.publicKey
  );

  // Create the instruction to send devSAMO
  const transfer_ix = Token.createTransferCheckedInstruction(
    TOKEN_PROGRAM_ID,
    src_token_account,
    DEV_SAMO_MINT,
    dest_token_account,
    keypair.publicKey,
    [],
    amount,
    DEV_SAMO_DECIMALS
  );

  // Create the transaction and add the instruction
  const tx = new Transaction();
  // Create the destination associated token account (if needed)
  create_ata_ix.instructions.map((ix) => tx.add(ix));
  // Send devSAMO
  tx.add(transfer_ix);

  // Send the transaction
  const signers = [keypair];
  const signature = await connection.sendTransaction(tx, signers);
  console.log("signature:", signature);

  // Wait for the transaction to be confirmed
  const latest_blockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({signature, ...latest_blockhash});
}

main();
