import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@project-serum/anchor";
import { deriveATA, TransactionBuilder } from "@orca-so/common-sdk";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil
} from "@orca-so/whirlpools-sdk";
import {
  ClockworkProvider
} from "@clockwork-xyz/sdk";
import {
  TOKEN_PROGRAM_ID, Token
} from "@solana/spl-token";

// スクリプト実行前に環境変数定義が必要です
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json

async function main() {
  // WhirlpoolClient 作成
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  // トークン定義
  // https://everlastingsong.github.io/nebula/
  const devUSDC = {mint: new PublicKey("BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k"), decimals: 6};
  const devSAMO = {mint: new PublicKey("Jd4M8bfJG3sAkd82RsGWyEXoaBXQP7njFzBwEaCTuDa"), decimals: 9};

  //LANG:JP Whirlpool の Config アカウント
  //LANG:EN WhirlpoolsConfig account
  // devToken ecosystem / Orca Whirlpools
  const NEBULA_WHIRLPOOLS_CONFIG = new PublicKey("FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR");

  // devSAMO/devUSDC プール取得
  const tick_spacing = 64;
  const whirlpool_pubkey = PDAUtil.getWhirlpool(
      ORCA_WHIRLPOOL_PROGRAM_ID,
      NEBULA_WHIRLPOOLS_CONFIG,
      devSAMO.mint, devUSDC.mint, tick_spacing).publicKey;
  console.log("whirlpool_key:", whirlpool_pubkey.toBase58());
  const whirlpool = await client.getPool(whirlpool_pubkey);

  const ata_dev_samo = await deriveATA(ctx.wallet.publicKey, devSAMO.mint);
  const ata_dev_usdc = await deriveATA(ctx.wallet.publicKey, devUSDC.mint);

  // CLOCKWORK のアカウントアドレス計算
  const clockwork_provider = ClockworkProvider.fromAnchorProvider(provider);
  const clockwork_thread_id = `trade-${whirlpool_pubkey.toBase58().slice(0, 8)}`;
  const [clockwork_thread_pda] = clockwork_provider.getThreadPDA(ctx.wallet.publicKey, clockwork_thread_id);
  console.log("clockwork thread pda:", clockwork_thread_pda.toBase58());

  // トークンの権限を Clockwork から剥奪する命令を作成
  const delegate_ix = Token.createRevokeInstruction(
    TOKEN_PROGRAM_ID,
    ata_dev_usdc,
    ctx.wallet.publicKey,
    [],
  );

  // Clockwork のスレッドを削除する命令を作成
  const delete_thread_ix = await clockwork_provider.threadDelete(
    ctx.wallet.publicKey,
    clockwork_thread_pda,
  );

  //LANG:JP トランザクション組み立て
  //LANG:EN Create a transaction and add the instruction
  const tx_builder = new TransactionBuilder(ctx.connection, ctx.wallet);
  //LANG:JP 更新&フィー回収&リワード回収
  //LANG:EN Update fees and rewards, collect fees, and collect rewards
  tx_builder.addInstruction({
    instructions: [],
    cleanupInstructions: [
      delegate_ix,
      delete_thread_ix,
    ],
    signers: [],
  });

  // トランザクション実行
  const size = await tx_builder.txnSize();
  console.log("transaction size", size);
  const signature = await tx_builder.buildAndExecute();
  console.log("signature", signature);

  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({signature, ...latest_blockhash}, "confirmed");
}

main();