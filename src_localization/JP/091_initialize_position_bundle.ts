import { Keypair } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil, WhirlpoolIx
} from "@orca-so/whirlpools-sdk";
import { TransactionBuilder } from "@orca-so/common-sdk";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

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

  // PositionBundle 用の Mint, PDA, ATA のアドレスを生成
  const position_bundle_mint_keypair = Keypair.generate();
  const position_bundle_pda = PDAUtil.getPositionBundle(ORCA_WHIRLPOOL_PROGRAM_ID, position_bundle_mint_keypair.publicKey);
  const position_bundle_token_account = getAssociatedTokenAddressSync(position_bundle_mint_keypair.publicKey, ctx.wallet.publicKey);

  // PositionBundle 初期化命令を作成
  const initialize_position_bundle_ix = WhirlpoolIx.initializePositionBundleIx(
    ctx.program,
    {
      funder: ctx.wallet.publicKey,
      owner: ctx.wallet.publicKey,
      positionBundleMintKeypair: position_bundle_mint_keypair,
      positionBundlePda: position_bundle_pda,
      positionBundleTokenAccount: position_bundle_token_account,
    }
  );

  // トランザクションを作成
  const tx_builder = new TransactionBuilder(ctx.connection, ctx.wallet);
  tx_builder.addInstruction(initialize_position_bundle_ix);

  // トランザクションを送信
  const signature = await tx_builder.buildAndExecute();
  console.log("signature:", signature);
  console.log("position bundle NFT:", position_bundle_mint_keypair.publicKey.toBase58());
  console.log("position bundle address:", position_bundle_pda.publicKey.toBase58());

  // トランザクション完了待ち
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({signature, ...latest_blockhash}, "confirmed");
}

main();
