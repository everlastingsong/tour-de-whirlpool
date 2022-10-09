import { AnchorProvider, BN } from "@project-serum/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil, PriceMath, PoolUtil
} from "@orca-so/whirlpools-sdk";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { DecimalUtil, TokenUtil } from "@orca-so/common-sdk";

//LANG:JP スクリプト実行前に環境変数定義が必要です
//LANG:EN Environment variables must be defined before script execution
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json

async function main() {
  //LANG:JP WhirlpoolClient 作成
  //LANG:EN Create WhirlpoolClient
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  //LANG:JP 全てのトークンアカウントを取得
  //LANG:EN Get all token accounts
  const token_accounts = (await ctx.connection.getTokenAccountsByOwner(ctx.wallet.publicKey, {programId: TOKEN_PROGRAM_ID})).value;

  //LANG:JP ポジションのアドレス候補を取得
  //LANG:EN Get candidate addresses for the position
  const whirlpool_position_candidate_pubkeys = token_accounts.map((ta) => {
    const parsed = TokenUtil.deserializeTokenAccount(ta.account.data);

    //LANG:JP ミントアドレスから Whirlpool のポジションのアドレスを導出(実在するかは問わない)
    //LANG:EN Derive the address of Whirlpool's position from the mint address (whether or not it exists)
    const pda = PDAUtil.getPosition(ctx.program.programId, parsed.mint);

    //LANG:JP トークン数が 1 の場合のみ Whirlpool のポジションのアドレスを返す(空のトークンアカウントやNFTではないものは無視)
    //LANG:EN Returns the address of the Whirlpool position only if the number of tokens is 1 (ignores empty token accounts and non-NFTs)
    return new BN(parsed.amount.toString()).eq(new BN(1)) ? pda.publicKey : undefined;
  }).filter(pubkey => pubkey !== undefined);

  //LANG:JP Whirlpool のポジションのアドレスからデータを取得
  //LANG:EN Get data from Whirlpool position addresses
  const whirlpool_position_candidate_datas = await ctx.fetcher.listPositions(whirlpool_position_candidate_pubkeys, true);
  //LANG:JP 正しくデータ取得できたアドレスのみポジションのアドレスとして残す
  //LANG:EN Leave only addresses with correct data acquisition as position addresses
  const whirlpool_positions = whirlpool_position_candidate_pubkeys.filter((pubkey, i) => 
    whirlpool_position_candidate_datas[i] !== null
  );

  //LANG:JP 状態表示
  //LANG:EN Output the status of the positions
  for (let i=0; i < whirlpool_positions.length; i++ ) {
    const p = whirlpool_positions[i];

    //LANG:JP ポジションの情報取得
    //LANG:EN Get the status of the position
    const position = await client.getPosition(p);
    const data = position.getData();

    //LANG:JP ポジションが属しているプールを取得
    //LANG:EN Get the pool to which the position belongs
    const pool = await client.getPool(data.whirlpool);
    const token_a = pool.getTokenAInfo();
    const token_b = pool.getTokenBInfo();
    const price = PriceMath.sqrtPriceX64ToPrice(pool.getData().sqrtPrice, token_a.decimals, token_b.decimals);

    //LANG:JP 価格帯を取得
    //LANG:EN Get the price range of the position
    const lower_price = PriceMath.tickIndexToPrice(data.tickLowerIndex, token_a.decimals, token_b.decimals);
    const upper_price = PriceMath.tickIndexToPrice(data.tickUpperIndex, token_a.decimals, token_b.decimals);

    //LANG:JP ポジション内のトークンの量を計算
    //LANG:EN Calculate the amount of tokens that can be withdrawn from the position
    const amounts = PoolUtil.getTokenAmountsFromLiquidity(
      data.liquidity,
      pool.getData().sqrtPrice,
      PriceMath.tickIndexToSqrtPriceX64(data.tickLowerIndex),
      PriceMath.tickIndexToSqrtPriceX64(data.tickUpperIndex),
      true
    );

    //LANG:JP ポジションの情報表示
    //LANG:EN Output the status of the position
    console.log("position:", i, p.toBase58());
    console.log("\twhirlpool address:", data.whirlpool.toBase58());
    console.log("\twhirlpool price:", price.toFixed(token_b.decimals));
    console.log("\ttokenA:", token_a.mint.toBase58());
    console.log("\ttokenB:", token_b.mint.toBase58());
    console.log("\tliquidity:", data.liquidity.toString());
    console.log("\tlower:", data.tickLowerIndex, lower_price.toFixed(token_b.decimals));
    console.log("\tupper:", data.tickUpperIndex, upper_price.toFixed(token_b.decimals));
    console.log("\tamountA:", DecimalUtil.fromU64(amounts.tokenA, token_a.decimals).toString());
    console.log("\tamountB:", DecimalUtil.fromU64(amounts.tokenB, token_b.decimals).toString());
  }
}

main();