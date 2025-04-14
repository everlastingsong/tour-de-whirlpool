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
  const position_owner = ctx.wallet.publicKey;
  const position_mint = position.getData().positionMint;
  const position_mint_program_id = position.getPositionMintTokenProgramId();
  const position_token_account = getAssociatedTokenAddressSync(position_mint, position_owner, false, position_mint_program_id);
  const whirlpool_pubkey = position.getData().whirlpool;
  const whirlpool = await client.getPool(whirlpool_pubkey);
  const token_a = whirlpool.getTokenAInfo();
  const token_b = whirlpool.getTokenBInfo();

  //LANG:JP TickArray および Tick の取得
  //LANG:EN Get TickArray and Tick
  //LANG:KR TickArray 및 Tick 가져옴
  const tick_spacing = whirlpool.getData().tickSpacing;
  const tick_array_lower_pubkey = PDAUtil.getTickArrayFromTickIndex(position.getData().tickLowerIndex, tick_spacing, whirlpool_pubkey, ctx.program.programId).publicKey;
  const tick_array_upper_pubkey = PDAUtil.getTickArrayFromTickIndex(position.getData().tickUpperIndex, tick_spacing, whirlpool_pubkey, ctx.program.programId).publicKey;

  //LANG:JP フィーやリワードの受け取りに必要なトークンアカウントを作成
  //LANG:JP 受け取るトークンのミントアドレスを収集
  //LANG:EN Create token accounts to receive fees and rewards
  //LANG:EN Collect mint addresses of tokens to receive
  //LANG:KR 수수료 및 리워드 수령에 필요한 토큰 계정 생성
  //LANG:KR 수령할 토큰의 민트 주소를 수집
  const tokens_to_be_collected = new Set<string>();
  tokens_to_be_collected.add(token_a.mint.toBase58());
  tokens_to_be_collected.add(token_b.mint.toBase58());
  whirlpool.getData().rewardInfos.map((reward_info) => {
    if (PoolUtil.isRewardInitialized(reward_info)) {
      tokens_to_be_collected.add(reward_info.mint.toBase58());
    }
  });

  //LANG:JP トークンアカウントのアドレス取得および存在しない場合の作成命令を取得
  //LANG:EN Get addresses of token accounts and get instructions to create if it does not exist
  //LANG:KR 토큰 계정 주소를 가져오고, 없으면 생성 명령어 이용
  const required_ta_ix: Instruction[] = [];
  const token_account_map = new Map<string, { token_account: PublicKey; token_program: PublicKey }>();
  for (let mint_b58 of tokens_to_be_collected) {
    const mint = new PublicKey(mint_b58);
    //LANG:JP 存在する場合は ix は EMPTY_INSTRUCTION
    //LANG:EN If present, ix is EMPTY_INSTRUCTION
    //LANG:KR 이미 존재하면 ix는 EMPTY_INSTRUCTION
    const { address, ...ix } = await resolveOrCreateATA(
      ctx.connection,
      position_owner,
      mint,
      () => ctx.fetcher.getAccountRentExempt()
    );
    required_ta_ix.push(ix);
    token_account_map.set(mint_b58, { token_account: address, token_program: ix.tokenProgram });
  }

  //LANG:JP フィーやリワードの情報を最新化する命令を作成
  //LANG:EN Build the instruction to update fees and rewards
  //LANG:KR 수수료와 리워드 정보를 갱신하는 명령 생성
  const update_fee_and_rewards_ix = WhirlpoolIx.updateFeesAndRewardsIx(
    ctx.program, 
    {
      whirlpool: position.getData().whirlpool,
      position: position_pubkey,
      tickArrayLower: tick_array_lower_pubkey,
      tickArrayUpper: tick_array_upper_pubkey,
    }
  );

  //LANG:JP フィー回収の命令を作成
  //LANG:EN Build the instruction to collect fees
  //LANG:KR 수수료 회수 명령 생성
  const token_account_a = token_account_map.get(token_a.mint.toBase58());
  const token_account_b = token_account_map.get(token_b.mint.toBase58());
  const collect_fees_ix = WhirlpoolIx.collectFeesV2Ix(
    ctx.program,
    {
      whirlpool: whirlpool_pubkey,
      position: position_pubkey,
      positionAuthority: position_owner,
      positionTokenAccount: position_token_account,
      tokenMintA: whirlpool.getData().tokenMintA,
      tokenMintB: whirlpool.getData().tokenMintB,
      tokenOwnerAccountA: token_account_a.token_account,
      tokenOwnerAccountB: token_account_b.token_account,
      tokenProgramA: token_account_a.token_program,
      tokenProgramB: token_account_b.token_program,
      tokenVaultA: whirlpool.getData().tokenVaultA,
      tokenVaultB: whirlpool.getData().tokenVaultB,
    }
  );

  //LANG:JP リワード回収の命令を作成
  //LANG:EN Build the instructions to collect rewards
  //LANG:KR 리워드 회수 명령 생성
  const collect_reward_ix = [EMPTY_INSTRUCTION, EMPTY_INSTRUCTION, EMPTY_INSTRUCTION];
  for (let i = 0; i < whirlpool.getData().rewardInfos.length; i++) {
    const reward_info = whirlpool.getData().rewardInfos[i];
    if (!PoolUtil.isRewardInitialized(reward_info)) continue;

    const reward_account = token_account_map.get(reward_info.mint.toBase58());
    collect_reward_ix[i] = WhirlpoolIx.collectRewardV2Ix(
      ctx.program,
      {
        whirlpool: whirlpool_pubkey,
        position: position_pubkey,
        positionAuthority: position_owner,
        positionTokenAccount: position_token_account,
        rewardIndex: i,
        rewardMint: reward_info.mint,
        rewardOwnerAccount: reward_account.token_account,
        rewardTokenProgram: reward_account.token_program,
        rewardVault: reward_info.vault,
      }
    );
  }

  //LANG:JP トランザクション組み立て
  //LANG:EN Create a transaction and add the instruction
  //LANG:KR 트랜잭션 빌드하고 명령 추가
  const tx_builder = new TransactionBuilder(ctx.connection, ctx.wallet);

  //LANG:JP トークンアカウント作成
  //LANG:EN Create token accounts
  //LANG:KR 토큰 계정 생성
  required_ta_ix.map((ix) => tx_builder.addInstruction(ix));

  //LANG:JP 更新&フィー回収&リワード回収
  //LANG:EN Update fees and rewards, collect fees, and collect rewards
  //LANG:KR 수수료와 리워드 정보 갱신, 수수료 회수, 리워드 회수
  tx_builder
    .addInstruction(update_fee_and_rewards_ix)
    .addInstruction(collect_fees_ix)
    .addInstruction(collect_reward_ix[0])
    .addInstruction(collect_reward_ix[1])
    .addInstruction(collect_reward_ix[2]);

  //LANG:JP トランザクションを送信
  //LANG:EN Send the transaction
  //LANG:KR 트랜잭션 전파
  const signature = await tx_builder.buildAndExecute();
  console.log("signature:", signature);

  //LANG:JP トランザクション完了待ち
  //LANG:EN Wait for the transaction to complete
  //LANG:KR 트랜잭션 반영까지 대기
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({ signature, ...latest_blockhash }, "confirmed");
}

main();
