import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { DecimalUtil } from "@orca-so/common-sdk";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  IGNORE_CACHE, getAllWhirlpoolAccountsForConfig, Trade,
  RoutingOptions, RouterUtils, RouteSelectOptions
} from "@orca-so/whirlpools-sdk";
import Decimal from "decimal.js";

// 스크립트 실행 전 환경변수 설정
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json

async function main() {
  // V0 트랜잭션용 ALT를 찾기 위해 Lookup Table Fetcher를 사용할 수 있음
  // devnet에서는 Orca가 제공하는 Lookup Table Fetcher가 없으므로 undefined로 설정
  // mainnet에서는 아래 코드로 Lookup Table Fetcher를 생성
  //
  // import { OrcaLookupTableFetcher } from "@orca-so/orca-sdk";
  // import axios from "axios";
  // const server = axios.create({baseURL: "https://api.mainnet.orca.so/v1", responseType: "json"});
  // const lookupTableFetcher = new OrcaLookupTableFetcher(server, provider.connection);
  const lookupTableFetcher = undefined;

  // WhirlpoolClient 생성
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID, undefined, lookupTableFetcher);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  // 토큰 정의
  // devToken specification
  // https://everlastingsong.github.io/nebula/
  const devUSDC = {mint: new PublicKey("BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k"), decimals: 6};
  const devSAMO = {mint: new PublicKey("Jd4M8bfJG3sAkd82RsGWyEXoaBXQP7njFzBwEaCTuDa"), decimals: 9};
  const devTMAC = {mint: new PublicKey("Afn8YB1p4NsoZeS5XJBZ18LTfEy5NFPwN46wapZcBQr6"), decimals: 6};

  // WhirlpoolsConfig 계정
  // devToken ecosystem / Orca Whirlpools
  const DEVNET_WHIRLPOOLS_CONFIG = new PublicKey("FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR");

  // DEVNET_WHIRLPOOLS_CONFIG에 속한 모든 풀 조회
  const devWhirlpools = await getAllWhirlpoolAccountsForConfig({
    connection: ctx.connection,
    programId: ctx.program.programId,
    configId: DEVNET_WHIRLPOOLS_CONFIG,
  });
  console.log("detected whirlpools:", devWhirlpools.size);

  // 현재 유동성이 0인 풀은 제외해 성능을 높임
  const addresses = Array.from(devWhirlpools.entries())
    .filter(([_address, data]) => !data.liquidity.isZero())
    .map(([address, _data]) => address);
  console.log("liquid whirlpools", addresses.length);

  // 라우터를 생성
  const router = await client.getRouter(addresses);

  // devSAMO 100개를 devTMAC으로 스왑
  const trade: Trade = {
    tokenIn: devSAMO.mint,
    tokenOut: devTMAC.mint,
    amountSpecifiedIsInput: true, // we specify devSAMO input amount
    tradeAmount: DecimalUtil.toBN(new Decimal("100"), devSAMO.decimals),
  };

  // 라우트 생성을 위한 옵션을 지정
  const routingOptions: RoutingOptions = {
    ...RouterUtils.getDefaultRouteOptions(),
    // 라우트의 분할 개수 및 각 라우트에 할당할 비율의 변화 정도 등을 지정
  };
  const selectionOptions: RouteSelectOptions = {
    ...RouterUtils.getDefaultSelectOptions(),
    // V0 트랜잭션 지원 여부를 지정. 기본값은 true
    maxSupportedTransactionVersion: ctx.txBuilderOpts.defaultBuildOption.maxSupportedTransactionVersion,
    // 이미 생성된 ATA를 제공 (undefined인 경우 온체인에서 페치)
    // 같은 프로세스를 여러 번 수행할 경우, 생성된 ATA 목록을 지정해 성능을 높일 수 있음
    availableAtaAccounts: undefined,
  };

  try {
    // 최적 라우트를 조회
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

    // 조회된 라우트의 상세 정보를 표시
    // 이 튜토리얼에서는 devSAMO/devUSDC와 devTMAC/devUSDC 풀을 거쳐 devSAMO에서 devTMAC으로 거래할 것으로 기대
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
