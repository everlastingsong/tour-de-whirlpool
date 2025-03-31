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

//LANG:JP Orca が管理している WhirlpoolsConfig のアドレスは以下のページにリストされています
//LANG:EN These are the addresses of Orca owned WhirlpoolsConfig. For more details, see
// https://dev.orca.so/Architecture%20Overview/Account%20Architecture
const DEVNET_WHIRLPOOLS_CONFIG = new PublicKey("FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR");

async function main() {
  //LANG:JP WhirlpoolClient 作成
  //LANG:EN Create WhirlpoolClient
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  //LANG:JP 新たなトークンを作成 (トークンは事前に作成されているべきであり、チュートリアル固有の処理です)
  //LANG:EN Create new token mints. Note that the in a more realistic scenario,
  //LANG:EN the mints are generated beforehand.
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

  //LANG:JP 2 つのトークンを辞書順に並べ替え
  //LANG:JP Whirlpool は 2 つのトークン A/B のペアで構成されますが、順番がトークンのミントアドレスの辞書順と決まっています
  //LANG:JP 例えば、SOL/USDC のペアは作成できますが、USDC/SOL のペアは作成できません
  //LANG:EN Token A and Token B Mint has to be cardinally ordered
  //LANG:EN For example, SOL/USDC can be created, but USDC/SOL cannot be created
  const [tokenAddressA, tokenAddressB] = PoolUtil.orderMints(newTokenPubkeys[0], newTokenPubkeys[1]);

  //LANG:JP トークンのミントアカウントを取得
  //LANG:EN Fetch token mint infos
  const tokenA = await ctx.fetcher.getMintInfo(tokenAddressA);
  const tokenB = await ctx.fetcher.getMintInfo(tokenAddressB);
  const decimalsA = tokenA.decimals;
  const decimalsB = tokenB.decimals;
  console.log("tokenA:", tokenAddressA.toString(), "decimals:", decimalsA);
  console.log("tokenB:", tokenAddressB.toString(), "decimals:", decimalsB);

  //LANG:JP Concentrated Liquidity Pool の作成では tick_spacing を指定する必要があります
  //LANG:JP tick_spacing はプールの手数料定義にマッピングされます。詳細は以下を参照してください
  //LANG:EN The tick spacing maps to the fee tier of the pool. For more details, see
  // https://dev.orca.so/Architecture%20Overview/Whirlpool%20Parameters#initialized-feetiers
  const tickSpacing = 64;

  //LANG:JP プールの初期価格を設定 (価格単位は トークンB/トークンA)
  //LANG:EN Set the price of token A in terms of token B
  const initialPrice = new Decimal(0.01);

  //LANG:JP プールを作成
  //LANG:EN Create a new pool
  const { poolKey, tx: createPoolTxBuilder } = await client.createPool(
    DEVNET_WHIRLPOOLS_CONFIG,
    tokenAddressA,
    tokenAddressB,
    tickSpacing,
    PriceMath.priceToTickIndex(initialPrice, decimalsA, decimalsB),
    ctx.wallet.publicKey
  );
  const createPoolTxId = await createPoolTxBuilder.buildAndExecute();

  //LANG:JP 初期化したプールの Whirlpool アカウントを取得
  //LANG:EN Fetch pool data to verify the initial price and tick
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

  //LANG:JP createPool は現在価格を含む TickArray アカウントを初期化します
  //LANG:JP 流動性プロバイダ向けに、さらに TickArray アカウントを初期化することができます
  //LANG:JP 以下のコードは、全ての価格帯をカバーする (Full Range) ポジションを作成するために必要な
  //LANG:JP TickArray アカウントを初期化します
  //LANG:EN createPool initializes the tick array that houses the current tick.
  //LANG:EN To accomodate liquidity providers, you can initialize more tick array accounts.
  //LANG:EN The following code initializes the tick arrays that accomodates opening full range
  //LANG:EN positions.
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
