# Tour de Whirlpool
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

| token   | address                                        | decimals |
| ------- | ---------------------------------------------- | -------- |
| devUSDC | `BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k` | 6        |
| devUSDT | `H8UekPGwePSmQ3ttuYGPU1szyFfjZR4N53rymSFwpLPm` | 6        |
| devSAMO | `Jd4M8bfJG3sAkd82RsGWyEXoaBXQP7njFzBwEaCTuDa`  | 9        |
| devTMAC | `Afn8YB1p4NsoZeS5XJBZ18LTfEy5NFPwN46wapZcBQr6` | 6        |


1. devUSDC (15 devUSDC with 0.2 SOL)
```sh
ts-node src/EN/convert_sol_to_dev_token.ts devUSDC
```

2. devUSDT (15 devUSDT with 0.2 SOL)
```sh
ts-node src/EN/convert_sol_to_dev_token.ts devUSDT
```

3. devSAMO (1500 devSAMO with 0.2 SOL)
```sh
ts-node src/EN/convert_sol_to_dev_token.ts devSAMO
```

4. devTMAC (150 devTMAC with 0.2 SOL)
```sh
ts-node src/EN/convert_sol_to_dev_token.ts devTMAC
```

## Whirlpools in devnet
| program id                                    | whirlpools config                              |
| --------------------------------------------- | ---------------------------------------------- |
| `whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc` | `FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR` |

| tokenA  | tokenB  | tickSpacing | address                                        |
| ------- | ------- | ----------- | ---------------------------------------------- |
| SOL     | devUSDC | 64          | `3KBZiL2g8C7tiJ32hTv5v3KM7aK9htpqTw4cTXz1HvPt` |
| devUSDC | devUSDT | 1           | `63cMwvN8eoaD39os9bKP8brmA7Xtov9VxahnPufWCSdg` |
| devSAMO | devUSDC | 64          | `EgxU92G34jw6QDG9RuTX9StFg1PmHuDqkRKAE5kVEiZ4` |
| devTMAC | devUSDC | 64          | `H3xhLrSEyDFm6jjG42QezbvhSxF5YHW75VdGUnqeEg5y` |

## More resources
- Documentation: https://dev.orca.so/
- SDK Reference: https://dev.orca.so/legacy/
