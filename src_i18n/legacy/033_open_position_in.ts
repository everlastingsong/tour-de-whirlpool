import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil, PriceMath, increaseLiquidityQuoteByInputTokenWithParams,
  TokenExtensionUtil
} from "@orca-so/whirlpools-sdk";
import { DecimalUtil, Percentage } from "@orca-so/common-sdk";
import Decimal from "decimal.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

//LANG:JP スクリプト実行前に環境変数定義が必要です
//LANG:EN Environment variables must be defined before script execution
//LANG:KR 스크립트 실행 전 환경변수 설정
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json

async function main() {
  //LANG:JP WhirlpoolClient 作成
  //LANG:EN Create WhirlpoolClient
  //LANG:KR WhirlpoolClient 생성
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  //LANG:JP トークン定義
  //LANG:EN Token definition
  //LANG:KR 토큰 정의
  // devToken specification
  // https://everlastingsong.github.io/nebula/
  const devUSDC = { mint: new PublicKey("BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k"), decimals: 6 };
  const devSAMO = { mint: new PublicKey("Jd4M8bfJG3sAkd82RsGWyEXoaBXQP7njFzBwEaCTuDa"), decimals: 9 };

  //LANG:JP Whirlpool の Config アカウント
  //LANG:EN WhirlpoolsConfig account
  //LANG:KR WhirlpoolsConfig 계정
  // devToken ecosystem / Orca Whirlpools
  const DEVNET_WHIRLPOOLS_CONFIG = new PublicKey("FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR");

  //LANG:JP devSAMO/devUSDC プール取得
  //LANG:EN Get devSAMO/devUSDC whirlpool
  //LANG:KR devSAMO/devUSDC 풀 가져오기
  const tick_spacing = 64;
  const whirlpool_pubkey = PDAUtil.getWhirlpool(
    ORCA_WHIRLPOOL_PROGRAM_ID,
    DEVNET_WHIRLPOOLS_CONFIG,
    devSAMO.mint, devUSDC.mint, tick_spacing).publicKey;
  console.log("whirlpool_key:", whirlpool_pubkey.toBase58());
  const whirlpool = await client.getPool(whirlpool_pubkey);

  //LANG:JP プールにおける現在価格を取得
  //LANG:EN Get the current price of the pool
  //LANG:KR 풀의 현재 가격 조회
  const sqrt_price_x64 = whirlpool.getData().sqrtPrice;
  const price = PriceMath.sqrtPriceX64ToPrice(sqrt_price_x64, devSAMO.decimals, devUSDC.decimals);
  console.log("price:", price.toFixed(devUSDC.decimals));

  //LANG:JP 価格帯とデポジットするトークンの量、許容するスリッページを設定
  //LANG:EN Set price range, amount of tokens to deposit, and acceptable slippage
  //LANG:KR 가격 범위, 예치할 토큰 수량, 허용 슬리피지 설정
  const lower_price = new Decimal("0.005");
  const upper_price = new Decimal("0.02");
  const dev_usdc_amount = DecimalUtil.toBN(new Decimal("1" /* devUSDC */), devUSDC.decimals);
  const slippage = Percentage.fromFraction(10, 1000); // 1%

  //LANG:JP 価格帯を調整 (全ての価格が設定可能ではなく、範囲指定に利用できる価格は決まっている(InitializableTickIndexに対応する価格))
  //LANG:EN Adjust price range (not all prices can be set, only a limited number of prices are available for range specification)
  //LANG:EN (prices corresponding to InitializableTickIndex are available)
  //LANG:KR 가격 범위 조정 (모든 가격 설정 불가, InitializableTickIndex에 해당하는 가격만 사용 가능)
  const whirlpool_data = whirlpool.getData();
  const token_a = whirlpool.getTokenAInfo();
  const token_b = whirlpool.getTokenBInfo();
  const lower_tick_index = PriceMath.priceToInitializableTickIndex(lower_price, token_a.decimals, token_b.decimals, whirlpool_data.tickSpacing);
  const upper_tick_index = PriceMath.priceToInitializableTickIndex(upper_price, token_a.decimals, token_b.decimals, whirlpool_data.tickSpacing);
  console.log("lower & upper tick_index:", lower_tick_index, upper_tick_index);
  console.log("lower & upper price:",
    PriceMath.tickIndexToPrice(lower_tick_index, token_a.decimals, token_b.decimals).toFixed(token_b.decimals),
    PriceMath.tickIndexToPrice(upper_tick_index, token_a.decimals, token_b.decimals).toFixed(token_b.decimals)
  );

  //LANG:JP 見積もりを取得
  //LANG:EN Obtain deposit estimation
  //LANG:KR 예치 예상치 가져옴
  const quote = increaseLiquidityQuoteByInputTokenWithParams({
    //LANG:JP プールの定義や状態をそのまま渡す
    //LANG:EN Pass the pool definition and state
    //LANG:KR 풀 정의와 상태 그대로 전달함
    tokenMintA: token_a.mint,
    tokenMintB: token_b.mint,
    sqrtPrice: whirlpool_data.sqrtPrice,
    tickCurrentIndex: whirlpool_data.tickCurrentIndex,

    //LANG:JP 価格帯
    //LANG:EN Price range
    //LANG:KR 가격 범위
    tickLowerIndex: lower_tick_index,
    tickUpperIndex: upper_tick_index,

    //LANG:JP 入力にするトークン
    //LANG:EN Input token and amount
    //LANG:KR 입력할 토큰 및 수량
    inputTokenMint: devUSDC.mint,
    inputTokenAmount: dev_usdc_amount,

    //LANG:JP スリッページ
    //LANG:EN Acceptable slippage
    //LANG:KR 허용 슬리피지
    slippageTolerance: slippage,

    //LANG:JP TokenExtensions のトークン情報を取得
    //LANG:EN Get token info for TokenExtensions
    //LANG:KR TokenExtensions용 토큰 정보
    tokenExtensionCtx: await TokenExtensionUtil.buildTokenExtensionContext(ctx.fetcher, whirlpool_data),
  });

  //LANG:JP 見積もり結果表示
  //LANG:EN Output the estimation
  //LANG:KR 예상 결과 출력
  console.log("devSAMO max input:", DecimalUtil.fromBN(quote.tokenMaxA, token_a.decimals).toFixed(token_a.decimals));
  console.log("devUSDC max input:", DecimalUtil.fromBN(quote.tokenMaxB, token_b.decimals).toFixed(token_b.decimals));

  //LANG:JP トランザクションを作成
  //LANG:EN Create a transaction
  //LANG:KR 트랜잭션 생성
  const open_position_tx = await whirlpool.openPositionWithMetadata(
    lower_tick_index,
    upper_tick_index,
    quote,
    //LANG:JP WhirlpoolContext で提供されるウォレット
    //LANG:EN wallet provided with WhirlpoolContext
    //LANG:KR WhirlpoolContext에서 제공하는 지갑
    undefined,
    //LANG:JP 資金提供者 == ウォレット
    //LANG:EN funder == wallet
    //LANG:KR 자금 제공자 == 지갑
    undefined,
    //LANG:JP positionMintを自動生成する
    //LANG:EN let positionMint be auto-generated
    //LANG:KR positionMint 자동 생성
    undefined,
    TOKEN_2022_PROGRAM_ID
  );

  //LANG:JP トランザクションを送信
  //LANG:EN Send the transaction
  //LANG:KR 트랜잭션 전파
  const signature = await open_position_tx.tx.buildAndExecute();
  console.log("signature:", signature);
  console.log("position NFT:", open_position_tx.positionMint.toBase58());

  //LANG:JP トランザクション完了待ち
  //LANG:EN Wait for the transaction to complete
  //LANG:KR 트랜잭션 반영까지 대기
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({ signature, ...latest_blockhash }, "confirmed");
}

main();
