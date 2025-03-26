import { AnchorProvider } from "@coral-xyz/anchor";
import {
  WhirlpoolContext,
  buildWhirlpoolClient,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  TickUtil,
  PriceMath,
} from "@orca-so/whirlpools-sdk";
import {
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
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

//  These are the addresses of Orca owned Whirlpool Configs.
//  For more details, see https://dev.orca.so/Architecture%20Overview/Account%20Architecture
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

  //  Determin the addresses of tokenA and tokenB. Note that the program
  //  enforces the order of tokenA and tokenB: https://github.com/orca-so/whirlpools/blob/9ced62d710ca76b11dc399d22d08e7c6648be251/programs/whirlpool/src/state/whirlpool.rs#L117-L119
  //  In case you need to reorder the tokens, make sure to invert the price.
  //  If you're the token creator, you can also create new token mint addresses.
  const tokenMintAddressA = new PublicKey("<TOKEN_A_MINT_ADDRESS>");
  const tokenMintAddressB = new PublicKey("<TOKEN_B_MINT_ADDRESS>");

  //  Fetch mint info to retrieve decimals
  const tokenMintA = await getMint(
    ctx.connection,
    tokenMintAddressA,
    "confirmed",
    TOKEN_2022_PROGRAM_ID
  );
  const tokenMintB = await getMint(
    ctx.connection,
    tokenMintAddressB,
    "confirmed",
    TOKEN_PROGRAM_ID
  );
  const decimalsA = tokenMintA.decimals;
  const decimalsB = tokenMintB.decimals;

  //  The tick spacing maps to the fee tier of the pool. For more details, see
  //  https://dev.orca.so/Architecture%20Overview/Whirlpool%20Parameters#initialized-feetiers
  const tickSpacing = 64;

  //  Set the price of token A in terms of token B and map it to the initializable tick
  //  For more details, see https://dev.orca.so/Architecture%20Overview/Price%20&%20Ticks
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

  const { poolKey, tx } = await client.createPool(
    ORCA_WHIRLPOOLS_CONFIG_DEVNET,
    tokenMintAddressA,
    tokenMintAddressB,
    tickSpacing,
    initialInitializableTick,
    ctx.wallet.publicKey
  );

  const txId = await tx.buildAndExecute();

  console.log("txId:", txId);
  console.log("poolKey:", poolKey.toBase58());
}

main();
