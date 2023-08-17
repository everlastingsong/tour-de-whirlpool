import { PublicKey } from "@solana/web3.js";
import { AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  decreaseLiquidityQuoteByLiquidityWithParams
} from "@orca-so/whirlpools-sdk";
import { DecimalUtil, Percentage } from "@orca-so/common-sdk";

// Environment variables must be defined before script execution
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json
// WHIRLPOOL_POSITION=address_of_position

async function main() {
  // Create WhirlpoolClient
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  // Retrieve the position address from the WHIRLPOOL_POSITION environment variable
  const position_address = process.env.WHIRLPOOL_POSITION;
  const position_pubkey = new PublicKey(position_address);
  console.log("position address:", position_pubkey.toBase58());

  // Get the position and the pool to which the position belongs
  const position = await client.getPosition(position_pubkey);
  const whirlpool = await client.getPool(position.getData().whirlpool);

  // Set the percentage of liquidity to be withdrawn (30%)
  const liquidity = position.getData().liquidity;
  const delta_liquidity = liquidity.mul(new BN(30)).div(new BN(100));

  console.log("liquidity:", liquidity.toString());
  console.log("delta_liquidity:", delta_liquidity.toString());

  // Set acceptable slippage
  const slippage = Percentage.fromFraction(10, 1000); // 1%

  // Obtain withdraw estimation
  const whirlpool_data = whirlpool.getData();
  const token_a = whirlpool.getTokenAInfo();
  const token_b = whirlpool.getTokenBInfo();
  const quote = decreaseLiquidityQuoteByLiquidityWithParams({
    // Pass the pool state as is
    sqrtPrice: whirlpool_data.sqrtPrice,
    tickCurrentIndex: whirlpool_data.tickCurrentIndex,
    // Pass the price range of the position as is
    tickLowerIndex: position.getData().tickLowerIndex,
    tickUpperIndex: position.getData().tickUpperIndex,
    // Liquidity to be withdrawn
    liquidity: delta_liquidity,
    // Acceptable slippage
    slippageTolerance: slippage,
  });

  // Output the estimation
  console.log("devSAMO min output", DecimalUtil.fromBN(quote.tokenMinA, token_a.decimals).toFixed(token_a.decimals));
  console.log("devUSDC min output", DecimalUtil.fromBN(quote.tokenMinB, token_b.decimals).toFixed(token_b.decimals));

  // Output the liquidity before transaction execution
  console.log("liquidity(before):", position.getData().liquidity.toString());

  // Create a transaction
  const decrease_liquidity_tx = await position.decreaseLiquidity(quote);

  // Send the transaction
  const signature = await decrease_liquidity_tx.buildAndExecute();
  console.log("signature:", signature);

  // Wait for the transaction to complete
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({signature, ...latest_blockhash}, "confirmed");

  // Output the liquidity after transaction execution
  console.log("liquidity(after):", (await position.refreshData()).liquidity.toString());
}

main();
