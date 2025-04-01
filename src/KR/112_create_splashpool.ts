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

// SplashPool 은 Concentrated Liquidity Pool 의 위에 구축되지만, Constant Product AMM 처럼 동작합니다.
// - SplashPool 은 특정 tick_spacing 을 가지며, Whirlpool 으로 취급할 수 있습니다.
// - SplashPool 은 2개의 TickArray 만 가지며, createSplashPool 함수에서 초기화됩니다.
// - SplashPool 은 FullRange 포지션만 허용합니다 (Constant Product AMM 와 유사합니다)

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

  // 토큰의 민트 정보를 가져옴
  const tokenA = await ctx.fetcher.getMintInfo(tokenAddressA);
  const tokenB = await ctx.fetcher.getMintInfo(tokenAddressB);
  const decimalsA = tokenA.decimals;
  const decimalsB = tokenB.decimals;
  console.log("tokenA:", tokenAddressA.toString(), "decimals:", decimalsA);
  console.log("tokenB:", tokenAddressB.toString(), "decimals:", decimalsB);

  // 토큰 A의 가격을 토큰 B의 가격으로 설정
  const initialPrice = new Decimal(0.01);

  // 새로운 풀을 생성
  const { poolKey, tx } = await client.createSplashPool(
    DEVNET_WHIRLPOOLS_CONFIG,
    tokenAddressA,
    tokenAddressB,
    initialPrice,
    ctx.wallet.publicKey
  );
  const txId = await tx.buildAndExecute();

  // 초기 가격과 tick을 확인하기 위해 pool 데이터를 가져옴
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
