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

// 스크립트 실행 전 환경변수 설정
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json
// WHIRLPOOL_POSITION_BUNDLE=address_of_position_bundle

async function close_bundled_position(client: WhirlpoolClient, position_bundle_pubkey: PublicKey, position_bundle: PositionBundleData, bundle_index: number) {
  const ctx = client.getContext();

  const bundled_position_pda = PDAUtil.getBundledPosition(ctx.program.programId, position_bundle.positionBundleMint, bundle_index);
  const bundled_position_pubkey = bundled_position_pda.publicKey;
  console.log(`bundled position (${bundle_index}) pubkey:`, bundled_position_pubkey.toBase58());

  // 허용 슬리피지 설정
  const slippage = Percentage.fromFraction(10, 1000); // 1%

  // 포지션과 해당 포지션이 속한 풀 가져옴
  const position = await client.getPosition(bundled_position_pubkey);
  const position_bundle_owner = ctx.wallet.publicKey;
  const position_bundle_token_account = getAssociatedTokenAddressSync(position.getData().positionMint, position_bundle_owner);
  const whirlpool_pubkey = position.getData().whirlpool;
  const whirlpool = await client.getPool(whirlpool_pubkey);
  const whirlpool_data = whirlpool.getData();

  const token_a = whirlpool.getTokenAInfo();
  const token_b = whirlpool.getTokenBInfo();

  // TickArray와 Tick 가져옴
  const tick_spacing = whirlpool.getData().tickSpacing;
  const tick_array_lower_pubkey = PDAUtil.getTickArrayFromTickIndex(position.getData().tickLowerIndex, tick_spacing, whirlpool_pubkey, ctx.program.programId).publicKey;
  const tick_array_upper_pubkey = PDAUtil.getTickArrayFromTickIndex(position.getData().tickUpperIndex, tick_spacing, whirlpool_pubkey, ctx.program.programId).publicKey;

  // 수수료 및 리워드 수령에 필요한 토큰 계정 생성
  // 수령할 토큰의 민트 주소 수집
  const tokens_to_be_collected = new Set<string>();
  tokens_to_be_collected.add(token_a.mint.toBase58());
  tokens_to_be_collected.add(token_b.mint.toBase58());
  whirlpool.getData().rewardInfos.map((reward_info) => {
    if ( PoolUtil.isRewardInitialized(reward_info) ) {
      tokens_to_be_collected.add(reward_info.mint.toBase58());
    }
  });

  // 토큰 계정 주소를 얻고, 없으면 계정 생성 명령 이용
  const required_ta_ix: Instruction[] = [];
  const token_account_map = new Map<string, PublicKey>();
  for ( let mint_b58 of tokens_to_be_collected ) {
    const mint = new PublicKey(mint_b58);
    // 이미 있으면 ix는 EMPTY_INSTRUCTION
    const {address, ...ix} = await resolveOrCreateATA(
      ctx.connection,
      position_bundle_owner,
      mint,
      () => ctx.fetcher.getAccountRentExempt()
    );
    required_ta_ix.push(ix);
    token_account_map.set(mint_b58, address);
  }

  // 수수료와 리워드 정보를 갱신하는 명령 생성
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

  // 수수료 회수 명령 생성
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

  // 리워드 회수 명령 생성
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

  // 포지션에서 출금 가능한 예상 토큰 양 계산
  const quote = decreaseLiquidityQuoteByLiquidityWithParams({
    sqrtPrice: whirlpool_data.sqrtPrice,
    tickCurrentIndex: whirlpool_data.tickCurrentIndex,
    tickLowerIndex: position.getData().tickLowerIndex,
    tickUpperIndex: position.getData().tickUpperIndex,
    liquidity: position.getData().liquidity,
    slippageTolerance: slippage,
    tokenExtensionCtx: await TokenExtensionUtil.buildTokenExtensionContext(ctx.fetcher, whirlpool_data),
  });

  // 예상 결과 출력
  console.log("devSAMO min output:", DecimalUtil.fromBN(quote.tokenMinA, token_a.decimals).toFixed(token_a.decimals));
  console.log("devUSDC min output:", DecimalUtil.fromBN(quote.tokenMinB, token_b.decimals).toFixed(token_b.decimals));
  // 유동성 출금을 위한 명령 생성
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

  // PositionBundle에서 관리 중인 포지션을 클로즈하는 명령 생성
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

  // 트랜잭션을 구성하고 명령 추가
  const tx_builder = new TransactionBuilder(ctx.connection, ctx.wallet);
  // 토큰 계정 생성
  required_ta_ix.map((ix) => tx_builder.addInstruction(ix));
  tx_builder
    // 수수료와 리워드 정보 갱신 후 회수
    .addInstruction(update_fee_and_rewards_ix)
    .addInstruction(collect_fees_ix)
    .addInstruction(collect_reward_ix[0])
    .addInstruction(collect_reward_ix[1])
    .addInstruction(collect_reward_ix[2])
    // 유동성 출금
    .addInstruction(decrease_liquidity_ix)
    // 포지션 클로즈
    .addInstruction(close_bundled_position_ix);

  // 트랜잭션 전송
  const signature = await tx_builder.buildAndExecute();
  console.log("signature:", signature);

  // 트랜잭션 완료 대기
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({signature, ...latest_blockhash}, "confirmed");
}

async function main() {
  // WhirlpoolClient 생성
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  // 환경변수 WHIRLPOOL_POSITION_BUNDLE에서 PositionBundle 주소 가져옴
  const position_bundle_address = process.env.WHIRLPOOL_POSITION_BUNDLE;
  const position_bundle_pubkey = new PublicKey(position_bundle_address);
  console.log("position bundle address:", position_bundle_pubkey.toBase58());

  // PositionBundle 계정 조회
  const position_bundle_pre = await ctx.fetcher.getPositionBundle(position_bundle_pubkey, IGNORE_CACHE);

  // PositionBundle에서 사용 중인 bundle index 조회
  const occupied_bundle_indexes_pre = PositionBundleUtil.getOccupiedBundleIndexes(position_bundle_pre);
  console.log("occupied bundle indexes(pre):", occupied_bundle_indexes_pre);

  for (const index of occupied_bundle_indexes_pre) {
    await close_bundled_position(client, position_bundle_pubkey, position_bundle_pre, index);
  }

  // PositionBundle 계정을 다시 조회
  const position_bundle_post = await ctx.fetcher.getPositionBundle(position_bundle_pubkey, IGNORE_CACHE);

  // PositionBundle에서 사용 중인 bundle index 조회
  const occupied_bundle_indexes_post = PositionBundleUtil.getOccupiedBundleIndexes(position_bundle_post);
  console.log("occupied bundle indexes(post):", occupied_bundle_indexes_post);
}

main();
