import { PublicKey } from "@solana/web3.js";
import { AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  decreaseLiquidityQuoteByLiquidityWithParams,
  TokenExtensionUtil
} from "@orca-so/whirlpools-sdk";
import { DecimalUtil, Percentage } from "@orca-so/common-sdk";

//LANG:JP スクリプト実行前に環境変数定義が必要です
//LANG:EN Environment variables must be defined before script execution
//LANG:KR 스크립트 실행 전 환경변수 설정
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json
// WHIRLPOOL_POSITION=address_of_position

async function main() {
  //LANG:JP WhirlpoolClient 作成
  //LANG:EN Create WhirlpoolClient
  //LANG:KR WhirlpoolClient 생성
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  //LANG:JP 環境変数 WHIRLPOOL_POSITION からポジションのアドレスを読み込み
  //LANG:EN Retrieve the position address from the WHIRLPOOL_POSITION environment variable
  //LANG:KR 환경변수 WHIRLPOOL_POSITION에서 포지션 주소 가져옴
  const position_address = process.env.WHIRLPOOL_POSITION;
  const position_pubkey = new PublicKey(position_address);
  console.log("position address:", position_pubkey.toBase58());

  //LANG:JP ポジション・プール取得
  //LANG:EN Get the position and the pool to which the position belongs
  //LANG:KR 포지션과 해당 포지션이 속한 풀 가져옴
  const position = await client.getPosition(position_pubkey);
  const whirlpool = await client.getPool(position.getData().whirlpool);

  //LANG:JP 引き出す流動性を割合で指定 (30%)
  //LANG:EN Set the percentage of liquidity to be withdrawn (30%)
  //LANG:KR 인출할 유동성을 비율로 지정 (30%)
  const liquidity = position.getData().liquidity;
  const delta_liquidity = liquidity.mul(new BN(30)).div(new BN(100));

  console.log("liquidity:", liquidity.toString());
  console.log("delta_liquidity:", delta_liquidity.toString());

  //LANG:JP 許容するスリッページを設定
  //LANG:EN Set acceptable slippage
  //LANG:KR 허용 슬리피지 설정
  const slippage = Percentage.fromFraction(10, 1000); // 1%

  //LANG:JP 見積もりを取得
  //LANG:EN Obtain withdraw estimation
  //LANG:KR 출금 예상치 계산
  const whirlpool_data = whirlpool.getData();
  const token_a = whirlpool.getTokenAInfo();
  const token_b = whirlpool.getTokenBInfo();
  const quote = decreaseLiquidityQuoteByLiquidityWithParams({
    //LANG:JP プール状態をそのまま渡す
    //LANG:EN Pass the pool state as is
    //LANG:KR 풀 상태 그대로 전달
    sqrtPrice: whirlpool_data.sqrtPrice,
    tickCurrentIndex: whirlpool_data.tickCurrentIndex,

    //LANG:JP 価格帯はポジションのものをそのまま渡す
    //LANG:EN Pass the price range of the position as is
    //LANG:KR 포지션이 가진 가격 범위 그대로 전달
    tickLowerIndex: position.getData().tickLowerIndex,
    tickUpperIndex: position.getData().tickUpperIndex,

    //LANG:JP 引き出す流動性
    //LANG:EN Liquidity to be withdrawn
    //LANG:KR 인출할 유동성
    liquidity: delta_liquidity,

    //LANG:JP スリッページ
    //LANG:EN Acceptable slippage
    //LANG:KR 허용 슬리피지
    slippageTolerance: slippage,

    //LANG:JP TokenExtensions のトークン情報を取得
    //LANG:EN Get token info for TokenExtensions
    //LANG:KR TokenExtensions용 토큰 정보 가져옴
    tokenExtensionCtx: await TokenExtensionUtil.buildTokenExtensionContext(ctx.fetcher, whirlpool_data),
  });

  //LANG:JP 見積もり結果表示
  //LANG:EN Output the estimation
  //LANG:KR 예상 결과 출력
  console.log("devSAMO min output:", DecimalUtil.fromBN(quote.tokenMinA, token_a.decimals).toFixed(token_a.decimals));
  console.log("devUSDC min output:", DecimalUtil.fromBN(quote.tokenMinB, token_b.decimals).toFixed(token_b.decimals));

  //LANG:JP トランザクション実行前の流動性を表示
  //LANG:EN Output the liquidity before transaction execution
  //LANG:KR 트랜잭션 실행 전 유동성 출력
  console.log("liquidity(before):", position.getData().liquidity.toString());

  //LANG:JP トランザクションを作成
  //LANG:EN Create a transaction
  //LANG:KR 트랜잭션 생성
  const decrease_liquidity_tx = await position.decreaseLiquidity(quote);

  //LANG:JP トランザクションを送信
  //LANG:EN Send the transaction
  //LANG:KR 트랜잭션 전파
  const signature = await decrease_liquidity_tx.buildAndExecute();
  console.log("signature:", signature);

  //LANG:JP トランザクション完了待ち
  //LANG:EN Wait for the transaction to complete
  //LANG:KR 트랜잭션 반영까지 대기함
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({ signature, ...latest_blockhash }, "confirmed");

  //LANG:JP トランザクション実行後の流動性を表示
  //LANG:EN Output the liquidity after transaction execution
  //LANG:KR 트랜잭션 실행 후 유동성 출력
  console.log("liquidity(after):", (await position.refreshData()).liquidity.toString());
}

main();
