import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@project-serum/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
} from "@orca-so/whirlpools-sdk";
import {
  deriveATA, TransactionBuilder
} from "@orca-so/common-sdk";
import {
  ClockworkProvider,
} from "@clockwork-xyz/sdk";
import {
  TOKEN_PROGRAM_ID, Token
} from "@solana/spl-token";

// スクリプト実行前に環境変数定義が必要です
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json
// WHIRLPOOL_POSITION=address_of_position

async function main() {
  // WhirlpoolClient 作成
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  // 環境変数 WHIRLPOOL_POSITION からポジションのアドレスを読み込み
  const position_address = process.env.WHIRLPOOL_POSITION;
  const position_pubkey = new PublicKey(position_address);
  console.log("position address:", position_pubkey.toBase58());

  // ポジション・プール取得
  const position = await client.getPosition(position_pubkey);
  const position_owner = ctx.wallet.publicKey;
  const position_token_account = await deriveATA(position_owner, position.getData().positionMint);

  // CLOCKWORK のアカウントアドレス計算
  const clockwork_provider = ClockworkProvider.fromAnchorProvider(provider);
  const clockwork_thread_id = `harvest-${position_pubkey.toBase58().slice(0, 8)}`;
  const [clockwork_thread_pda] = clockwork_provider.getThreadPDA(ctx.wallet.publicKey, clockwork_thread_id);
  console.log("clockwork thread pda:", clockwork_thread_pda.toBase58());

  // ポジションのトークンの権限を Clockwork から剥奪する命令を作成
  const delegate_ix = Token.createRevokeInstruction(
    TOKEN_PROGRAM_ID,
    position_token_account,
    ctx.wallet.publicKey,
    [],
  );

  // Clockwork のスレッドを削除する命令を作成
  const delete_thread_ix = await clockwork_provider.threadDelete(
    ctx.wallet.publicKey,
    clockwork_thread_pda,
  );

  // トランザクション組み立て
  const tx_builder = new TransactionBuilder(ctx.connection, ctx.wallet);
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
