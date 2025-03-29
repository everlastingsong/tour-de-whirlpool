import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID } from "@orca-so/whirlpools-sdk";
import { Percentage } from "@orca-so/common-sdk";

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

  // 허용 슬리피지 설정
  const slippage = Percentage.fromFraction(10, 1000); // 1%

  // 포지션과 해당 포지션이 속한 풀 가져옴
  const position = await client.getPosition(position_pubkey);
  const whirlpool_pubkey = position.getData().whirlpool;
  const whirlpool = await client.getPool(whirlpool_pubkey);
  const close_position_tx = await whirlpool.closePosition(position_pubkey, slippage);

  // 트랜잭션 전송
  // Close는 수수료와 리워드 회수 등 필요한 처리들이 많아, 2개 이상의 트랜잭션으로 나뉠 수 있음
  // 하지만 대부분의 경우 1개의 트랜잭션만 발생
  for (const tx of close_position_tx) {
    const signature = await tx.buildAndExecute();
    console.log("signature:", signature);

    // 트랜잭션 반영까지 대기
    const latest_blockhash = await ctx.connection.getLatestBlockhash();
    await ctx.connection.confirmTransaction({ signature, ...latest_blockhash }, "confirmed");
  }
}

main();
