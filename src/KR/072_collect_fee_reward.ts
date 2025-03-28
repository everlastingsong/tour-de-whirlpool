import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil, PoolUtil, WhirlpoolIx
} from "@orca-so/whirlpools-sdk";
import {
  Instruction, EMPTY_INSTRUCTION, resolveOrCreateATA,
  TransactionBuilder
} from "@orca-so/common-sdk";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

// 스크립트 실행 전 환경변수 설정
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json
// WHIRLPOOL_POSITION=address_of_position

async function main() {
  // WhirlpoolClient 생성
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  // 환경변수 WHIRLPOOL_POSITION에서 포지션 주소 가져옴
  const position_address = process.env.WHIRLPOOL_POSITION;
  const position_pubkey = new PublicKey(position_address);
  console.log("position address:", position_pubkey.toBase58());

  // 포지션과 해당 포지션이 속한 풀 가져옴
  const position = await client.getPosition(position_pubkey);
  const position_owner = ctx.wallet.publicKey;
  const position_mint = position.getData().positionMint;
  const position_mint_program_id = position.getPositionMintTokenProgramId();
  const position_token_account = getAssociatedTokenAddressSync(position_mint, position_owner, false, position_mint_program_id);
  const whirlpool_pubkey = position.getData().whirlpool;
  const whirlpool = await client.getPool(whirlpool_pubkey);
  const token_a = whirlpool.getTokenAInfo();
  const token_b = whirlpool.getTokenBInfo();

  // TickArray 및 Tick 가져옴
  const tick_spacing = whirlpool.getData().tickSpacing;
  const tick_array_lower_pubkey = PDAUtil.getTickArrayFromTickIndex(position.getData().tickLowerIndex, tick_spacing, whirlpool_pubkey, ctx.program.programId).publicKey;
  const tick_array_upper_pubkey = PDAUtil.getTickArrayFromTickIndex(position.getData().tickUpperIndex, tick_spacing, whirlpool_pubkey, ctx.program.programId).publicKey;

  // 수수료 및 리워드 수령에 필요한 토큰 계정 생성
  // 수령할 토큰의 민트 주소를 수집
  const tokens_to_be_collected = new Set<string>();
  tokens_to_be_collected.add(token_a.mint.toBase58());
  tokens_to_be_collected.add(token_b.mint.toBase58());
  whirlpool.getData().rewardInfos.map((reward_info) => {
    if (PoolUtil.isRewardInitialized(reward_info)) {
      tokens_to_be_collected.add(reward_info.mint.toBase58());
    }
  });

  // 토큰 계정 주소를 가져오고, 없으면 생성 명령어 이용
  const required_ta_ix: Instruction[] = [];
  const token_account_map = new Map<string, PublicKey>();
  for (let mint_b58 of tokens_to_be_collected) {
    const mint = new PublicKey(mint_b58);
    // 이미 존재하면 ix는 EMPTY_INSTRUCTION
    const { address, ...ix } = await resolveOrCreateATA(
      ctx.connection,
      position_owner,
      mint,
      () => ctx.fetcher.getAccountRentExempt()
    );
    required_ta_ix.push(ix);
    token_account_map.set(mint_b58, address);
  }

  // 수수료와 리워드 정보를 갱신하는 명령 생성
  let update_fee_and_rewards_ix = WhirlpoolIx.updateFeesAndRewardsIx(
    ctx.program, 
    {
      whirlpool: position.getData().whirlpool,
      position: position_pubkey,
      tickArrayLower: tick_array_lower_pubkey,
      tickArrayUpper: tick_array_upper_pubkey,
    }
  );

  // 수수료 회수 명령 생성
  let collect_fees_ix = WhirlpoolIx.collectFeesIx(
    ctx.program,
    {
      whirlpool: whirlpool_pubkey,
      position: position_pubkey,
      positionAuthority: position_owner,
      positionTokenAccount: position_token_account,
      tokenOwnerAccountA: token_account_map.get(token_a.mint.toBase58()),
      tokenOwnerAccountB: token_account_map.get(token_b.mint.toBase58()),
      tokenVaultA: whirlpool.getData().tokenVaultA,
      tokenVaultB: whirlpool.getData().tokenVaultB,
    }
  );

  // 리워드 회수 명령 생성
  const collect_reward_ix = [EMPTY_INSTRUCTION, EMPTY_INSTRUCTION, EMPTY_INSTRUCTION];
  for (let i = 0; i < whirlpool.getData().rewardInfos.length; i++) {
    const reward_info = whirlpool.getData().rewardInfos[i];
    if (!PoolUtil.isRewardInitialized(reward_info)) continue;

    collect_reward_ix[i] = WhirlpoolIx.collectRewardIx(
      ctx.program,
      {
        whirlpool: whirlpool_pubkey,
        position: position_pubkey,
        positionAuthority: position_owner,
        positionTokenAccount: position_token_account,
        rewardIndex: i,
        rewardOwnerAccount: token_account_map.get(reward_info.mint.toBase58()),
        rewardVault: reward_info.vault,
      }
    );
  }

  // 트랜잭션 빌드하고 명령 추가
  const tx_builder = new TransactionBuilder(ctx.connection, ctx.wallet);

  // 토큰 계정 생성
  required_ta_ix.map((ix) => tx_builder.addInstruction(ix));

  // 수수료와 리워드 정보 갱신, 수수료 회수, 리워드 회수
  tx_builder
    .addInstruction(update_fee_and_rewards_ix)
    .addInstruction(collect_fees_ix)
    .addInstruction(collect_reward_ix[0])
    .addInstruction(collect_reward_ix[1])
    .addInstruction(collect_reward_ix[2]);

  // 트랜잭션 전파
  const signature = await tx_builder.buildAndExecute();
  console.log("signature:", signature);

  // 트랜잭션 반영까지 대기
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({ signature, ...latest_blockhash }, "confirmed");
}

main();
