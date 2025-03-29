import { AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil, IGNORE_CACHE
} from "@orca-so/whirlpools-sdk";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, unpackAccount } from "@solana/spl-token";

// 스크립트 실행 전 환경변수 설정
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json

async function main() {
  // WhirlpoolClient 생성
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  // 모든 토큰 계정 조회
  // 이 튜토리얼과 UI에서는 Token-2022를 사용해 NFT를 생성함. 기존 Token 표준으로 만든 NFT도 혹시 모르니 함께 탐색함
  const token_program_token_accounts = (await ctx.connection.getTokenAccountsByOwner(ctx.wallet.publicKey, { programId: TOKEN_PROGRAM_ID })).value;
  const token_2022_program_token_accounts = (await ctx.connection.getTokenAccountsByOwner(ctx.wallet.publicKey, { programId: TOKEN_2022_PROGRAM_ID })).value;
  const token_accounts = token_program_token_accounts.concat(token_2022_program_token_accounts);

  // 포지션 주소 후보를 가져옴
  const whirlpool_position_candidate_pubkeys = token_accounts.map((ta) => {
    const parsed = unpackAccount(ta.pubkey, ta.account, ta.account.owner);

    // 민트 주소로부터 Whirlpool 포지션 주소를 유도함 (실존 여부는 알 수 없음)
    const pda = PDAUtil.getPosition(ctx.program.programId, parsed.mint);

    // 후보 정보 출력
    console.log(
      "TokenAccount:", ta.pubkey.toBase58(),
      "\n  mint:", parsed.mint.toBase58(),
      "\n  amount:", parsed.amount.toString(),
      "\n  pda:", pda.publicKey.toBase58()
    );

    // 토큰 수가 1인 경우에만 Whirlpool 포지션 주소 반환함 (빈 토큰 계정이나 NFT가 아닌 경우 무시)
    return new BN(parsed.amount.toString()).eq(new BN(1)) ? pda.publicKey : undefined;
  }).filter(pubkey => pubkey !== undefined);

  // Whirlpool 포지션 주소로부터 데이터 가져옴
  const whirlpool_position_candidate_datas = await ctx.fetcher.getPositions(whirlpool_position_candidate_pubkeys, IGNORE_CACHE);

  // 올바른 데이터가 조회된 주소만 포지션 주소로 남김
  const whirlpool_positions = whirlpool_position_candidate_pubkeys.filter((pubkey, i) =>
    whirlpool_position_candidate_datas[i] !== null
  );

  // 포지션 주소 출력
  whirlpool_positions.map((position_pubkey) => console.log("position:", position_pubkey.toBase58()));
}

main();
