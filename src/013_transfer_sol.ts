import { Keypair, Connection, SystemProgram, PublicKey, Transaction } from "@solana/web3.js";
import secret from "../wallet.json";

const RPC_ENDPOINT_URL = "https://api.devnet.solana.com";
const COMMITMENT = 'confirmed';

async function main() {
  // RPC へのコネクション作成、秘密鍵読み込み
  const connection = new Connection(RPC_ENDPOINT_URL, COMMITMENT);
  const keypair = Keypair.fromSecretKey(new Uint8Array(secret));
  console.log("endpoint:", connection.rpcEndpoint);
  console.log("wallet pubkey:", keypair.publicKey.toBase58());

  // SOLの宛先
  const dest_pubkey = new PublicKey("vQW71yo6X1FjTwt9gaWtHYeoGMu7W9ehSmNiib7oW5G");

  // 送る量
  const amount = 10_000_000; // lamports = 0.01 SOL

  // SOLを送る命令を作成
  const transfer_ix = SystemProgram.transfer({
    fromPubkey: keypair.publicKey,
    toPubkey: dest_pubkey,
    lamports: amount,
  });

  // トランザクションを作成し、命令を追加
  const tx = new Transaction();
  tx.add(transfer_ix);

  // トランザクションを送信
  const signers = [keypair];
  const signature = await connection.sendTransaction(tx, signers);
  console.log("signature:", signature);

  // トランザクション完了待ち
  await connection.confirmTransaction(signature, COMMITMENT);
}

main();