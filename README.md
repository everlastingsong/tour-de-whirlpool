![Tour-de-Whirlpool-image-2-small](https://github.com/user-attachments/assets/e7c80398-5329-4512-97fd-395285e7e0c9)

## Environment
The code is for whirlpools-sdk v0.13.15.

The code is verified with the following versions:

- node: 20.18.1
- ts-node: 10.9.2
- dependencies
  - @orca-so/whirlpools-sdk: 0.13.15
  - @orca-so/common-sdk: 0.6.10
  - @coral-xyz/anchor: 0.29.0
  - @solana/web3.js: 1.98.0
  - @solana/spl-token: 0.4.12
  - @types/bn.js: 5.1.3
  - bs58: 5.1.6
  - decimal.js: 10.5.0

### Note
- Please use `@coral-xyz/anchor` 0.29.0 (Whirlpool is build on Anchor 0.29.0)

## How to run
1. If you don't have your own key, create new solana key.
```sh
solana-keygen new -o ./wallet.json
```

2. Set environment variables
* Linux
```sh
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=wallet.json
```

* Windows
```sh
set ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
set ANCHOR_WALLET=wallet.json
```
3. Install dependencies
```sh
yarn
```

4. Run with `ts-node`
```sh
ts-node src/EN/011_get_sol_balance.ts
```

## How to get SOL and devTokens in devnet
You need to put `wallet.json` file at `tour-de-whirlpool` directory.

### 1 SOL (airdrop)
- Airdrops that can be executed in a short period are limited to around 1 or 2 SOL.
- If you encounter an error (429), please wait for a while and try again.

```sh
ts-node src/EN/airdrop_sol.ts 
```

### devTokens
| token    | address                                        | decimals | program    | extensions             |
| -------- | ---------------------------------------------- | -------- | ---------- | ---------------------- |
| devUSDC  | `BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k` | 6        | Token      |                        |
| devUSDT  | `H8UekPGwePSmQ3ttuYGPU1szyFfjZR4N53rymSFwpLPm` | 6        | Token      |                        |
| devSAMO  | `Jd4M8bfJG3sAkd82RsGWyEXoaBXQP7njFzBwEaCTuDa`  | 9        | Token      |                        |
| devTMAC  | `Afn8YB1p4NsoZeS5XJBZ18LTfEy5NFPwN46wapZcBQr6` | 6        | Token      |                        |
| devPYUSD | `Hy5ZLF26P3bjfVtrt4qDQCn6HGhS5izb5SNv7P9qmgcG` | 6        | Token-2022 |                        |
| devBERN  | `9fcwFnknB7cZrpVYQxoFgt9haYe59G7bZyTYJ4PkYjbS` | 5        | Token-2022 | TransferFee (2.69%)    |
| devSUSD  | `FKUPCock94bCnKqsi7UgqxnpzQ43c6VHEYhuEPXYpoBk` | 6        | Token-2022 | InterestBearing (3.0%) |

You can convert 0.1 SOL for each devTokens:
| token    | output amount | command                                               |
| -------- | ------------- | ----------------------------------------------------- |
| devUSDC  | 15            | `ts-node src/EN/convert_sol_to_dev_token.ts devUSDC`  |
| devUSDT  | 15            | `ts-node src/EN/convert_sol_to_dev_token.ts devUSDT`  |
| devSAMO  | 1500          | `ts-node src/EN/convert_sol_to_dev_token.ts devSAMO`  |
| devTMAC  | 150           | `ts-node src/EN/convert_sol_to_dev_token.ts devTMAC`  |
| devPYUSD | 15            | `ts-node src/EN/convert_sol_to_dev_token.ts devPYUSD` |
| devBERN  | 3000          | `ts-node src/EN/convert_sol_to_dev_token.ts devBERN`  |
| devSUSD  | 15            | `ts-node src/EN/convert_sol_to_dev_token.ts devSUSD`  |

## Whirlpools in devnet
| program id                                    | whirlpools config                              |
| --------------------------------------------- | ---------------------------------------------- |
| `whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc` | `FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR` |

| tokenA  | tokenB   | tickSpacing    | address                                        |
| ------- | -------- | -------------- | ---------------------------------------------- |
| SOL     | devUSDC  | 8              | `2WUgXbAmhquXMLhqqUthztDaVYnG8Mmp57CkXNb5ym9G` |
| SOL     | devUSDC  | 64             | `3KBZiL2g8C7tiJ32hTv5v3KM7aK9htpqTw4cTXz1HvPt` |
| SOL     | devUSDC  | 32896 (Splash) | `26WuWhkPBhG5d6kZwHBTruLxLvbSe7C62qH21zpisP9c` |
| devUSDC | devUSDT  | 1              | `63cMwvN8eoaD39os9bKP8brmA7Xtov9VxahnPufWCSdg` |
| devSAMO | devUSDC  | 64             | `EgxU92G34jw6QDG9RuTX9StFg1PmHuDqkRKAE5kVEiZ4` |
| devTMAC | devUSDC  | 64             | `H3xhLrSEyDFm6jjG42QezbvhSxF5YHW75VdGUnqeEg5y` |
| SOL     | devPYUSD | 32             | `8WLHU9LsezCo3DWdFk33rRPdybJabfZ7cBn9ZroWu11t` |
| devUSDC | devPYUSD | 1              | `J3J1hfwBCXgqp5vVPyfwkzUmcWRpsh3FdAvDiLEMzzYZ` |
| devSUSD | devPYUSD | 1              | `EENrwVE3NBeR5VcahPeZC8MietVKbXxnVRomagWdVuZa` |
| devBERN | devPYUSD | 128            | `DhGmYde8VmvVectHigcxZqAJBfCzARJxRCJsU6mBksdn` |
| devBERN | devPYUSD | 32896 (Splash) | `EdACSeagirp87pAkGwvHwsVkRwkjZTxd83v2UqgiB9LA` |

## More resources
- Documentation: https://dev.orca.so/
- SDK Reference: https://dev.orca.so/legacy/
