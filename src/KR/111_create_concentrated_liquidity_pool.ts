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

// Orca 가 관리하는 WhirlpoolsConfig 의 주소는 다음 페이지를 참조
// https://dev.orca.so/Architecture%20Overview/Account%20Architecture
const DEVNET_WHIRLPOOLS_CONFIG = new PublicKey("FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR");

async function main() {
  // WhirlpoolClient 생성
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  // 새로운 토큰을 생성. 이 튜토리얼의 경우, 토큰은 이미 생성되어 있어야 함.
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

  // 2개의 토큰을 사전순으로 정렬
  // 예를 들어 SOL/USDC 풀은 생성할 수 있지만, USDC/SOL 풀은 생성할 수 없음
  const [tokenAddressA, tokenAddressB] = PoolUtil.orderMints(newTokenPubkeys[0], newTokenPubkeys[1]);

  const tokenA = await ctx.fetcher.getMintInfo(tokenAddressA);
  const tokenB = await ctx.fetcher.getMintInfo(tokenAddressB);
  const decimalsA = tokenA.decimals;
  const decimalsB = tokenB.decimals;
  console.log("tokenA:", tokenAddressA.toString(), "decimals:", decimalsA);
  console.log("tokenB:", tokenAddressB.toString(), "decimals:", decimalsB);

  // tick_spacing 은 풀의 수수료 계층에 매핑됩니다. 자세한 내용은 다음을 참조
  // https://dev.orca.so/Architecture%20Overview/Whirlpool%20Parameters#initialized-feetiers
  const tickSpacing = 64;

  // 풀의 초기 가격을 설정합니다. 가격 단위는 토큰 B/토큰 A
  const initialPrice = new Decimal(0.01);

  // 새로운 풀을 생성
  const { poolKey, tx: createPoolTxBuilder } = await client.createPool(
    DEVNET_WHIRLPOOLS_CONFIG,
    tokenAddressA,
    tokenAddressB,
    tickSpacing,
    PriceMath.priceToTickIndex(initialPrice, decimalsA, decimalsB),
    ctx.wallet.publicKey
  );
  const createPoolTxId = await createPoolTxBuilder.buildAndExecute();

  // 초기화된 풀의 Whirlpool 계정을 가져옴
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
