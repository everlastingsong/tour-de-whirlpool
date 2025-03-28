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
import secret from "../../wallet.json";
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
const ORCA_WHIRLPOOLS_CONFIG_MAINNET = new PublicKey(
  "2LecshUwdy9xi7meFgHtFJQNSKk4KdTrcpvaB56dP2NQ"
);
const ORCA_WHIRLPOOLS_CONFIG_DEVNET = new PublicKey(
  "FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR"
);

async function main() {
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(
    provider,
    ORCA_WHIRLPOOL_PROGRAM_ID
  );
  const client = buildWhirlpoolClient(ctx);
  const signer = Keypair.fromSecretKey(new Uint8Array(secret));

  // LANG:EN Create new token mints. Note that the in a more realistic scenario,
  // LANG:EN the mints are generated beforehand.
  const decimalsA = 6;
  const decimalsB = 9;
  const mintPublicKeyA = await createMint(
    ctx.connection,
    signer,
    ctx.wallet.publicKey,
    null,
    decimalsA
  );
  const mintPublicKeyB = await createMint(
    ctx.connection,
    signer,
    ctx.wallet.publicKey,
    null,
    decimalsB
  );

  // LANG:EN Token A and Token B Mint has to be cardinally ordered
  const [mintAddressA, mintAddressB] = PoolUtil.orderMints(
    mintPublicKeyA.toString(),
    mintPublicKeyB.toString()
  );

  // LANG:EN Set the price of token A in terms of token B
  const initialPrice = new Decimal(0.01);

  const { poolKey, tx } = await client.createSplashPool(
    ORCA_WHIRLPOOLS_CONFIG_DEVNET,
    mintAddressA,
    mintAddressB,
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
  console.log("poolKey:", poolKey.toBase58());
  console.log("initialPrice:", poolInitialPrice);
  console.log("initialTick:", poolInitialTick);
}

main();
