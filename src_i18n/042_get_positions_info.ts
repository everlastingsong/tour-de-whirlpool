import { AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil, PriceMath, PoolUtil, IGNORE_CACHE
} from "@orca-so/whirlpools-sdk";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, unpackAccount } from "@solana/spl-token";
import { DecimalUtil } from "@orca-so/common-sdk";

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

  //LANG:JP 全てのトークンアカウントを取得
  //LANG:JP このチュートリアルや UI は Token - 2022 を使った NFT を作ります。Token を使った古い NFT も念の為探索します。
  //LANG:EN Get all token accounts
  //LANG:EN This tutorial and UI create NFTs using Token-2022. We will also explore older NFTs created with the traditional Token standard, just in case.
  //LANG:KR 모든 토큰 계정 조회
  //LANG:KR 이 튜토리얼과 UI는 Token-2022로 NFT를 생성함. 기존 Token 표준의 NFT도 혹시 모르니 함께 탐색
  const token_program_token_accounts = (await ctx.connection.getTokenAccountsByOwner(ctx.wallet.publicKey, { programId: TOKEN_PROGRAM_ID })).value;
  const token_2022_program_token_accounts = (await ctx.connection.getTokenAccountsByOwner(ctx.wallet.publicKey, { programId: TOKEN_2022_PROGRAM_ID })).value;
  const token_accounts = token_program_token_accounts.concat(token_2022_program_token_accounts);

  //LANG:JP ポジションのアドレス候補を取得
  //LANG:EN Get candidate addresses for the position
  //LANG:KR 포지션 주소 후보를 가져옴
  const whirlpool_position_candidate_pubkeys = token_accounts.map((ta) => {
    const parsed = unpackAccount(ta.pubkey, ta.account, ta.account.owner);

    //LANG:JP ミントアドレスから Whirlpool のポジションのアドレスを導出(実在するかは問わない)
    //LANG:EN Derive the address of Whirlpool's position from the mint address (whether or not it exists)
    //LANG:KR 민트 주소로부터 Whirlpool 포지션 주소를 유도 (존재 여부와 상관없음)
    const pda = PDAUtil.getPosition(ctx.program.programId, parsed.mint);

    //LANG:JP トークン数が 1 の場合のみ Whirlpool のポジションのアドレスを返す(空のトークンアカウントやNFTではないものは無視)
    //LANG:EN Returns the address of the Whirlpool position only if the number of tokens is 1 (ignores empty token accounts and non-NFTs)
    //LANG:KR 토큰 수가 1인 경우에만 Whirlpool 포지션 주소 반환 (빈 계정이나 NFT 아닌 경우 무시)
    return new BN(parsed.amount.toString()).eq(new BN(1)) ? pda.publicKey : undefined;
  }).filter((pubkey) => pubkey !== undefined);

  //LANG:JP Whirlpool のポジションのアドレスからデータを取得
  //LANG:EN Get data from Whirlpool position addresses
  //LANG:KR Whirlpool 포지션 주소로부터 데이터 가져옴
  const whirlpool_position_candidate_datas = await ctx.fetcher.getPositions(whirlpool_position_candidate_pubkeys, IGNORE_CACHE);
  //LANG:JP 正しくデータ取得できたアドレスのみポジションのアドレスとして残す
  //LANG:EN Leave only addresses with correct data acquisition as position addresses
  //LANG:KR 유효한 데이터를 가져온 주소만 포지션 주소로 남김
  const whirlpool_positions = whirlpool_position_candidate_pubkeys.filter((pubkey, i) => 
    whirlpool_position_candidate_datas[i] !== null
  );

  //LANG:JP 状態表示
  //LANG:EN Output the status of the positions
  //LANG:KR 포지션 상태 출력
  for (let i = 0; i < whirlpool_positions.length; i++) {
    const p = whirlpool_positions[i];

    //LANG:JP ポジションの情報取得
    //LANG:EN Get the status of the position
    //LANG:KR 포지션 정보 가져옴
    const position = await client.getPosition(p);
    const data = position.getData();

    //LANG:JP ポジションが属しているプールを取得
    //LANG:EN Get the pool to which the position belongs
    //LANG:KR 해당 포지션이 속한 풀 가져옴
    const pool = await client.getPool(data.whirlpool);
    const token_a = pool.getTokenAInfo();
    const token_b = pool.getTokenBInfo();
    const price = PriceMath.sqrtPriceX64ToPrice(pool.getData().sqrtPrice, token_a.decimals, token_b.decimals);

    //LANG:JP 価格帯を取得
    //LANG:EN Get the price range of the position
    //LANG:KR 포지션 가격 범위 가져옴
    const lower_price = PriceMath.tickIndexToPrice(data.tickLowerIndex, token_a.decimals, token_b.decimals);
    const upper_price = PriceMath.tickIndexToPrice(data.tickUpperIndex, token_a.decimals, token_b.decimals);

    //LANG:JP ポジション内のトークンの量を計算
    //LANG:EN Calculate the amount of tokens that can be withdrawn from the position
    //LANG:KR 포지션에서 출금 가능한 토큰 수량 계산
    const amounts = PoolUtil.getTokenAmountsFromLiquidity(
      data.liquidity,
      pool.getData().sqrtPrice,
      PriceMath.tickIndexToSqrtPriceX64(data.tickLowerIndex),
      PriceMath.tickIndexToSqrtPriceX64(data.tickUpperIndex),
      true
    );

    //LANG:JP ポジションの情報表示
    //LANG:EN Output the status of the position
    //LANG:KR 포지션 정보 출력
    console.log("position:", i, p.toBase58());
    console.log("\twhirlpool address:", data.whirlpool.toBase58());
    console.log("\twhirlpool price:", price.toFixed(token_b.decimals));
    console.log("\ttokenA:", token_a.mint.toBase58());
    console.log("\ttokenB:", token_b.mint.toBase58());
    console.log("\tliquidity:", data.liquidity.toString());
    console.log("\tlower:", data.tickLowerIndex, lower_price.toFixed(token_b.decimals));
    console.log("\tupper:", data.tickUpperIndex, upper_price.toFixed(token_b.decimals));
    console.log("\tamountA:", DecimalUtil.fromBN(amounts.tokenA, token_a.decimals).toString());
    console.log("\tamountB:", DecimalUtil.fromBN(amounts.tokenB, token_b.decimals).toString());
  }
}

main();
