import { Keypair, Connection, PublicKey, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, AccountLayout, getAssociatedTokenAddressSync, createTransferCheckedInstruction } from "@solana/spl-token";
import { resolveOrCreateATA, ZERO } from "@orca-so/common-sdk";
import secret from "../wallet.json";

const RPC_ENDPOINT_URL = "https://api.devnet.solana.com";
const COMMITMENT = 'confirmed';

async function main() {
  // RPC へのコネクション作成、秘密鍵読み込み
  const connection = new Connection(RPC_ENDPOINT_URL, COMMITMENT);
  const keypair = Keypair.fromSecretKey(new Uint8Array(secret));
  console.log("endpoint:", connection.rpcEndpoint);
  console.log("wallet pubkey:", keypair.publicKey.toBase58());

  // devSAMO
  // https://everlastingsong.github.io/nebula/
  const DEV_SAMO_MINT = new PublicKey("Jd4M8bfJG3sAkd82RsGWyEXoaBXQP7njFzBwEaCTuDa");
  const DEV_SAMO_DECIMALS = 9;

  // devSAMOの送信先のウォレット
  const dest_pubkey = new PublicKey("vQW71yo6X1FjTwt9gaWtHYeoGMu7W9ehSmNiib7oW5G");

  // 送る量
  const amount = 1_000_000_000; // 1 devSAMO

  // 送信元のトークンアカウント取得
  const src_token_account = getAssociatedTokenAddressSync(DEV_SAMO_MINT, keypair.publicKey);

  // 送信先のトークンアカウント取得 (トークンアカウントが存在しない場合は create_ata_ix に作成用の命令が入る)
  const {address: dest_token_account, ...create_ata_ix} = await resolveOrCreateATA(
    connection,
    dest_pubkey,
    DEV_SAMO_MINT,
    ()=>connection.getMinimumBalanceForRentExemption(AccountLayout.span),
    ZERO,
    keypair.publicKey
  );

  // devSAMOを送る命令を作成
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

  // トランザクションを作成し、命令を追加
  const tx = new Transaction();
  // 送り先のトークンアカウントを作成(必要時)
  create_ata_ix.instructions.map((ix) => tx.add(ix));
  // devSAMOを送る
  tx.add(transfer_ix);

  // トランザクションを送信
  const signers = [keypair];
  const signature = await connection.sendTransaction(tx, signers);
  console.log("signature:", signature);

  // トランザクション完了待ち
  const latest_blockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({signature, ...latest_blockhash});
}

main();
