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

// SplashPool と Concentrated Liquidity Pool の違い
// SplashPool は Concentrated Liquidity Pool の上に構築されますが、Constant Product AMM のように振る舞います。
// - SplashPool は特定の tick_spacing を持つ Whirlpool であり、Whirlpool として扱うことができます。
// - SplashPool は 2 つの TickArray のみを持ちます (シンプルで低コスト)
// - SplashPool は FullRange のポジションのみを許可します (Constant Product AMM に似ています)

// Orca が管理している WhirlpoolsConfig のアドレスは以下のページにリストされています
// https://dev.orca.so/Architecture%20Overview/Account%20Architecture
const DEVNET_WHIRLPOOLS_CONFIG = new PublicKey("FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR");

async function main() {
  // WhirlpoolClient 作成
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  // 新たなトークンを作成 (トークンは事前に作成されているべきであり、チュートリアル固有の処理です)
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

  // 2 つのトークンを辞書順に並べ替え
  // Whirlpool は 2 つのトークン A/B のペアで構成されますが、順番がトークンのミントアドレスの辞書順と決まっています
  // 例えば、SOL/USDC のペアは作成できますが、USDC/SOL のペアは作成できません
  const [tokenAddressA, tokenAddressB] = PoolUtil.orderMints(newTokenPubkeys[0], newTokenPubkeys[1]);

  // トークンのミントアカウントを取得
  const tokenA = await ctx.fetcher.getMintInfo(tokenAddressA);
  const tokenB = await ctx.fetcher.getMintInfo(tokenAddressB);
  const decimalsA = tokenA.decimals;
  const decimalsB = tokenB.decimals;
  console.log("tokenA:", tokenAddressA.toString(), "decimals:", decimalsA);
  console.log("tokenB:", tokenAddressB.toString(), "decimals:", decimalsB);

  // プールの初期価格を設定 (価格単位は トークンB/トークンA)
  const initialPrice = new Decimal(0.01);

  // プールを作成
  const { poolKey, tx } = await client.createSplashPool(
    DEVNET_WHIRLPOOLS_CONFIG,
    tokenAddressA,
    tokenAddressB,
    initialPrice,
    ctx.wallet.publicKey
  );
  const txId = await tx.buildAndExecute();

  // 初期化したプールの Whirlpool アカウントを取得
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
