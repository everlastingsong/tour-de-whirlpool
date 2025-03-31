import { Keypair } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil, WhirlpoolIx
} from "@orca-so/whirlpools-sdk";
import { TransactionBuilder } from "@orca-so/common-sdk";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

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

  //LANG:JP PositionBundle 用の Mint, PDA, ATA のアドレスを生成
  //LANG:EN Generate the address of Mint, PDA, and ATA for PositionBundle
  //LANG:KR PositionBundle에 사용할 민트, PDA, ATA 주소를 생성
  const position_bundle_mint_keypair = Keypair.generate();
  const position_bundle_pda = PDAUtil.getPositionBundle(ORCA_WHIRLPOOL_PROGRAM_ID, position_bundle_mint_keypair.publicKey);
  const position_bundle_token_account = getAssociatedTokenAddressSync(position_bundle_mint_keypair.publicKey, ctx.wallet.publicKey);

  //LANG:JP PositionBundle 初期化命令を作成
  //LANG:EN Build the instruction to initialize PositionBundle
  //LANG:KR PositionBundle를 초기화하기 위한 명령을 생성
  const initialize_position_bundle_ix = WhirlpoolIx.initializePositionBundleIx(
    ctx.program,
    {
      funder: ctx.wallet.publicKey,
      owner: ctx.wallet.publicKey,
      positionBundleMintKeypair: position_bundle_mint_keypair,
      positionBundlePda: position_bundle_pda,
      positionBundleTokenAccount: position_bundle_token_account,
    }
  );

  //LANG:JP トランザクションを作成
  //LANG:EN Create a transaction
  //LANG:KR 트랜잭션을 생성
  const tx_builder = new TransactionBuilder(ctx.connection, ctx.wallet);
  tx_builder.addInstruction(initialize_position_bundle_ix);

  //LANG:JP トランザクションを送信
  //LANG:EN Send the transaction
  //LANG:KR 트랜잭션을 전송
  const signature = await tx_builder.buildAndExecute();
  console.log("signature:", signature);
  console.log("position bundle NFT:", position_bundle_mint_keypair.publicKey.toBase58());
  console.log("position bundle address:", position_bundle_pda.publicKey.toBase58());

  //LANG:JP トランザクション完了待ち
  //LANG:EN Wait for the transaction to complete
  //LANG:KR 트랜잭션 완료 대기
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({signature, ...latest_blockhash}, "confirmed");
}

main();
