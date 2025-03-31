import { AnchorProvider } from "@coral-xyz/anchor";
import {
  WhirlpoolContext,
  buildWhirlpoolClient,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  PriceMath,
  PoolUtil,
  TickUtil,
} from "@orca-so/whirlpools-sdk";
import { createMint } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import Decimal from "decimal.js";

// UNIX/Linux/Mac
// bash$ export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// bash$ export ANCHOR_WALLET=wallet.json
// bash$ ts-node this_script.ts
//
// Windows
// > set ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// > set ANCHOR_WALLET=wallet.json
// > ts-node this_script.ts

// These are the addresses of Orca owned WhirlpoolsConfig. For more details, see
// https://dev.orca.so/Architecture%20Overview/Account%20Architecture
const DEVNET_WHIRLPOOLS_CONFIG = new PublicKey("FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR");

async function main() {
  // Create WhirlpoolClient
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  // Create new token mints. Note that the in a more realistic scenario,
  // the mints are generated beforehand.
  const walletKeypair = (ctx.wallet as unknown as { payer: Keypair }).payer;
  const newTokenPubkeys = await Promise.all([
    createMint(
      ctx.connection,
      walletKeypair,
      ctx.wallet.publicKey, // mint authority
      null, // freeze authority
      9, // decimals
    ),
    createMint(
      ctx.connection,
      walletKeypair,
      ctx.wallet.publicKey, // mint authority
      null, // freeze authority
      6, // decimals
    ),
  ]);

  // Token A and Token B Mint has to be cardinally ordered
  // For example, SOL/USDC can be created, but USDC/SOL cannot be created
  const [tokenAddressA, tokenAddressB] = PoolUtil.orderMints(newTokenPubkeys[0], newTokenPubkeys[1]);

  // Fetch token mint infos
  const tokenA = await ctx.fetcher.getMintInfo(tokenAddressA);
  const tokenB = await ctx.fetcher.getMintInfo(tokenAddressB);
  const decimalsA = tokenA.decimals;
  const decimalsB = tokenB.decimals;
  console.log("tokenA:", tokenAddressA.toString(), "decimals:", decimalsA);
  console.log("tokenB:", tokenAddressB.toString(), "decimals:", decimalsB);

  // The tick spacing maps to the fee tier of the pool. For more details, see
  // https://dev.orca.so/Architecture%20Overview/Whirlpool%20Parameters#initialized-feetiers
  const tickSpacing = 64;

  // Set the price of token A in terms of token B
  const initialPrice = new Decimal(0.01);

  // Create a new pool
  const { poolKey, tx: createPoolTxBuilder } = await client.createPool(
    DEVNET_WHIRLPOOLS_CONFIG,
    tokenAddressA,
    tokenAddressB,
    tickSpacing,
    PriceMath.priceToTickIndex(initialPrice, decimalsA, decimalsB),
    ctx.wallet.publicKey
  );
  const createPoolTxId = await createPoolTxBuilder.buildAndExecute();

  // Fetch pool data to verify the initial price and tick
  const pool = await client.getPool(poolKey);
  const poolData = pool.getData();
  const poolInitialPrice = PriceMath.sqrtPriceX64ToPrice(
    poolData.sqrtPrice,
    decimalsA,
    decimalsB
  );
  const poolInitialTick = poolData.tickCurrentIndex;

  console.log("createPoolTxId:", createPoolTxId);
  console.log(
    "poolKey:", poolKey.toBase58(),
    "\n  tokenA:", poolData.tokenMintA.toBase58(),
    "\n  tokenB:", poolData.tokenMintB.toBase58(),
    "\n  tickSpacing:", poolData.tickSpacing,
    "\n  initialPrice:", poolInitialPrice,
    "\n  initialTick:", poolInitialTick
  );

  // createPool initializes the tick array that houses the current tick.
  // To accomodate liquidity providers, you can initialize more tick array accounts.
  // The following code initializes the tick arrays that accomodates opening full range
  // positions.
  const [lowestInitializableTick, highestInitializableTick] =
    TickUtil.getFullRangeTickIndex(tickSpacing);
  const initTickArraysTxBuilder = await pool.initTickArrayForTicks([
    lowestInitializableTick,
    highestInitializableTick,
  ]);
  const initTickArraysTxId = await initTickArraysTxBuilder.buildAndExecute();

  console.log("initTickArraysTxId:", initTickArraysTxId);
}

main();
