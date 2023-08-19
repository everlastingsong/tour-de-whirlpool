import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil, PriceMath, IGNORE_CACHE, PositionBundleUtil, WhirlpoolIx
} from "@orca-so/whirlpools-sdk";
import { TransactionBuilder } from "@orca-so/common-sdk";
import Decimal from "decimal.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

// スクリプト実行前に環境変数定義が必要です
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json
// WHIRLPOOL_POSITION_BUNDLE=address_of_position_bundle

async function main() {
  // WhirlpoolClient 作成
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  // トークン定義
  // devToken specification
  // https://everlastingsong.github.io/nebula/
  const devUSDC = {mint: new PublicKey("BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k"), decimals: 6};
  const devSAMO = {mint: new PublicKey("Jd4M8bfJG3sAkd82RsGWyEXoaBXQP7njFzBwEaCTuDa"), decimals: 9};

  // Whirlpool の Config アカウント
  // devToken ecosystem / Orca Whirlpools
  const NEBULA_WHIRLPOOLS_CONFIG = new PublicKey("FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR");

  // 環境変数 WHIRLPOOL_POSITION_BUNDLE から PositionBundle のアドレスを読み込み
  const position_bundle_address = process.env.WHIRLPOOL_POSITION_BUNDLE;
  const position_bundle_pubkey = new PublicKey(position_bundle_address);
  console.log("position bundle address:", position_bundle_pubkey.toBase58());

  // devSAMO/devUSDC プール取得
  const tick_spacing = 64;
  const whirlpool_pubkey = PDAUtil.getWhirlpool(
      ORCA_WHIRLPOOL_PROGRAM_ID,
      NEBULA_WHIRLPOOLS_CONFIG,
      devSAMO.mint, devUSDC.mint, tick_spacing).publicKey;
  console.log("whirlpool_key:", whirlpool_pubkey.toBase58());
  const whirlpool = await client.getPool(whirlpool_pubkey);

  // プールにおける現在価格を取得
  const sqrt_price_x64 = whirlpool.getData().sqrtPrice;
  const price = PriceMath.sqrtPriceX64ToPrice(sqrt_price_x64, devSAMO.decimals, devUSDC.decimals);
  console.log("price:", price.toFixed(devUSDC.decimals));

  // 価格帯を設定
  const lower_price = new Decimal("0.005");
  const upper_price = new Decimal("0.02");

  // 価格帯を調整 (全ての価格が設定可能ではなく、範囲指定に利用できる価格は決まっている(InitializableTickIndexに対応する価格))
  const whirlpool_data = whirlpool.getData();
  const token_a = whirlpool.getTokenAInfo();
  const token_b = whirlpool.getTokenBInfo();
  const lower_tick_index = PriceMath.priceToInitializableTickIndex(lower_price, token_a.decimals, token_b.decimals, whirlpool_data.tickSpacing);
  const upper_tick_index = PriceMath.priceToInitializableTickIndex(upper_price, token_a.decimals, token_b.decimals, whirlpool_data.tickSpacing);
  console.log("lower & upper tick_index:", lower_tick_index, upper_tick_index);
  console.log("lower & upper price:",
    PriceMath.tickIndexToPrice(lower_tick_index, token_a.decimals, token_b.decimals).toFixed(token_b.decimals),
    PriceMath.tickIndexToPrice(upper_tick_index, token_a.decimals, token_b.decimals).toFixed(token_b.decimals)
  );

  // PositionBundle アカウントを取得
  const position_bundle = await ctx.fetcher.getPositionBundle(position_bundle_pubkey, IGNORE_CACHE);

  // PositionBundle 向けの ATA を取得
  const position_bundle_token_account = getAssociatedTokenAddressSync(position_bundle.positionBundleMint, ctx.wallet.publicKey);

  // PositionBundle における未使用の bundle index を取得
  const unoccupied_bundle_indexes = PositionBundleUtil.getUnoccupiedBundleIndexes(position_bundle);
  console.log("unoccupied bundle indexes (first 10):", unoccupied_bundle_indexes.slice(0, 10));

  // PositionBundle で管理するポジションのアドレスを 2 個生成
  const bundled_position_one_pda = PDAUtil.getBundledPosition(ctx.program.programId, position_bundle.positionBundleMint, unoccupied_bundle_indexes[0]);
  const bundled_position_two_pda = PDAUtil.getBundledPosition(ctx.program.programId, position_bundle.positionBundleMint, unoccupied_bundle_indexes[1]);
  console.log(`bundled position one (${unoccupied_bundle_indexes[0]}) pubkey:`, bundled_position_one_pda.publicKey.toBase58());
  console.log(`bundled position two (${unoccupied_bundle_indexes[1]}) pubkey:`, bundled_position_two_pda.publicKey.toBase58());

  // PositionBundle で管理する 1 個目のポジションをオープンする命令を作成
  const open_bundled_position_one_ix = WhirlpoolIx.openBundledPositionIx(
    ctx.program,
    {
      funder: ctx.wallet.publicKey,
      positionBundle: position_bundle_pubkey,
      positionBundleAuthority: ctx.wallet.publicKey,
      positionBundleTokenAccount: position_bundle_token_account,
      bundleIndex: unoccupied_bundle_indexes[0],
      bundledPositionPda: bundled_position_one_pda,
      whirlpool: whirlpool_pubkey,
      tickLowerIndex: lower_tick_index,
      tickUpperIndex: upper_tick_index,
    },
  );

  // PositionBundle で管理する 2 個目のポジションをオープンする命令を作成
  const open_bundled_position_two_ix = WhirlpoolIx.openBundledPositionIx(
    ctx.program,
    {
      funder: ctx.wallet.publicKey,
      positionBundle: position_bundle_pubkey,
      positionBundleAuthority: ctx.wallet.publicKey,
      positionBundleTokenAccount: position_bundle_token_account,
      bundleIndex: unoccupied_bundle_indexes[1],
      bundledPositionPda: bundled_position_two_pda,
      whirlpool: whirlpool_pubkey,
      tickLowerIndex: lower_tick_index,
      tickUpperIndex: upper_tick_index,
    },
  );

  // トランザクション組み立て
  const tx_builder = new TransactionBuilder(ctx.connection, ctx.wallet);
  tx_builder
    .addInstruction(open_bundled_position_one_ix)
    .addInstruction(open_bundled_position_two_ix);

  // トランザクションを送信
  const signature = await tx_builder.buildAndExecute();
  console.log("signature:", signature);

  // トランザクション完了待ち
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({signature, ...latest_blockhash}, "confirmed");
}

main();
