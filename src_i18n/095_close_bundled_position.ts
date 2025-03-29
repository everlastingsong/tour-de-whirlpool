import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil, IGNORE_CACHE, PositionBundleUtil, decreaseLiquidityQuoteByLiquidityWithParams, PositionBundleData, WhirlpoolClient, PoolUtil, WhirlpoolIx,
  TokenExtensionUtil
} from "@orca-so/whirlpools-sdk";
import { DecimalUtil, EMPTY_INSTRUCTION, Instruction, Percentage, TransactionBuilder, resolveOrCreateATA } from "@orca-so/common-sdk";
import { BN } from "bn.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

//LANG:JP スクリプト実行前に環境変数定義が必要です
//LANG:EN Environment variables must be defined before script execution
//LANG:KR 스크립트 실행 전 환경변수 설정
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json
// WHIRLPOOL_POSITION_BUNDLE=address_of_position_bundle

async function close_bundled_position(client: WhirlpoolClient, position_bundle_pubkey: PublicKey, position_bundle: PositionBundleData, bundle_index: number) {
  const ctx = client.getContext();

  const bundled_position_pda = PDAUtil.getBundledPosition(ctx.program.programId, position_bundle.positionBundleMint, bundle_index);
  const bundled_position_pubkey = bundled_position_pda.publicKey;
  console.log(`bundled position (${bundle_index}) pubkey:`, bundled_position_pubkey.toBase58());

  //LANG:JP 許容するスリッページを設定
  //LANG:EN Set acceptable slippage
  //LANG:KR 허용 슬리피지 설정
  const slippage = Percentage.fromFraction(10, 1000); // 1%

  //LANG:JP ポジション・プール取得
  //LANG:EN Get the position and the pool to which the position belongs
  //LANG:KR 포지션과 해당 포지션이 속한 풀 가져옴
  const position = await client.getPosition(bundled_position_pubkey);
  const position_bundle_owner = ctx.wallet.publicKey;
  const position_bundle_token_account = getAssociatedTokenAddressSync(position.getData().positionMint, position_bundle_owner);
  const whirlpool_pubkey = position.getData().whirlpool;
  const whirlpool = await client.getPool(whirlpool_pubkey);
  const whirlpool_data = whirlpool.getData();

  const token_a = whirlpool.getTokenAInfo();
  const token_b = whirlpool.getTokenBInfo();

  //LANG:JP TickArray および Tick の取得
  //LANG:EN Get TickArray and Tick
  //LANG:KR TickArray와 Tick 가져옴
  const tick_spacing = whirlpool.getData().tickSpacing;
  const tick_array_lower_pubkey = PDAUtil.getTickArrayFromTickIndex(position.getData().tickLowerIndex, tick_spacing, whirlpool_pubkey, ctx.program.programId).publicKey;
  const tick_array_upper_pubkey = PDAUtil.getTickArrayFromTickIndex(position.getData().tickUpperIndex, tick_spacing, whirlpool_pubkey, ctx.program.programId).publicKey;

  //LANG:JP フィーやリワードの受け取りに必要なトークンアカウントを作成
  //LANG:JP 受け取るトークンのミントアドレスを収集
  //LANG:EN Create token accounts to receive fees and rewards
  //LANG:EN Collect mint addresses of tokens to receive
  //LANG:KR 수수료 및 리워드 수령에 필요한 토큰 계정 생성
  //LANG:KR 수령할 토큰의 민트 주소 수집
  const tokens_to_be_collected = new Set<string>();
  tokens_to_be_collected.add(token_a.mint.toBase58());
  tokens_to_be_collected.add(token_b.mint.toBase58());
  whirlpool.getData().rewardInfos.map((reward_info) => {
    if ( PoolUtil.isRewardInitialized(reward_info) ) {
      tokens_to_be_collected.add(reward_info.mint.toBase58());
    }
  });

  //LANG:JP トークンアカウントのアドレス取得および存在しない場合の作成命令を取得
  //LANG:EN Get addresses of token accounts and get instructions to create if it does not exist
  //LANG:KR 토큰 계정 주소를 얻고, 없으면 계정 생성 명령 이용
  const required_ta_ix: Instruction[] = [];
  const token_account_map = new Map<string, PublicKey>();
  for ( let mint_b58 of tokens_to_be_collected ) {
    const mint = new PublicKey(mint_b58);
    //LANG:JP 存在する場合は ix は EMPTY_INSTRUCTION
    //LANG:EN If present, ix is EMPTY_INSTRUCTION
    //LANG:KR 이미 있으면 ix는 EMPTY_INSTRUCTION
    const {address, ...ix} = await resolveOrCreateATA(
      ctx.connection,
      position_bundle_owner,
      mint,
      () => ctx.fetcher.getAccountRentExempt()
    );
    required_ta_ix.push(ix);
    token_account_map.set(mint_b58, address);
  }

  //LANG:JP フィーやリワードの情報を最新化する命令を作成
  //LANG:EN Build the instruction to update fees and rewards
  //LANG:KR 수수료와 리워드 정보를 갱신하는 명령 생성
  let update_fee_and_rewards_ix = position.getData().liquidity.isZero()
    ? EMPTY_INSTRUCTION
    : WhirlpoolIx.updateFeesAndRewardsIx(
      ctx.program, 
      {
        whirlpool: position.getData().whirlpool,
        position: bundled_position_pubkey,
        tickArrayLower: tick_array_lower_pubkey,
        tickArrayUpper: tick_array_upper_pubkey,
      }
    );

  //LANG:JP フィー回収の命令を作成
  //LANG:EN Build the instruction to collect fees
  //LANG:KR 수수료 회수 명령 생성
  let collect_fees_ix = WhirlpoolIx.collectFeesIx(
    ctx.program,
    {
      whirlpool: whirlpool_pubkey,
      position: bundled_position_pubkey,
      positionAuthority: position_bundle_owner,
      positionTokenAccount: position_bundle_token_account,
      tokenOwnerAccountA: token_account_map.get(token_a.mint.toBase58()),
      tokenOwnerAccountB: token_account_map.get(token_b.mint.toBase58()),
      tokenVaultA: whirlpool.getData().tokenVaultA,
      tokenVaultB: whirlpool.getData().tokenVaultB,
    }
  );

  //LANG:JP リワード回収の命令を作成
  //LANG:EN Build the instructions to collect rewards
  //LANG:KR 리워드 회수 명령 생성
  const collect_reward_ix = [EMPTY_INSTRUCTION, EMPTY_INSTRUCTION, EMPTY_INSTRUCTION];
  for (let i=0; i<whirlpool.getData().rewardInfos.length; i++) {
    const reward_info = whirlpool.getData().rewardInfos[i];
    if ( !PoolUtil.isRewardInitialized(reward_info) ) continue;

    collect_reward_ix[i] = WhirlpoolIx.collectRewardIx(
      ctx.program,
      {
        whirlpool: whirlpool_pubkey,
        position: bundled_position_pubkey,
        positionAuthority: position_bundle_owner,
        positionTokenAccount: position_bundle_token_account,
        rewardIndex: i,
        rewardOwnerAccount: token_account_map.get(reward_info.mint.toBase58()),
        rewardVault: reward_info.vault,
      }
    );
  }

  //LANG:JP 引き出せるトークン量を取得
  //LANG:EN Estimate the amount of tokens that can be withdrawn from the position
  //LANG:KR 포지션에서 출금 가능한 예상 토큰 양 계산
  const quote = decreaseLiquidityQuoteByLiquidityWithParams({
    sqrtPrice: whirlpool_data.sqrtPrice,
    tickCurrentIndex: whirlpool_data.tickCurrentIndex,
    tickLowerIndex: position.getData().tickLowerIndex,
    tickUpperIndex: position.getData().tickUpperIndex,
    liquidity: position.getData().liquidity,
    slippageTolerance: slippage,
    tokenExtensionCtx: await TokenExtensionUtil.buildTokenExtensionContext(ctx.fetcher, whirlpool_data),
  });

  //LANG:JP 見積もり結果表示
  //LANG:EN Output the estimation
  //LANG:KR 예상 결과 출력
  console.log("devSAMO min output:", DecimalUtil.fromBN(quote.tokenMinA, token_a.decimals).toFixed(token_a.decimals));
  console.log("devUSDC min output:", DecimalUtil.fromBN(quote.tokenMinB, token_b.decimals).toFixed(token_b.decimals));
  //LANG:JP 流動性を引き出す命令を作成
  //LANG:EN Build the instruction to decrease liquidity
  //LANG:KR 유동성 출금을 위한 명령 생성
  const decrease_liquidity_ix = position.getData().liquidity.isZero()
    ? EMPTY_INSTRUCTION
    : WhirlpoolIx.decreaseLiquidityIx(
      ctx.program,
      {
        ...quote,
        whirlpool: whirlpool_pubkey,
        position: bundled_position_pubkey,
        positionAuthority: position_bundle_owner,
        positionTokenAccount: position_bundle_token_account,
        tokenOwnerAccountA: token_account_map.get(token_a.mint.toBase58()),
        tokenOwnerAccountB: token_account_map.get(token_b.mint.toBase58()),
        tokenVaultA: whirlpool.getData().tokenVaultA,
        tokenVaultB: whirlpool.getData().tokenVaultB,
        tickArrayLower: tick_array_lower_pubkey,
        tickArrayUpper: tick_array_upper_pubkey,
      }
    );

  //LANG:JP PositionBundle で管理するポジションをクローズする命令を作成
  //LANG:EN Build the instruction to close the position managed by PositionBundle
  //LANG:KR PositionBundle에서 관리 중인 포지션을 클로즈하는 명령 생성
  const close_bundled_position_ix = WhirlpoolIx.closeBundledPositionIx(
    ctx.program,
    {
      bundledPosition: bundled_position_pubkey,
      positionBundleAuthority: position_bundle_owner,
      positionBundleTokenAccount: position_bundle_token_account,
      positionBundle: position_bundle_pubkey,
      bundleIndex: bundle_index,
      receiver: position_bundle_owner,
    }
  );

  //LANG:JP トランザクション組み立て
  //LANG:EN Create a transaction and add the instruction
  //LANG:KR 트랜잭션을 구성하고 명령 추가
  const tx_builder = new TransactionBuilder(ctx.connection, ctx.wallet);
  //LANG:JP トークンアカウント作成
  //LANG:EN Create token accounts
  //LANG:KR 토큰 계정 생성
  required_ta_ix.map((ix) => tx_builder.addInstruction(ix));
  tx_builder
    //LANG:JP 更新&フィー回収&リワード回収
    //LANG:EN Update fees and rewards, collect fees, and collect rewards
    //LANG:KR 수수료와 리워드 정보 갱신 후 회수
    .addInstruction(update_fee_and_rewards_ix)
    .addInstruction(collect_fees_ix)
    .addInstruction(collect_reward_ix[0])
    .addInstruction(collect_reward_ix[1])
    .addInstruction(collect_reward_ix[2])
    //LANG:JP 流動性引き出し
    //LANG:EN Decrease liquidity
    //LANG:KR 유동성 출금
    .addInstruction(decrease_liquidity_ix)
    //LANG:JP クローズ・ポジション
    //LANG:EN Close the position
    //LANG:KR 포지션 클로즈
    .addInstruction(close_bundled_position_ix);

  //LANG:JP トランザクションを送信
  //LANG:EN Send the transaction
  //LANG:KR 트랜잭션 전송
  const signature = await tx_builder.buildAndExecute();
  console.log("signature:", signature);

  //LANG:JP トランザクション完了待ち
  //LANG:EN Wait for the transaction to complete
  //LANG:KR 트랜잭션 완료 대기
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({signature, ...latest_blockhash}, "confirmed");
}

