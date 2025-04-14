import { Keypair, Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import secret from "../../wallet.json";

const RPC_ENDPOINT_URL = "https://api.devnet.solana.com";
const COMMITMENT = 'confirmed';

async function main() {
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

  // Convert the token name to the mint address
  const devTokenName = process.argv[process.argv.length - 1];
  const devTokenMint = new PublicKey(Object.keys(tokenDefs).find(key => tokenDefs[key].name === devTokenName));
  const devTokenProgram = tokenDefs[devTokenMint.toBase58()].program;
  // Create a connection for sending RPC requests to Devnet
  const connection = new Connection(RPC_ENDPOINT_URL, COMMITMENT);

  // Read in the private key from wallet.json (The public and private key pair will be managed using the Keypair class)
  const keypair = Keypair.fromSecretKey(new Uint8Array(secret));

  // Display the RPC and the wallet's public key
  // When displaying the public key, use base58 encoding
  console.log("endpoint:", connection.rpcEndpoint);
  console.log("wallet pubkey:", keypair.publicKey.toBase58());

  // Create a transaction and add the instruction
  // Send 0.2 SOL to execute the distribute instruction of the program that distributes devToken
  // (details omitted since this is not the main part of the tutorial)
  const DEVTOKEN_DISTRIBUTOR_PROGRAM_ID = new PublicKey("Bu2AaWnVoveQT47wP4obpmmZUwK9bN9ah4w6Vaoa93Y9");
  const DEVTOKEN_ADMIN = new PublicKey("3otH3AHWqkqgSVfKFkrxyDqd2vK6LcaqigHrFEmWcGuo");
  const PDA = new PublicKey("3pgfe1L6jcq59uy3LZmmeSCk9mwVvHXjn21nSvNr8D6x");

  const user = keypair.publicKey;
  const vault = getAssociatedTokenAddressSync(devTokenMint, PDA, true, devTokenProgram);
  const userVault = getAssociatedTokenAddressSync(devTokenMint, user, true, devTokenProgram);
  const ix = new TransactionInstruction({
    programId: DEVTOKEN_DISTRIBUTOR_PROGRAM_ID,
    keys: [
      { pubkey: devTokenMint, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: PDA, isSigner: false, isWritable: false },
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: userVault, isSigner: false, isWritable: true },
      { pubkey: DEVTOKEN_ADMIN, isSigner: false, isWritable: true },
      { pubkey: devTokenProgram, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([0xBF, 0x2C, 0xDF, 0xCF, 0xA4, 0xEC, 0x7E, 0x3D]), // instruction code for distribute
  });

  const tx = new Transaction();
  tx.add(ix);

  // Send the transaction
  const signers = [keypair];
  const signature = await connection.sendTransaction(tx, signers);
  console.log("signature:", signature);

  // Wait for the transaction to complete
  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({signature, ...latestBlockhash});

  // Obtain the token balance
  // Use the getTokenAccountBalance method from the Connection class
  const devTokenBalance = await connection.getTokenAccountBalance(userVault);

  // Display the token balance
  console.log(`${devTokenName}:`, devTokenBalance.value.uiAmount);
}

main();
