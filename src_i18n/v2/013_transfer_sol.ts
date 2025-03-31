import { address, appendTransactionMessageInstruction, createKeyPairFromBytes, createKeyPairSignerFromBytes, createSolanaRpc, createSolanaRpcSubscriptions, createTransactionMessage, getAddressFromPublicKey, getSignatureFromTransaction, isSolanaError, lamports, pipe, sendAndConfirmTransactionFactory, setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash, signTransactionMessageWithSigners } from "@solana/kit";
import secret from "../../wallet.json";
import { getSystemErrorMessage, getTransferSolInstruction, isSystemError } from "@solana-program/system";

const RPC_ENDPOINT_URL = "https://api.devnet.solana.com";
const WS_ENDPOINT_URL = "wss://api.devnet.solana.com";

async function main() {
    const rpc = createSolanaRpc(RPC_ENDPOINT_URL);
    const rpcSubscriptions = createSolanaRpcSubscriptions(WS_ENDPOINT_URL);
    const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
    
    const signer = await createKeyPairSignerFromBytes(new Uint8Array(secret));
    const walletAddress = signer.address;
    console.log("wallet pubkey:", walletAddress);
    
    const destAddress = address("vQW71yo6X1FjTwt9gaWtHYeoGMu7W9ehSmNiib7oW5G");

    const amount = BigInt(1_000_000);

    const latestBlockhash = await rpc.getLatestBlockhash().send();
    console.log("latestBlockhash:", latestBlockhash.value);
    
    const transactionMessage = pipe(
        createTransactionMessage({ version: 0 }),
        tx => (
            setTransactionMessageFeePayer(walletAddress, tx)
        ),
        tx => (
            setTransactionMessageLifetimeUsingBlockhash(latestBlockhash.value, tx)
        ),
        tx => appendTransactionMessageInstruction(
            getTransferSolInstruction({
                amount: lamports(amount),
                source: signer, 
                destination: destAddress
            }),
            tx,
        )
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