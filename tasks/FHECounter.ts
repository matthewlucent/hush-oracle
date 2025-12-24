import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

/**
 * Example:
 *   - npx hardhat --network localhost task:address
 *   - npx hardhat --network sepolia task:address
 */
task("task:address", "Prints the HushOracle address").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { deployments } = hre;

  const hushOracle = await deployments.get("HushOracle");

  console.log("HushOracle address is " + hushOracle.address);
});

/**
 * Example:
 *   - npx hardhat --network localhost task:update-prices --eth 350000 --btc 6200000
 */
task("task:update-prices", "Updates daily ETH/BTC prices (USD * 100)")
  .addParam("eth", "ETH price in USD * 100")
  .addParam("btc", "BTC price in USD * 100")
  .addOptionalParam("address", "Optionally specify the HushOracle contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const ethPrice = BigInt(taskArguments.eth);
    const btcPrice = BigInt(taskArguments.btc);

    const hushOracleDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("HushOracle");

    const signers = await ethers.getSigners();
    const hushOracleContract = await ethers.getContractAt("HushOracle", hushOracleDeployment.address);

    const tx = await hushOracleContract.connect(signers[0]).updateDailyPrices(ethPrice, btcPrice);
    console.log(`Wait for tx:${tx.hash}...`);
    await tx.wait();

    console.log(`Updated prices: ETH=${ethPrice} BTC=${btcPrice}`);
  });

/**
 * Example:
 *   - npx hardhat --network localhost task:place-prediction --token eth --price 360000 --direction 1 --stake 0.01
 */
task("task:place-prediction", "Places an encrypted price prediction")
  .addParam("token", "Token symbol: eth or btc")
  .addParam("price", "Predicted price in USD * 100")
  .addParam("direction", "1 for greater, 2 for less")
  .addParam("stake", "Stake in ETH (e.g. 0.01)")
  .addOptionalParam("address", "Optionally specify the HushOracle contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const token = taskArguments.token.toLowerCase();
    const tokenId = token === "eth" ? 0 : token === "btc" ? 1 : -1;
    if (tokenId < 0) {
      throw new Error("Token must be eth or btc");
    }

    const price = BigInt(taskArguments.price);
    const direction = parseInt(taskArguments.direction, 10);
    if (![1, 2].includes(direction)) {
      throw new Error("Direction must be 1 or 2");
    }

    const hushOracleDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("HushOracle");

    const signers = await ethers.getSigners();
    const hushOracleContract = await ethers.getContractAt("HushOracle", hushOracleDeployment.address);

    const encryptedInput = await fhevm
      .createEncryptedInput(hushOracleDeployment.address, signers[0].address)
      .add64(price)
      .add8(direction)
      .encrypt();

    const stakeWei = ethers.parseEther(taskArguments.stake);

    const tx = await hushOracleContract
      .connect(signers[0])
      .placePrediction(tokenId, encryptedInput.handles[0], encryptedInput.handles[1], encryptedInput.inputProof, {
        value: stakeWei,
      });

    console.log(`Wait for tx:${tx.hash}...`);
    await tx.wait();
    console.log(`Prediction placed for ${token.toUpperCase()} with stake ${taskArguments.stake} ETH`);
  });

/**
 * Example:
 *   - npx hardhat --network localhost task:confirm-prediction --token eth --day 19853
 */
task("task:confirm-prediction", "Confirms a prediction for a past day")
  .addParam("token", "Token symbol: eth or btc")
  .addParam("day", "Target day index")
  .addOptionalParam("address", "Optionally specify the HushOracle contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const token = taskArguments.token.toLowerCase();
    const tokenId = token === "eth" ? 0 : token === "btc" ? 1 : -1;
    if (tokenId < 0) {
      throw new Error("Token must be eth or btc");
    }

    const day = BigInt(taskArguments.day);

    const hushOracleDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("HushOracle");

    const signers = await ethers.getSigners();
    const hushOracleContract = await ethers.getContractAt("HushOracle", hushOracleDeployment.address);

    const tx = await hushOracleContract.connect(signers[0]).confirmPrediction(tokenId, day);
    console.log(`Wait for tx:${tx.hash}...`);
    await tx.wait();
    console.log(`Prediction confirmed for day ${day}`);
  });

/**
 * Example:
 *   - npx hardhat --network localhost task:decrypt-points
 */
task("task:decrypt-points", "Decrypts the caller points balance")
  .addOptionalParam("address", "Optionally specify the HushOracle contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const hushOracleDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("HushOracle");

    const signers = await ethers.getSigners();
    const hushOracleContract = await ethers.getContractAt("HushOracle", hushOracleDeployment.address);

    const encryptedPoints = await hushOracleContract.getUserPoints(signers[0].address);
    if (encryptedPoints === ethers.ZeroHash) {
      console.log("Encrypted points: 0x0");
      console.log("Clear points    : 0");
      return;
    }

    const clearPoints = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedPoints,
      hushOracleDeployment.address,
      signers[0],
    );
    console.log(`Encrypted points: ${encryptedPoints}`);
    console.log(`Clear points    : ${clearPoints}`);
  });
