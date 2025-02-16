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

  // Retrieve the position address from the WHIRLPOOL_POSITION environment variable
  const position_address = process.env.WHIRLPOOL_POSITION;
  const position_pubkey = new PublicKey(position_address);
  console.log("position address:", position_pubkey.toBase58());

  // Get the position and the pool to which the position belongs
  const position = await client.getPosition(position_pubkey);
  const position_owner = ctx.wallet.publicKey;
  const position_mint = position.getData().positionMint;
  const position_mint_program_id = position.getPositionMintTokenProgramId();
  const position_token_account = getAssociatedTokenAddressSync(position_mint, position_owner, false, position_mint_program_id);
  const whirlpool_pubkey = position.getData().whirlpool;
  const whirlpool = await client.getPool(whirlpool_pubkey);
  const token_a = whirlpool.getTokenAInfo();
  const token_b = whirlpool.getTokenBInfo();

  // Get TickArray and Tick
  const tick_spacing = whirlpool.getData().tickSpacing;
  const tick_array_lower_pubkey = PDAUtil.getTickArrayFromTickIndex(position.getData().tickLowerIndex, tick_spacing, whirlpool_pubkey, ctx.program.programId).publicKey;
  const tick_array_upper_pubkey = PDAUtil.getTickArrayFromTickIndex(position.getData().tickUpperIndex, tick_spacing, whirlpool_pubkey, ctx.program.programId).publicKey;

  // Create token accounts to receive fees and rewards
  // Collect mint addresses of tokens to receive
  const tokens_to_be_collected = new Set<string>();
  tokens_to_be_collected.add(token_a.mint.toBase58());
  tokens_to_be_collected.add(token_b.mint.toBase58());
  whirlpool.getData().rewardInfos.map((reward_info) => {
    if (PoolUtil.isRewardInitialized(reward_info)) {
      tokens_to_be_collected.add(reward_info.mint.toBase58());
    }
  });
  // Get addresses of token accounts and get instructions to create if it does not exist
  const required_ta_ix: Instruction[] = [];
  const token_account_map = new Map<string, PublicKey>();
  for (let mint_b58 of tokens_to_be_collected) {
    const mint = new PublicKey(mint_b58);
    // If present, ix is EMPTY_INSTRUCTION
    const { address, ...ix } = await resolveOrCreateATA(
      ctx.connection,
      position_owner,
      mint,
      () => ctx.fetcher.getAccountRentExempt()
    );
    required_ta_ix.push(ix);
    token_account_map.set(mint_b58, address);
  }

  // Build the instruction to update fees and rewards
  let update_fee_and_rewards_ix = WhirlpoolIx.updateFeesAndRewardsIx(
    ctx.program,
    {
      whirlpool: position.getData().whirlpool,
      position: position_pubkey,
      tickArrayLower: tick_array_lower_pubkey,
      tickArrayUpper: tick_array_upper_pubkey,
    }
  );

  // Build the instruction to collect fees
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

  // Build the instructions to collect rewards
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

  // Create a transaction and add the instruction
  const tx_builder = new TransactionBuilder(ctx.connection, ctx.wallet);
  // Create token accounts
  required_ta_ix.map((ix) => tx_builder.addInstruction(ix));
  // Update fees and rewards, collect fees, and collect rewards
  tx_builder
    .addInstruction(update_fee_and_rewards_ix)
    .addInstruction(collect_fees_ix)
    .addInstruction(collect_reward_ix[0])
    .addInstruction(collect_reward_ix[1])
    .addInstruction(collect_reward_ix[2]);

  // Send the transaction
  const signature = await tx_builder.buildAndExecute();
  console.log("signature:", signature);

  // Wait for the transaction to complete
  const latest_blockhash = await ctx.connection.getLatestBlockhash();
  await ctx.connection.confirmTransaction({ signature, ...latest_blockhash }, "confirmed");
}

main();
