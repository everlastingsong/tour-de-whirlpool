import { AnchorProvider } from "@coral-xyz/anchor";
import {
  WhirlpoolContext,
  buildWhirlpoolClient,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  PoolUtil,
  PriceMath,
} from "@orca-so/whirlpools-sdk";
import { Keypair, PublicKey } from "@solana/web3.js";
import Decimal from "decimal.js";
import { createMint } from "@solana/spl-token";

// UNIX/Linux/Mac
// bash$ export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// bash$ export ANCHOR_WALLET=wallet.json
// bash$ ts-node this_script.ts
//
// Windows
// > set ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// > set ANCHOR_WALLET=wallet.json
// > ts-node this_script.ts

// LANG:EN What is a SplashPool?
// LANG:EN SplashPools are built on top of Orca's CLMM, but behave similar to a Constant Product AMM.
// LANG:EN - it is a Whirlpool with a specific tick_spacing. SplashPool can be handled as Whirlpool.
// LANG:EN - it has only 2 TickArrays (simple, low cost), which are initialized in the createSplashPool function.
// LANG:EN - it allows FullRange positions only (similar to Constant Product AMM)

// LANG:EN These are the addresses of Orca owned Whirlpool Configs.
// LANG:EN For more details, see https://dev.orca.so/Architecture%20Overview/Account%20Architecture
const DEVNET_WHIRLPOOLS_CONFIG = new PublicKey("FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR");

async function main() {
  //LANG:JP WhirlpoolClient 作成
  //LANG:EN Create WhirlpoolClient
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  // LANG:EN Create new token mints. Note that the in a more realistic scenario,
  // LANG:EN the mints are generated beforehand.
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

  // LANG:EN Token A and Token B Mint has to be cardinally ordered
  // LANG:EN For example, SOL/USDC can be created, but USDC/SOL cannot be created
  const [tokenAddressA, tokenAddressB] = PoolUtil.orderMints(newTokenPubkeys[0], newTokenPubkeys[1]);

  // LANG:EN Fetch token mint infos
  const tokenA = await ctx.fetcher.getMintInfo(tokenAddressA);
  const tokenB = await ctx.fetcher.getMintInfo(tokenAddressB);
  const decimalsA = tokenA.decimals;
  const decimalsB = tokenB.decimals;
  console.log("tokenA:", tokenAddressA.toString(), "decimals:", decimalsA);
  console.log("tokenB:", tokenAddressB.toString(), "decimals:", decimalsB);

  // LANG:EN Set the price of token A in terms of token B
  const initialPrice = new Decimal(0.01);

  // LANG:EN Create a new pool
  const { poolKey, tx } = await client.createSplashPool(
    DEVNET_WHIRLPOOLS_CONFIG,
    tokenAddressA,
    tokenAddressB,
    initialPrice,
    ctx.wallet.publicKey
  );
  const txId = await tx.buildAndExecute();

  // LANG:EN Fetch pool data to verify the initial price and tick
  const pool = await client.getPool(poolKey);
  const poolData = pool.getData();
  const poolInitialPrice = PriceMath.sqrtPriceX64ToPrice(
    poolData.sqrtPrice,
    decimalsA,
    decimalsB
  );
  const poolInitialTick = poolData.tickCurrentIndex;

  console.log("txId:", txId);
  console.log(
    "poolKey:", poolKey.toBase58(),
    "\n  tokenA:", poolData.tokenMintA.toBase58(),
    "\n  tokenB:", poolData.tokenMintB.toBase58(),
    "\n  tickSpacing:", poolData.tickSpacing,
    "\n  initialPrice:", poolInitialPrice,
    "\n  initialTick:", poolInitialTick
  );
}

main();
