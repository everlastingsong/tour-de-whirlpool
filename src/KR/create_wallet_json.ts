// create_wallet_json.ts
import bs58 from "bs58";

const wallet_json = "wallet.json";

const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});
  
readline.question('secretKey(base58):', (secret_base58) => {
    readline.close();
    const secret_bytes = Uint8Array.from(bs58.decode(secret_base58.trim()));

    // write file
    const fs = require('fs')
    fs.writeFileSync(wallet_json, `[${secret_bytes.toString()}]`);

    // verify file
    const secret_bytes_loaded = JSON.parse(fs.readFileSync(wallet_json));
    const secret_base58_loaded = bs58.encode(Uint8Array.from(secret_bytes_loaded));
    if ( secret_base58 === secret_base58_loaded ) {
        console.log(`${wallet_json} created successfully!`);
    }
});
