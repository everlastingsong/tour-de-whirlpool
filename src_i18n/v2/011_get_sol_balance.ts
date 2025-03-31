import { createKeyPairFromBytes, createSolanaRpc, getAddressFromPublicKey } from "@solana/kit";
import secret from "../../wallet.json";

const RPC_ENDPOINT_URL = "https://api.devnet.solana.com";

async function main() {
    const rpc = createSolanaRpc(RPC_ENDPOINT_URL);

    const keypair = await createKeyPairFromBytes(new Uint8Array(secret));
    const walletAddress = await getAddressFromPublicKey(keypair.publicKey);
    console.log("wallet pubkey:", walletAddress);

    const result = await rpc.getBalance(walletAddress, { commitment: "confirmed" }).send();
    console.log("lamports:", result.value);
    console.log("SOL:", Number(result.value) / 10**9);
}

main();