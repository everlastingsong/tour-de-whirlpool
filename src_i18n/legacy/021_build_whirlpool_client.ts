import { AnchorProvider } from "@coral-xyz/anchor";
import { WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID } from "@orca-so/whirlpools-sdk";

// UNIX/Linux/Mac
// bash$ export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// bash$ export ANCHOR_WALLET=wallet.json
// bash$ ts-node this_script.ts
//
// Windows
// > set ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// > set ANCHOR_WALLET=wallet.json
// > ts-node this_script.ts

async function main() {
  //LANG:JP アンカーのプロバイダを環境変数から取得
  //LANG:EN Acquire Anchor provider from environment variables
  //LANG:KR 앵커 프로바이더를 환경변수에서 가져옴
  const provider = AnchorProvider.env();

  //LANG:JP WhirlpoolContext をプロバイダで初期化
  //LANG:EN Initialize the WhirlpoolContext with the provider
  //LANG:KR WhirlpoolContext를 프로바이더로 초기화함
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);

  //LANG:JP Whirlpoolクライアントを作成
  //LANG:EN Build the Whirlpool client
  //LANG:KR Whirlpool 클라이언트를 생성함
  const client = buildWhirlpoolClient(ctx);

  //LANG:JP RPCエンドポイントとウォレットの公開鍵を表示
  //LANG:EN Display the RPC endpoint and wallet public key
  //LANG:KR RPC 엔드포인트와 지갑 공개키를 출력함
  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());
}

main();
