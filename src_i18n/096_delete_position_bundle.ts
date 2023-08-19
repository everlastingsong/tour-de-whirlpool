import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil, IGNORE_CACHE, PositionBundleUtil, decreaseLiquidityQuoteByLiquidityWithParams, PositionBundleData, WhirlpoolClient, PoolUtil, WhirlpoolIx
} from "@orca-so/whirlpools-sdk";
import { DecimalUtil, EMPTY_INSTRUCTION, Instruction, Percentage, TransactionBuilder, resolveOrCreateATA } from "@orca-so/common-sdk";
import { BN } from "bn.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

//LANG:JP スクリプト実行前に環境変数定義が必要です
//LANG:EN Environment variables must be defined before script execution
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json
// WHIRLPOOL_POSITION_BUNDLE=address_of_position_bundle

async function main() {
  //LANG:JP WhirlpoolClient 作成
  //LANG:EN Create WhirlpoolClient
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  //LANG:JP 環境変数 WHIRLPOOL_POSITION_BUNDLE から PositionBundle のアドレスを読み込み
  //LANG:EN Retrieve the position bundle address from the WHIRLPOOL_POSITION_BUNDLE environment variable
  const position_bundle_address = process.env.WHIRLPOOL_POSITION_BUNDLE;
  const position_bundle_pubkey = new PublicKey(position_bundle_address);
  console.log("position bundle address:", position_bundle_pubkey.toBase58());

  //LANG:JP PositionBundle アカウントを取得
  //LANG:EN Get PositionBundle account
  const position_bundle = await ctx.fetcher.getPositionBundle(position_bundle_pubkey, IGNORE_CACHE);

  //LANG:JP オープンされている BundledPosition が存在する場合は削除不可
  //LANG:EN If there are open BundledPositions, it cannot be deleted
  if (!PositionBundleUtil.isEmpty(position_bundle)) {
    console.log("position bundle is not empty");
    return;
  }

  //LANG:JP PositionBundle 削除命令を作成
  //LANG:EN Build the instruction to delete PositionBundle
  const position_bundle_token_account = getAssociatedTokenAddressSync(position_bundle.positionBundleMint, ctx.wallet.publicKey);
  const delete_position_bundle_ix = WhirlpoolIx.deletePositionBundleIx(
    ctx.program,
    {
      positionBundle: position_bundle_pubkey,
      positionBundleMint: position_bundle.positionBundleMint,
      positionBundleTokenAccount: position_bundle_token_account,
      owner: ctx.wallet.publicKey,
      receiver: ctx.wallet.publicKey,
    }
  )

  //LANG:JP トランザクションを作成
  //LANG:EN Create a transaction
  const tx_builder = new TransactionBuilder(ctx.connection, ctx.wallet);
  tx_builder.addInstruction(delete_position_bundle_ix);

  //LANG:JP トランザクションを送信
  //LANG:EN Send the transaction
  const signature = await tx_builder.buildAndExecute();
  console.log("signature:", signature);

  //LANG:JP トランザクション完了待ち
  //LANG:EN Wait for the transaction to complete
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({signature, ...latest_blockhash}, "confirmed");
}

main();