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
import secret from "../wallet.json";

// UNIX/Linux/Mac
// bash$ export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// bash$ export ANCHOR_WALLET=wallet.json
// bash$ ts-node this_script.ts
//
// Windows
// > set ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// > set ANCHOR_WALLET=wallet.json
// > ts-node this_script.ts

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

  // LANG:EN The tick spacing maps to the fee tier of the pool. For more details, see
  // LANG:EN https://dev.orca.so/Architecture%20Overview/Whirlpool%20Parameters#initialized-feetiers
  const tickSpacing = 64;

  // LANG:EN Set the price of token A in terms of token B and map price to an initializable tick
  // LANG:EN For more details, see https://dev.orca.so/Architecture%20Overview/Price%20&%20Ticks
  const initialPrice = new Decimal(0.01);
  const initialTick = PriceMath.priceToTickIndex(
    initialPrice,
    decimalsA,
    decimalsB
  );
  const initialInitializableTick = TickUtil.getInitializableTickIndex(
    initialTick,
    tickSpacing
  );

  // LANG:EN Create a new pool
  const { poolKey, tx: createPoolTxBuilder } = await client.createPool(
    ORCA_WHIRLPOOLS_CONFIG_DEVNET,
    mintAddressA,
    mintAddressB,
    tickSpacing,
    initialInitializableTick,
    ctx.wallet.publicKey
  );
  const createPoolTxId = await createPoolTxBuilder.buildAndExecute();

  // LANG:EN Fetch pool data to verify the initial price and tick
  const pool = await client.getPool(poolKey);
  const poolData = pool.getData();
  const poolInitialPrice = PriceMath.sqrtPriceX64ToPrice(
    poolData.sqrtPrice,
    decimalsA,
    decimalsB
  );
  const poolInitialTick = poolData.tickCurrentIndex;

  console.log("createPoolTxId:", createPoolTxId);
  console.log("poolKey:", poolKey.toBase58());
  console.log("initialPrice:", poolInitialPrice);
  console.log("initialTick:", poolInitialTick);

  // LANG:EN createPool initializes the tick array that houses the current tick.
  // LANG:EN To accomodate liquidity providers, you can initialize more tick array accounts.
  // LANG:EN The following code initializes the tick arrays that accomodates opening full range
  // LANG:EN positions.
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
