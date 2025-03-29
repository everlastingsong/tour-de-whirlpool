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
  // アンカーのプロバイダを環境変数から取得
  const provider = AnchorProvider.env();

  // WhirlpoolContext をプロバイダで初期化
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);

  // Whirlpoolクライアントを作成
  const client = buildWhirlpoolClient(ctx);

  // RPCエンドポイントとウォレットの公開鍵を表示
  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());
}

main();
