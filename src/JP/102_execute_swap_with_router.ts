import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { DecimalUtil, Percentage } from "@orca-so/common-sdk";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  IGNORE_CACHE, getAllWhirlpoolAccountsForConfig, Trade,
  RoutingOptions, RouterUtils, RouteSelectOptions
} from "@orca-so/whirlpools-sdk";
import Decimal from "decimal.js";

// スクリプト実行前に環境変数定義が必要です
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json

async function main() {
  // V0 トランザクション用の ALT を探す Lookup Table Fetcher を利用可能です
  // devnet では Orca が提供する Lookup Table Fetcher は存在しないため undefined とします
  // mainnet では以下のコードで Lookup Table Fetcher を作成できます
  //
  // import { OrcaLookupTableFetcher } from "@orca-so/orca-sdk";
  // import axios from "axios";
  // const server = axios.create({baseURL: "https://api.mainnet.orca.so/v1", responseType: "json"});
  // const lookupTableFetcher = new OrcaLookupTableFetcher(server, provider.connection);
  const lookupTableFetcher = undefined;

  // WhirlpoolClient 作成
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID, undefined, lookupTableFetcher);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  // トークン定義
  // devToken specification
  // https://everlastingsong.github.io/nebula/
  const devUSDC = {mint: new PublicKey("BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k"), decimals: 6};
  const devSAMO = {mint: new PublicKey("Jd4M8bfJG3sAkd82RsGWyEXoaBXQP7njFzBwEaCTuDa"), decimals: 9};
  const devTMAC = {mint: new PublicKey("Afn8YB1p4NsoZeS5XJBZ18LTfEy5NFPwN46wapZcBQr6"), decimals: 6};

  // Whirlpool の Config アカウント
  // devToken ecosystem / Orca Whirlpools
  const DEVNET_WHIRLPOOLS_CONFIG = new PublicKey("FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR");

  // DEVNET_WHIRLPOOLS_CONFIG に所属するプールをすべて取得する
  const devWhirlpools = await getAllWhirlpoolAccountsForConfig({
    connection: ctx.connection,
    programId: ctx.program.programId,
    configId: DEVNET_WHIRLPOOLS_CONFIG,
  });
  console.log("detected whirlpools:", devWhirlpools.size);

  // プールのうち、現在の流動性が 0 であるものは除外する(パフォーマンスを上げるため)
  const addresses = Array.from(devWhirlpools.entries())
    .filter(([_address, data]) => !data.liquidity.isZero())
    .map(([address, _data]) => address);
  console.log("liquid whirlpools", addresses.length);

  // ルーターを作成する
  const router = await client.getRouter(addresses);

  // 100 devSAMO トークンを devTMAC にスワップする
  const trade: Trade = {
    tokenIn: devSAMO.mint,
    tokenOut: devTMAC.mint,
    amountSpecifiedIsInput: true, // we specify devSAMO input amount
    tradeAmount: DecimalUtil.toBN(new Decimal("100"), devSAMO.decimals),
  };

  // ルートの生成に利用するオプションを指定する
  const routingOptions: RoutingOptions = {
    ...RouterUtils.getDefaultRouteOptions(),
    // ルートの分割数や各ルートに割り当てる割合の変化率などを指定する
  };
  const selectionOptions: RouteSelectOptions = {
    ...RouterUtils.getDefaultSelectOptions(),
    // V0 トランザクションをサポートするかどうかを指定する。デフォルトでは true となっている
    maxSupportedTransactionVersion: ctx.txBuilderOpts.defaultBuildOption.maxSupportedTransactionVersion,
    // 作成済みの ATA を提供する (undefined の場合はチェーンからフェッチする)
    // 何度も同じ処理をする場合には、作成済みの ATA の一覧を指定することでパフォーマンスを向上させることができる
    availableAtaAccounts: undefined,
  };

  try {
    // 最適ルートを取得する
    const bestRoute = await router.findBestRoute(
      trade,
      routingOptions,
      selectionOptions,
      IGNORE_CACHE,
    );

    if (!bestRoute) {
      console.log("No route found");
      return;
    }

    // 取得したルートの詳細を表示する
    // チュートリアルでは devSAMO/devUSDC と devTMAC/devUSDC プールを経由して devSAMO から devTMAC にトレードされることを期待している
    // devSAMO/devUSDC: EgxU92G34jw6QDG9RuTX9StFg1PmHuDqkRKAE5kVEiZ4
    // devTMAC/devUSDC: H3xhLrSEyDFm6jjG42QezbvhSxF5YHW75VdGUnqeEg5y
    const [tradeRoute, alts] = bestRoute;
    console.log("estimatedAmountIn:", DecimalUtil.fromBN(tradeRoute.totalAmountIn, devSAMO.decimals));
    console.log("estimatedAmountOut:", DecimalUtil.fromBN(tradeRoute.totalAmountOut, devTMAC.decimals));
    tradeRoute.subRoutes.forEach((subRoute, i) => {
      console.log(`subRoute[${i}] ${subRoute.splitPercent}%:`, subRoute.path.edges.map((e) => e.poolAddress).join(" - "));
    });
    console.log("alts:", alts?.map((a) => a.key.toBase58()).join(", "));

    // 許容するスリッページ (10/1000 = 1%)
    const slippage = Percentage.fromFraction(10, 1000);

    // トランザクションを送信
    const tx = await router.swap(tradeRoute, slippage, null);
    const signature = await tx.buildAndExecute({
      // ALT を使用する場合のみ V0 Transaction を利用する
      maxSupportedTransactionVersion: !!alts ? 0 : "legacy",
      lookupTableAccounts: alts,
    });
    console.log("signature:", signature);

    // トランザクション完了待ち
    const latest_blockhash = await ctx.connection.getLatestBlockhash();
    await ctx.connection.confirmTransaction({signature, ...latest_blockhash}, "confirmed");
  } catch (e) {
    console.error(e);
  }
}

main();
