import { setWhirlpoolsConfig, swapInstructions } from "@orca-so/whirlpools";
import { address, appendTransactionMessageInstruction, appendTransactionMessageInstructions, createKeyPairSignerFromBytes, createSolanaRpc, createSolanaRpcSubscriptions, createTransactionMessage, getSignatureFromTransaction, isSolanaError, pipe, sendAndConfirmTransactionFactory, setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash, signTransactionMessageWithSigners } from "@solana/kit";
import secret from "../../wallet.json";
import { ORCA_WHIRLPOOL_PROGRAM_ID, PDAUtil } from "@orca-so/whirlpools-sdk";
import { PublicKey } from "@solana/web3.js";
import { fromLegacyPublicKey } from "@solana/compat";
import { getSystemErrorMessage, isSystemError } from "@solana-program/system";

const RPC_ENDPOINT_URL = "https://api.devnet.solana.com";
const WS_ENDPOINT_URL = "wss://api.devnet.solana.com";

async function main() {
    const rpc = createSolanaRpc(RPC_ENDPOINT_URL);
    const rpcSubscriptions = createSolanaRpcSubscriptions(WS_ENDPOINT_URL);
    const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

    const signer = await createKeyPairSignerFromBytes(new Uint8Array(secret));
    await setWhirlpoolsConfig("solanaDevnet");

    const devUSDC = {mint: address("BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k"), decimals: 6};
    const devSAMO = {mint: address("Jd4M8bfJG3sAkd82RsGWyEXoaBXQP7njFzBwEaCTuDa"), decimals: 9};
    const DEVNET_WHIRLPOOLS_CONFIG = address("FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR");
    const tickSpacing = 64;
    const whirlpoolPubkey = PDAUtil.getWhirlpool(
        ORCA_WHIRLPOOL_PROGRAM_ID,
        new PublicKey(DEVNET_WHIRLPOOLS_CONFIG.toString()),
        new PublicKey(devSAMO.mint.toString()),
        new PublicKey(devUSDC.mint.toString()),
        tickSpacing,
    ).publicKey;

    const { instructions, quote } = await swapInstructions(
        rpc,
        {
            inputAmount: BigInt(1_000_000),
            mint: devUSDC.mint,
        },
        fromLegacyPublicKey(whirlpoolPubkey),
        0.01,
        signer,
    );

    console.log("instructions:", instructions);
    console.log("quote:", quote);

    const latestBlockHash = await rpc.getLatestBlockhash().send();

    const transactionMessage = pipe(
        createTransactionMessage({ version: 0 }),
        tx => setTransactionMessageFeePayer(signer.address, tx),
        tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockHash.value, tx),
        tx => appendTransactionMessageInstructions(instructions, tx),
    );
    const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
    console.log("signedTransaction:", signedTransaction);
    console.log("signatures:", getSignatureFromTransaction(signedTransaction));

    try {
        await sendAndConfirmTransaction(signedTransaction, { commitment: "confirmed" });
        console.log('Transfer confirmed')
    } catch (e) {
        if (isSolanaError(e)) {
            const preflightErrorContext = e.context;
            const preflightErrorMessage = e.message;
            const errorDetailMessage = isSystemError(e.cause, transactionMessage)
                ? getSystemErrorMessage(e.cause.context.code)
                : e.message;
            console.log(preflightErrorContext, `${preflightErrorMessage}: ${errorDetailMessage}`);
        } else {
            throw e;
        }
    }
}

main();