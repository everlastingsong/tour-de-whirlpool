import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID,
  collectFeesQuote, collectRewardsQuote, TickArrayUtil,
  PDAUtil, PoolUtil, TokenExtensionUtil
} from "@orca-so/whirlpools-sdk";
import { DecimalUtil } from "@orca-so/common-sdk";
import Decimal from "decimal.js";

// Environment variables must be defined before script execution
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json
// WHIRLPOOL_POSITION=address_of_position

async function main() {
  // Create WhirlpoolClient
  const provider = AnchorProvider.env();
  const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const client = buildWhirlpoolClient(ctx);

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  // Token definition
  // devToken specification
  // https://everlastingsong.github.io/nebula/
  const devUSDC = { name: "devUSDC", mint: new PublicKey("BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k"), decimals: 6 };
  const devSAMO = { name: "devSAMO", mint: new PublicKey("Jd4M8bfJG3sAkd82RsGWyEXoaBXQP7njFzBwEaCTuDa"), decimals: 9 };
  const devTMAC = { name: "devTMAC", mint: new PublicKey("Afn8YB1p4NsoZeS5XJBZ18LTfEy5NFPwN46wapZcBQr6"), decimals: 6 };
  const token_map = new Map<String, { name: string, mint: PublicKey, decimals: number }>();
  [devUSDC, devSAMO, devTMAC].map((token) => token_map.set(token.mint.toBase58(), token));

  // Retrieve the position address from the WHIRLPOOL_POSITION environment variable
  const position_address = process.env.WHIRLPOOL_POSITION;
  const position_pubkey = new PublicKey(position_address);
  console.log("position address:", position_pubkey.toBase58());

  // Get the position and the pool to which the position belongs
  const position = await client.getPosition(position_pubkey);
  const whirlpool_pubkey = position.getData().whirlpool;
  const whirlpool = await client.getPool(whirlpool_pubkey);

  // Get TickArray and Tick
  const tick_spacing = whirlpool.getData().tickSpacing;
  const tick_array_lower_pubkey = PDAUtil.getTickArrayFromTickIndex(position.getData().tickLowerIndex, tick_spacing, whirlpool_pubkey, ctx.program.programId).publicKey;
  const tick_array_upper_pubkey = PDAUtil.getTickArrayFromTickIndex(position.getData().tickUpperIndex, tick_spacing, whirlpool_pubkey, ctx.program.programId).publicKey;
  const tick_array_lower = await ctx.fetcher.getTickArray(tick_array_lower_pubkey);
  const tick_array_upper = await ctx.fetcher.getTickArray(tick_array_upper_pubkey);
  const tick_lower = TickArrayUtil.getTickFromArray(tick_array_lower, position.getData().tickLowerIndex, tick_spacing);
  const tick_upper = TickArrayUtil.getTickFromArray(tick_array_upper, position.getData().tickUpperIndex, tick_spacing);

  // Get token info for TokenExtensions
  const tokenExtensionCtx = await TokenExtensionUtil.buildTokenExtensionContext(ctx.fetcher, whirlpool.getData());

  // Get trade fee
  const quote_fee = await collectFeesQuote({
    whirlpool: whirlpool.getData(),
    position: position.getData(),
    tickLower: tick_lower,
    tickUpper: tick_upper,
    tokenExtensionCtx,
  });

  console.log("fee tokenA(devSAMO):", DecimalUtil.adjustDecimals(new Decimal(quote_fee.feeOwedA.toString()), devSAMO.decimals));
  console.log("fee tokenB(devUSDC):", DecimalUtil.adjustDecimals(new Decimal(quote_fee.feeOwedB.toString()), devUSDC.decimals));

  // Get rewards
  const quote_reward = collectRewardsQuote({
    whirlpool: whirlpool.getData(),
    position: position.getData(),
    tickLower: tick_lower,
    tickUpper: tick_upper,
    tokenExtensionCtx,
  });

  quote_reward.rewardOwed.map((reward, i) => {
    const reward_info = whirlpool.getData().rewardInfos[i];

    if (PoolUtil.isRewardInitialized(reward_info)) {
      const token = token_map.get(reward_info.mint.toBase58());
      console.log(
        `reward[${i}]:`,
        DecimalUtil.adjustDecimals(new Decimal(reward.toString()), token.decimals),
        token.name
      );
    } 
    else {
      console.log(`reward[${i}]: NOT INITIALIZED`);
    }
  });
}

main();