async function main() {
  //LANG:JP WhirlpoolClient 作成
  //LANG:EN Create WhirlpoolClient
  //LANG:KR WhirlpoolClient 생성
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  //LANG:JP 環境変数 WHIRLPOOL_POSITION_BUNDLE から PositionBundle のアドレスを読み込み
  //LANG:EN Retrieve the position bundle address from the WHIRLPOOL_POSITION_BUNDLE environment variable
  //LANG:KR 환경변수 WHIRLPOOL_POSITION_BUNDLE에서 PositionBundle 주소 가져옴
  const position_bundle_address = process.env.WHIRLPOOL_POSITION_BUNDLE;
  const position_bundle_pubkey = new PublicKey(position_bundle_address);
  console.log("position bundle address:", position_bundle_pubkey.toBase58());

  //LANG:JP PositionBundle アカウントを取得
  //LANG:EN Get PositionBundle account
  //LANG:KR PositionBundle 계정 조회
  const position_bundle_pre = await ctx.fetcher.getPositionBundle(position_bundle_pubkey, IGNORE_CACHE);

  //LANG:JP PositionBundle における使用中の bundle index を取得
  //LANG:EN Get the bundle index in use in PositionBundle
  //LANG:KR PositionBundle에서 사용 중인 bundle index 조회
  const occupied_bundle_indexes_pre = PositionBundleUtil.getOccupiedBundleIndexes(position_bundle_pre);
  console.log("occupied bundle indexes(pre):", occupied_bundle_indexes_pre);

  for (const index of occupied_bundle_indexes_pre) {
    await close_bundled_position(client, position_bundle_pubkey, position_bundle_pre, index);
  }

  //LANG:JP PositionBundle アカウントを再取得
  //LANG:EN Get PositionBundle account again
  //LANG:KR PositionBundle 계정을 다시 조회
  const position_bundle_post = await ctx.fetcher.getPositionBundle(position_bundle_pubkey, IGNORE_CACHE);

  //LANG:JP PositionBundle における使用中の bundle index を取得
  //LANG:EN Get the bundle index in use in PositionBundle
  //LANG:KR PositionBundle에서 사용 중인 bundle index 조회
  const occupied_bundle_indexes_post = PositionBundleUtil.getOccupiedBundleIndexes(position_bundle_post);
  console.log("occupied bundle indexes(post):", occupied_bundle_indexes_post);
}

main();
