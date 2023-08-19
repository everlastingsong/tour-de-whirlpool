import { Keypair, Connection, PublicKey, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, AccountLayout, getAssociatedTokenAddressSync, createTransferCheckedInstruction } from "@solana/spl-token";
import { resolveOrCreateATA, ZERO } from "@orca-so/common-sdk";
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

  // devSAMO
  // https://everlastingsong.github.io/nebula/
  const DEV_SAMO_MINT = new PublicKey("Jd4M8bfJG3sAkd82RsGWyEXoaBXQP7njFzBwEaCTuDa");
  const DEV_SAMO_DECIMALS = 9;

  //LANG:JP devSAMOの送信先のウォレット
  //LANG:EN Destination wallet for the devSAMO
  const dest_pubkey = new PublicKey("vQW71yo6X1FjTwt9gaWtHYeoGMu7W9ehSmNiib7oW5G");

  //LANG:JP 送る量
  //LANG:EN Amount to send
  const amount = 1_000_000_000; // 1 devSAMO

  //LANG:JP 送信元のトークンアカウント取得
  //LANG:EN Obtain the associated token account from the source wallet
  const src_token_account = getAssociatedTokenAddressSync(DEV_SAMO_MINT, keypair.publicKey);

  //LANG:JP 送信先のトークンアカウント取得 (トークンアカウントが存在しない場合は create_ata_ix に作成用の命令が入る)
  //LANG:EN Obtain the associated token account for the destination wallet.
  const {address: dest_token_account, ...create_ata_ix} = await resolveOrCreateATA(
    connection,
    dest_pubkey,
    DEV_SAMO_MINT,
    ()=>connection.getMinimumBalanceForRentExemption(AccountLayout.span),
    ZERO,
    keypair.publicKey
  );

  //LANG:JP devSAMOを送る命令を作成
  //LANG:EN Create the instruction to send devSAMO
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

  //LANG:JP トランザクションを作成し、命令を追加
  //LANG:EN Create the transaction and add the instruction
  const tx = new Transaction();
  //LANG:JP 送り先のトークンアカウントを作成(必要時)
  //LANG:EN Create the destination associated token account (if needed)
  create_ata_ix.instructions.map((ix) => tx.add(ix));
  //LANG:JP devSAMOを送る
  //LANG:EN Send devSAMO
  tx.add(transfer_ix);

  //LANG:JP トランザクションを送信
  //LANG:EN Send the transaction
  const signers = [keypair];
  const signature = await connection.sendTransaction(tx, signers);
  console.log("signature:", signature);

  //LANG:JP トランザクション完了待ち
  //LANG:EN Wait for the transaction to be confirmed
  const latest_blockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({signature, ...latest_blockhash});
}

main();