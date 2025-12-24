# Hush Oracle

Hush Oracle is a privacy-first daily prediction protocol for ETH and BTC prices built on Zama FHEVM. Users submit
encrypted price forecasts and a direction signal (greater or less), stake ETH, and later confirm results to earn
encrypted points equal to their stake. The contract records a single daily price snapshot at UTC 00:00 and keeps
predictions confidential end-to-end.

This repository includes the smart contract, deployment scripts, tasks, tests, and a React frontend that handles
encrypted inputs and user decryption without relying on mock data.

## Table of contents

- Overview
- Problems solved
- Key advantages
- How it works (daily flow)
- Data encoding
- On-chain architecture
- Frontend behavior
- Tech stack
- Repository layout
- Setup and usage
- Operations checklist
- Limitations
- Roadmap
- License

## Overview

Hush Oracle provides a simple but complete on-chain flow for daily price predictions:

- Two supported tokens: ETH and BTC.
- Prices are recorded once per UTC day by the contract owner.
- Users predict the next day's price with an encrypted value and encrypted direction.
- On the following day, users confirm their predictions to earn encrypted points.

The system is designed to keep sensitive user inputs private while preserving a transparent and verifiable
settlement flow.

## Problems solved

- Public prediction markets expose user intent and strategies. Hush Oracle keeps forecasts private on-chain.
- Users need a simple daily cadence. The protocol anchors predictions to a UTC day index.
- Points are tracked without revealing user balances. Encrypted points allow private scoring.
- It provides a minimal reference implementation for FHEVM-based prediction apps.

## Key advantages

- End-to-end confidentiality of prices and direction signals using FHE.
- Predictable daily cadence with a single on-chain snapshot per day.
- Simple game mechanics: one prediction per token per day, one confirmation per prediction.
- Encrypted points ledger that can be decrypted only by the user.
- Fully implemented frontend that performs encryption, reads on-chain data, and allows user decryption.

## How it works (daily flow)

1. At UTC 00:00, the owner records ETH and BTC prices for the day.
2. Users submit a prediction for the next day:
   - Encrypted predicted price in USD * 100 (cents).
   - Encrypted direction: 1 for greater, 2 for less.
   - ETH stake attached to the transaction.
3. After the day passes and a price is recorded, users confirm:
   - The contract compares encrypted predictions with the recorded price.
   - Correct predictions earn encrypted points equal to the stake amount.
4. Users can decrypt their points locally using the Zama relayer flow.

## Data encoding

- Price format: USD * 100 (for example 3524.50 is encoded as 352450).
- Direction encoding: 1 = greater than the recorded price, 2 = less than the recorded price.
- Day index: `block.timestamp / 1 days` (UTC day number).
- Stake: ETH value sent with the prediction transaction (in wei).

## On-chain architecture

- Contract: `HushOracle` in `contracts/HushOracle.sol`.
- Owner-only price updates with a once-per-day guard.
- Predictions stored per user, token, and day:
  - Encrypted price and encrypted direction.
  - Plain stake amount and claimed flag.
- Encrypted points ledger per user:
  - Points initialized lazily on first confirmation.
  - Points are increased only on correct predictions.
- Events emitted for price updates, prediction placement, and confirmation.

## Frontend behavior

- Reads use viem and wagmi hooks for fast public contract reads.
- Writes use ethers to submit encrypted inputs and confirmations.
- Encryption is performed client-side through the Zama relayer SDK.
- No local storage, no frontend environment variables, and no mock data.
- The frontend targets the deployed Sepolia contract address.

## Tech stack

- Smart contracts: Solidity + Zama FHEVM library
- Framework: Hardhat + hardhat-deploy + TypeChain
- Language: TypeScript
- Frontend: React + Vite
- Wallet UI: RainbowKit + wagmi
- On-chain reads: viem
- On-chain writes: ethers v6
- Encryption and decryption: Zama relayer SDK

## Repository layout

- `contracts/` smart contract source code
- `deploy/` deployment scripts
- `tasks/` hardhat tasks for operational flows
- `test/` contract tests
- `app/` React frontend
- `docs/` Zama reference notes

## Setup and usage

### Prerequisites

- Node.js 20+
- npm
- A funded Sepolia account for deployment and testing

### Install dependencies

```bash
npm install
```

### Compile and test

```bash
npm run compile
npm run test
```

### Local development deployment

Start a local node and deploy the contract:

```bash
npx hardhat node
npx hardhat deploy --network localhost
```

### Sepolia deployment

Create a `.env` file in the repository root with:

```
INFURA_API_KEY=your_infura_key
PRIVATE_KEY=0xyour_private_key
ETHERSCAN_API_KEY=your_etherscan_key_optional
```

Deploy:

```bash
npx hardhat deploy --network sepolia
```

### Operational tasks

Update daily prices (USD * 100):

```bash
npx hardhat --network sepolia task:update-prices --eth 350000 --btc 6200000
```

Place a prediction (direction 1 = greater, 2 = less):

```bash
npx hardhat --network sepolia task:place-prediction --token eth --price 360000 --direction 1 --stake 0.01
```

Confirm a prediction for a past day:

```bash
npx hardhat --network sepolia task:confirm-prediction --token eth --day 19853
```

Decrypt points for the caller:

```bash
npx hardhat --network sepolia task:decrypt-points
```

## Frontend setup

1. Copy the contract ABI from `deployments/sepolia/HushOracle.json` into `app/src/config/contracts.ts`.
2. Replace `CONTRACT_ADDRESS` in `app/src/config/contracts.ts` with the deployed Sepolia address.
3. Install app dependencies and run the dev server:

```bash
cd app
npm install
npm run dev
```

The frontend will read from the connected wallet's Sepolia network and will not use localhost chains.

## Operations checklist

- Record ETH and BTC prices once per UTC day.
- Encourage users to submit predictions before the day they target.
- Remind users to confirm after the price is recorded.
- Rotate the frontend contract address and ABI after each redeploy.

## Limitations

- The owner is a trusted role for daily price updates.
- Prices are recorded only once per day; missed updates block confirmations for that day.
- Points are not transferable and are not redeemable for ETH.
- Only ETH and BTC are supported.
- Only one prediction per token per day per user.
- Prediction stake is capped by `uint64` to keep encrypted points bounded.

## Roadmap

- Integrate automated price feeds and redundancy for daily updates.
- Add more assets and configurable price sources.
- Support non-custodial incentives or reward tokens.
- Add opt-in public leaderboards without revealing raw predictions.
- Expand analytics on accuracy trends while preserving privacy.
- Explore decentralized governance of the price update role.

## License

BSD-3-Clause-Clear. See `LICENSE`.
