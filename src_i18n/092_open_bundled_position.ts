import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil, PriceMath, IGNORE_CACHE, PositionBundleUtil, WhirlpoolIx
} from "@orca-so/whirlpools-sdk";
import { TransactionBuilder } from "@orca-so/common-sdk";
import Decimal from "decimal.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

//LANG:JP スクリプト実行前に環境変数定義が必要です
//LANG:EN Environment variables must be defined before script execution
//LANG:KR 스크립트 실행 전 환경변수 설정
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json
// WHIRLPOOL_POSITION_BUNDLE=address_of_position_bundle

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
  const devUSDC = {mint: new PublicKey("BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k"), decimals: 6};
  const devSAMO = {mint: new PublicKey("Jd4M8bfJG3sAkd82RsGWyEXoaBXQP7njFzBwEaCTuDa"), decimals: 9};

  //LANG:JP Whirlpool の Config アカウント
  //LANG:EN WhirlpoolsConfig account
  //LANG:KR WhirlpoolsConfig 계정
  // devToken ecosystem / Orca Whirlpools
  const DEVNET_WHIRLPOOLS_CONFIG = new PublicKey("FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR");

  //LANG:JP 環境変数 WHIRLPOOL_POSITION_BUNDLE から PositionBundle のアドレスを読み込み
  //LANG:EN Retrieve the position bundle address from the WHIRLPOOL_POSITION_BUNDLE environment variable
  //LANG:KR 환경변수 WHIRLPOOL_POSITION_BUNDLE에서 PositionBundle 주소를 가져옴
  const position_bundle_address = process.env.WHIRLPOOL_POSITION_BUNDLE;
  const position_bundle_pubkey = new PublicKey(position_bundle_address);
  console.log("position bundle address:", position_bundle_pubkey.toBase58());

  //LANG:JP devSAMO/devUSDC プール取得
  //LANG:EN Get devSAMO/devUSDC whirlpool
  //LANG:KR devSAMO/devUSDC 풀 가져옴
  const tick_spacing = 64;
  const whirlpool_pubkey = PDAUtil.getWhirlpool(
      ORCA_WHIRLPOOL_PROGRAM_ID,
      DEVNET_WHIRLPOOLS_CONFIG,
      devSAMO.mint, devUSDC.mint, tick_spacing).publicKey;
  console.log("whirlpool_key:", whirlpool_pubkey.toBase58());
  const whirlpool = await client.getPool(whirlpool_pubkey);

  //LANG:JP プールにおける現在価格を取得
  //LANG:EN Get the current price of the pool
  //LANG:KR 풀의 현재 가격 가져옴
  const sqrt_price_x64 = whirlpool.getData().sqrtPrice;
  const price = PriceMath.sqrtPriceX64ToPrice(sqrt_price_x64, devSAMO.decimals, devUSDC.decimals);
  console.log("price:", price.toFixed(devUSDC.decimals));

  //LANG:JP 価格帯を設定
  //LANG:EN Set price range
  //LANG:KR 가격 범위를 설정
  const lower_price = new Decimal("0.005");
  const upper_price = new Decimal("0.02");

  //LANG:JP 価格帯を調整 (全ての価格が設定可能ではなく、範囲指定に利用できる価格は決まっている(InitializableTickIndexに対応する価格))
  //LANG:EN Adjust price range (not all prices can be set, only a limited number of prices are available for range specification)
  //LANG:EN (prices corresponding to InitializableTickIndex are available)
  //LANG:KR 가격 범위 조정 (모든 가격을 설정할 수 없으며, InitializableTickIndex에 해당하는 가격만 가능)
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

  //LANG:JP PositionBundle アカウントを取得
  //LANG:EN Get PositionBundle account
  //LANG:KR PositionBundle 계정 가져옴
  const position_bundle = await ctx.fetcher.getPositionBundle(position_bundle_pubkey, IGNORE_CACHE);

  //LANG:JP PositionBundle 向けの ATA を取得
  //LANG:EN Get ATA for PositionBundle
  //LANG:KR PositionBundle용 ATA를 가져옴
  const position_bundle_token_account = getAssociatedTokenAddressSync(position_bundle.positionBundleMint, ctx.wallet.publicKey);

  //LANG:JP PositionBundle における未使用の bundle index を取得
  //LANG:EN Get unused bundle indexes in PositionBundle
  //LANG:KR PositionBundle 내에서 사용되지 않은 bundle index를 가져옴
  const unoccupied_bundle_indexes = PositionBundleUtil.getUnoccupiedBundleIndexes(position_bundle);
  console.log("unoccupied bundle indexes (first 10):", unoccupied_bundle_indexes.slice(0, 10));

  //LANG:JP PositionBundle で管理するポジションのアドレスを 2 個生成
  //LANG:EN Generate 2 addresses for positions managed by PositionBundle
  //LANG:KR PositionBundle에서 관리할 2개의 포지션 주소를 생성
  const bundled_position_one_pda = PDAUtil.getBundledPosition(ctx.program.programId, position_bundle.positionBundleMint, unoccupied_bundle_indexes[0]);
  const bundled_position_two_pda = PDAUtil.getBundledPosition(ctx.program.programId, position_bundle.positionBundleMint, unoccupied_bundle_indexes[1]);
  console.log(`bundled position one (${unoccupied_bundle_indexes[0]}) pubkey:`, bundled_position_one_pda.publicKey.toBase58());
  console.log(`bundled position two (${unoccupied_bundle_indexes[1]}) pubkey:`, bundled_position_two_pda.publicKey.toBase58());

  //LANG:JP PositionBundle で管理する 1 個目のポジションをオープンする命令を作成
  //LANG:EN Create an instruction to open the first position managed by PositionBundle
  //LANG:KR PositionBundle에서 관리할 첫 번째 포지션을 오픈하기 위한 명령 생성
  const open_bundled_position_one_ix = WhirlpoolIx.openBundledPositionIx(
    ctx.program,
    {
      funder: ctx.wallet.publicKey,
      positionBundle: position_bundle_pubkey,
      positionBundleAuthority: ctx.wallet.publicKey,
      positionBundleTokenAccount: position_bundle_token_account,
      bundleIndex: unoccupied_bundle_indexes[0],
      bundledPositionPda: bundled_position_one_pda,
      whirlpool: whirlpool_pubkey,
      tickLowerIndex: lower_tick_index,
      tickUpperIndex: upper_tick_index,
    },
  );

  //LANG:JP PositionBundle で管理する 2 個目のポジションをオープンする命令を作成
  //LANG:EN Create an instruction to open the second position managed by PositionBundle
  //LANG:KR PositionBundle에서 관리할 두 번째 포지션을 오픈하기 위한 명령 생성
  const open_bundled_position_two_ix = WhirlpoolIx.openBundledPositionIx(
    ctx.program,
    {
      funder: ctx.wallet.publicKey,
      positionBundle: position_bundle_pubkey,
      positionBundleAuthority: ctx.wallet.publicKey,
      positionBundleTokenAccount: position_bundle_token_account,
      bundleIndex: unoccupied_bundle_indexes[1],
      bundledPositionPda: bundled_position_two_pda,
      whirlpool: whirlpool_pubkey,
      tickLowerIndex: lower_tick_index,
      tickUpperIndex: upper_tick_index,
    },
  );

  //LANG:JP トランザクション組み立て
  //LANG:EN Create a transaction and add the instruction
  //LANG:KR 트랜잭션을 생성하고 명령을 추가
  const tx_builder = new TransactionBuilder(ctx.connection, ctx.wallet);
  tx_builder
    .addInstruction(open_bundled_position_one_ix)
    .addInstruction(open_bundled_position_two_ix);

  //LANG:JP トランザクションを送信
  //LANG:EN Send the transaction
  //LANG:KR 트랜잭션 전파
  const signature = await tx_builder.buildAndExecute();
  console.log("signature:", signature);

  //LANG:JP トランザクション完了待ち
  //LANG:EN Wait for the transaction to complete
  //LANG:KR 트랜잭션 반영까지 대기
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({signature, ...latest_blockhash}, "confirmed");
}

main();
