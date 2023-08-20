import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil, PriceMath, IGNORE_CACHE, PositionBundleUtil, WhirlpoolIx
} from "@orca-so/whirlpools-sdk";
import { TransactionBuilder } from "@orca-so/common-sdk";
import Decimal from "decimal.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

// Environment variables must be defined before script execution
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json
// WHIRLPOOL_POSITION_BUNDLE=address_of_position_bundle

async function main() {
  // Create WhirlpoolClient
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  // Token definition
  // devToken specification
  // https://everlastingsong.github.io/nebula/
  const devUSDC = {mint: new PublicKey("BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k"), decimals: 6};
  const devSAMO = {mint: new PublicKey("Jd4M8bfJG3sAkd82RsGWyEXoaBXQP7njFzBwEaCTuDa"), decimals: 9};

  // WhirlpoolsConfig account
  // devToken ecosystem / Orca Whirlpools
  const DEVNET_WHIRLPOOLS_CONFIG = new PublicKey("FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR");

  // Retrieve the position bundle address from the WHIRLPOOL_POSITION_BUNDLE environment variable
  const position_bundle_address = process.env.WHIRLPOOL_POSITION_BUNDLE;
  const position_bundle_pubkey = new PublicKey(position_bundle_address);
  console.log("position bundle address:", position_bundle_pubkey.toBase58());

  // Get devSAMO/devUSDC whirlpool
  const tick_spacing = 64;
  const whirlpool_pubkey = PDAUtil.getWhirlpool(
      ORCA_WHIRLPOOL_PROGRAM_ID,
      DEVNET_WHIRLPOOLS_CONFIG,
      devSAMO.mint, devUSDC.mint, tick_spacing).publicKey;
  console.log("whirlpool_key:", whirlpool_pubkey.toBase58());
  const whirlpool = await client.getPool(whirlpool_pubkey);

  // Get the current price of the pool
  const sqrt_price_x64 = whirlpool.getData().sqrtPrice;
  const price = PriceMath.sqrtPriceX64ToPrice(sqrt_price_x64, devSAMO.decimals, devUSDC.decimals);
  console.log("price:", price.toFixed(devUSDC.decimals));

  // Set price range
  const lower_price = new Decimal("0.005");
  const upper_price = new Decimal("0.02");

  // Adjust price range (not all prices can be set, only a limited number of prices are available for range specification)
  // (prices corresponding to InitializableTickIndex are available)
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

  // Get PositionBundle account
  const position_bundle = await ctx.fetcher.getPositionBundle(position_bundle_pubkey, IGNORE_CACHE);

  // Get ATA for PositionBundle
  const position_bundle_token_account = getAssociatedTokenAddressSync(position_bundle.positionBundleMint, ctx.wallet.publicKey);

  // Get unused bundle indexes in PositionBundle
  const unoccupied_bundle_indexes = PositionBundleUtil.getUnoccupiedBundleIndexes(position_bundle);
  console.log("unoccupied bundle indexes (first 10):", unoccupied_bundle_indexes.slice(0, 10));

  // Generate 2 addresses for positions managed by PositionBundle
  const bundled_position_one_pda = PDAUtil.getBundledPosition(ctx.program.programId, position_bundle.positionBundleMint, unoccupied_bundle_indexes[0]);
  const bundled_position_two_pda = PDAUtil.getBundledPosition(ctx.program.programId, position_bundle.positionBundleMint, unoccupied_bundle_indexes[1]);
  console.log(`bundled position one (${unoccupied_bundle_indexes[0]}) pubkey:`, bundled_position_one_pda.publicKey.toBase58());
  console.log(`bundled position two (${unoccupied_bundle_indexes[1]}) pubkey:`, bundled_position_two_pda.publicKey.toBase58());

  // Create an instruction to open the first position managed by PositionBundle
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

  // Create an instruction to open the second position managed by PositionBundle
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

  // Create a transaction and add the instruction
  const tx_builder = new TransactionBuilder(ctx.connection, ctx.wallet);
  tx_builder
    .addInstruction(open_bundled_position_one_ix)
    .addInstruction(open_bundled_position_two_ix);

  // Send the transaction
  const signature = await tx_builder.buildAndExecute();
  console.log("signature:", signature);

  // Wait for the transaction to complete
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({signature, ...latest_blockhash}, "confirmed");
}

main();
