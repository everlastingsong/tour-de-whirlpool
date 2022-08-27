import { AnchorProvider, BN } from "@project-serum/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil, PriceMath, PoolUtil
} from "@orca-so/whirlpools-sdk";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { DecimalUtil, TokenUtil } from "@orca-so/common-sdk";

// スクリプト実行前に環境変数定義が必要です
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json

async function main() {
  // WhirlpoolClient 作成
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  // 全てのトークンアカウントを取得
  const token_accounts = (await ctx.connection.getTokenAccountsByOwner(ctx.wallet.publicKey, {programId: TOKEN_PROGRAM_ID})).value;

  // ポジションのアドレス候補を取得
  const whirlpool_position_candidate_pubkeys = token_accounts.map((ta) => {
    const parsed = TokenUtil.deserializeTokenAccount(ta.account.data);

    // ミントアドレスから Whirlpool のポジションのアドレスを導出(実在するかは問わない)
    const pda = PDAUtil.getPosition(ctx.program.programId, parsed.mint);

    // 候補の情報を出力
    console.log(
      "TokenAccount:", ta.pubkey.toBase58(),
      "\n  mint:", parsed.mint.toBase58(),
      "\n  amount:", parsed.amount.toString(),
      "\n  pda:", pda.publicKey.toBase58()
    );

    // トークン数が 1 の場合のみ Whirlpool のポジションのアドレスを返す(空のトークンアカウントやNFTではないものは無視)
    return (parsed.amount as BN).eq(new BN(1)) ? pda.publicKey : undefined;
  }).filter(pubkey => pubkey !== undefined);

  // Whirlpool のポジションのアドレスからデータを取得
  const whirlpool_position_candidate_datas = await ctx.fetcher.listPositions(whirlpool_position_candidate_pubkeys, true);
  // 正しくデータ取得できたアドレスのみポジションのアドレスとして残す
  const whirlpool_positions = whirlpool_position_candidate_pubkeys.filter((pubkey, i) => 
    whirlpool_position_candidate_datas[i] !== null
  );

  // ポジションのアドレスを出力
  whirlpool_positions.map((position_pubkey) => console.log("position:", position_pubkey.toBase58()));
}

main();