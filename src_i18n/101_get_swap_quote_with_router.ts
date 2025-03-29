import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { DecimalUtil } from "@orca-so/common-sdk";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  IGNORE_CACHE, getAllWhirlpoolAccountsForConfig, Trade,
  RoutingOptions, RouterUtils, RouteSelectOptions
} from "@orca-so/whirlpools-sdk";
import Decimal from "decimal.js";

//LANG:JP スクリプト実行前に環境変数定義が必要です
//LANG:EN Environment variables must be defined before script execution
//LANG:KR 스크립트 실행 전 환경변수 설정
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json

async function main() {
  //LANG:JP V0 トランザクション用の ALT を探す Lookup Table Fetcher を利用可能です
  //LANG:JP devnet では Orca が提供する Lookup Table Fetcher は存在しないため undefined とします
  //LANG:JP mainnet では以下のコードで Lookup Table Fetcher を作成できます
  //LANG:EN You can use the Lookup Table Fetcher to find ALTs for V0 transactions
  //LANG:EN The Lookup Table Fetcher provided by Orca is not available on devnet, so set it to undefined
  //LANG:EN On mainnet, you can create a Lookup Table Fetcher with the following code
  //LANG:KR V0 트랜잭션용 ALT를 찾기 위해 Lookup Table Fetcher를 사용할 수 있음
  //LANG:KR devnet에서는 Orca가 제공하는 Lookup Table Fetcher가 없으므로 undefined로 설정
  //LANG:KR mainnet에서는 아래 코드로 Lookup Table Fetcher를 생성
  //
  // import { OrcaLookupTableFetcher } from "@orca-so/orca-sdk";
  // import axios from "axios";
  // const server = axios.create({baseURL: "https://api.mainnet.orca.so/v1", responseType: "json"});
  // const lookupTableFetcher = new OrcaLookupTableFetcher(server, provider.connection);
  const lookupTableFetcher = undefined;

  //LANG:JP WhirlpoolClient 作成
  //LANG:EN Create WhirlpoolClient
  //LANG:KR WhirlpoolClient 생성
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID, undefined, lookupTableFetcher);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  //LANG:JP トークン定義
  //LANG:EN Token definition
  //LANG:KR 토큰 정의
  // devToken specification
  // https://everlastingsong.github.io/nebula/
  const devUSDC = {mint: new PublicKey("BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k"), decimals: 6};
  const devSAMO = {mint: new PublicKey("Jd4M8bfJG3sAkd82RsGWyEXoaBXQP7njFzBwEaCTuDa"), decimals: 9};
  const devTMAC = {mint: new PublicKey("Afn8YB1p4NsoZeS5XJBZ18LTfEy5NFPwN46wapZcBQr6"), decimals: 6};

  //LANG:JP Whirlpool の Config アカウント
  //LANG:EN WhirlpoolsConfig account
  //LANG:KR WhirlpoolsConfig 계정
  // devToken ecosystem / Orca Whirlpools
  const DEVNET_WHIRLPOOLS_CONFIG = new PublicKey("FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR");

  //LANG:JP DEVNET_WHIRLPOOLS_CONFIG に所属するプールをすべて取得する
  //LANG:EN Get all pools belonging to DEVNET_WHIRLPOOLS_CONFIG
  //LANG:KR DEVNET_WHIRLPOOLS_CONFIG에 속한 모든 풀 조회
  const devWhirlpools = await getAllWhirlpoolAccountsForConfig({
    connection: ctx.connection,
    programId: ctx.program.programId,
    configId: DEVNET_WHIRLPOOLS_CONFIG,
  });
  console.log("detected whirlpools:", devWhirlpools.size);

  //LANG:JP プールのうち、現在の流動性が 0 であるものは除外する(パフォーマンスを上げるため)
  //LANG:EN Exclude pools with current liquidity of 0 (to improve performance)
  //LANG:KR 현재 유동성이 0인 풀은 제외해 성능을 높임
  const addresses = Array.from(devWhirlpools.entries())
    .filter(([_address, data]) => !data.liquidity.isZero())
    .map(([address, _data]) => address);
  console.log("liquid whirlpools", addresses.length);

  //LANG:JP ルーターを作成する
  //LANG:EN Create router
  //LANG:KR 라우터를 생성
  const router = await client.getRouter(addresses);

  //LANG:JP 100 devSAMO トークンを devTMAC にスワップする
  //LANG:EN Trade 100 devSAMO for devTMAC
  //LANG:KR devSAMO 100개를 devTMAC으로 스왑
  const trade: Trade = {
    tokenIn: devSAMO.mint,
    tokenOut: devTMAC.mint,
    amountSpecifiedIsInput: true, // we specify devSAMO input amount
    tradeAmount: DecimalUtil.toBN(new Decimal("100"), devSAMO.decimals),
  };

  //LANG:JP ルートの生成に利用するオプションを指定する
  //LANG:EN Specify the options to be used to generate the route
  //LANG:KR 라우트 생성을 위한 옵션을 지정
  const routingOptions: RoutingOptions = {
    ...RouterUtils.getDefaultRouteOptions(),
    //LANG:JP ルートの分割数や各ルートに割り当てる割合の変化率などを指定する
    //LANG:EN Specify the number of splits in the route and the rate of change of the allocation assigned to each route
    //LANG:KR 라우트의 분할 개수 및 각 라우트에 할당할 비율의 변화 정도 등을 지정
  };
  const selectionOptions: RouteSelectOptions = {
    ...RouterUtils.getDefaultSelectOptions(),
    //LANG:JP V0 トランザクションをサポートするかどうかを指定する。デフォルトでは true となっている
    //LANG:EN Specify whether to support V0 transactions. The default is true
    //LANG:KR V0 트랜잭션 지원 여부를 지정. 기본값은 true
    maxSupportedTransactionVersion: ctx.txBuilderOpts.defaultBuildOption.maxSupportedTransactionVersion,
    //LANG:JP 作成済みの ATA を提供する (undefined の場合はチェーンからフェッチする)
    //LANG:JP 何度も同じ処理をする場合には、作成済みの ATA の一覧を指定することでパフォーマンスを向上させることができる
    //LANG:EN Provide the created ATA (fetch from the chain if undefined)
    //LANG:EN If you do the same process many times, you can improve performance by specifying a list of created ATAs
    //LANG:KR 이미 생성된 ATA를 제공 (undefined인 경우 온체인에서 페치)
    //LANG:KR 같은 프로세스를 여러 번 수행할 경우, 생성된 ATA 목록을 지정해 성능을 높일 수 있음
    availableAtaAccounts: undefined,
  };

  try {
    //LANG:JP 最適ルートを取得する
    //LANG:EN Get the best route
    //LANG:KR 최적 라우트를 조회
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

    //LANG:JP 取得したルートの詳細を表示する
    //LANG:JP チュートリアルでは devSAMO/devUSDC と devTMAC/devUSDC プールを経由して devSAMO から devTMAC にトレードされることを期待している
    //LANG:EN Display details of the route obtained
    //LANG:EN In this tutorial, we expect devSAMO to be traded for devTMAC via the devSAMO/devUSDC and devTMAC/devUSDC pools
    //LANG:KR 조회된 라우트의 상세 정보를 표시
    //LANG:KR 이 튜토리얼에서는 devSAMO/devUSDC와 devTMAC/devUSDC 풀을 거쳐 devSAMO에서 devTMAC으로 거래할 것으로 기대
    //
    // devSAMO/devUSDC: EgxU92G34jw6QDG9RuTX9StFg1PmHuDqkRKAE5kVEiZ4
    // devTMAC/devUSDC: H3xhLrSEyDFm6jjG42QezbvhSxF5YHW75VdGUnqeEg5y
    const [tradeRoute, alts] = bestRoute;
    console.log("estimatedAmountIn:", DecimalUtil.fromBN(tradeRoute.totalAmountIn, devSAMO.decimals));
    console.log("estimatedAmountOut:", DecimalUtil.fromBN(tradeRoute.totalAmountOut, devTMAC.decimals));
    tradeRoute.subRoutes.forEach((subRoute, i) => {
      console.log(`subRoute[${i}] ${subRoute.splitPercent}%:`, subRoute.path.edges.map((e) => e.poolAddress).join(" - "));
    });
    console.log("alts:", alts?.map((a) => a.key.toBase58()).join(", "));
  } catch (e) {
    console.error(e);
  }
}

main();
