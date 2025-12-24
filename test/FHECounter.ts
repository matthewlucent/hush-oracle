import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { HushOracle, HushOracle__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("HushOracle")) as HushOracle__factory;
  const hushOracleContract = (await factory.deploy()) as HushOracle;
  const hushOracleAddress = await hushOracleContract.getAddress();

  return { hushOracleContract, hushOracleAddress };
}

describe("HushOracle", function () {
  let signers: Signers;
  let hushOracleContract: HushOracle;
  let hushOracleAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ hushOracleContract, hushOracleAddress } = await deployFixture());
  });

  it("records daily prices and predictions", async function () {
    const currentDay = await hushOracleContract.getCurrentDay();
    await hushOracleContract.connect(signers.deployer).updateDailyPrices(350_000n, 6_200_000n);

    const dailyPrice = await hushOracleContract.getDailyPrice(currentDay);
    expect(dailyPrice[0]).to.eq(350_000n);
    expect(dailyPrice[1]).to.eq(6_200_000n);
    expect(dailyPrice[2]).to.not.eq(0n);

    const encryptedInput = await fhevm
      .createEncryptedInput(hushOracleAddress, signers.alice.address)
      .add64(360_000n)
      .add8(1)
      .encrypt();

    const stake = ethers.parseEther("0.01");

    await hushOracleContract
      .connect(signers.alice)
      .placePrediction(0, encryptedInput.handles[0], encryptedInput.handles[1], encryptedInput.inputProof, {
        value: stake,
      });

    const targetDay = currentDay + 1n;
    const prediction = await hushOracleContract.getPrediction(signers.alice.address, 0, targetDay);

    expect(prediction[2]).to.eq(stake);
    expect(prediction[3]).to.eq(false);
  });

  it("awards points after confirmation on the next day", async function () {
    const day0 = await hushOracleContract.getCurrentDay();
    await hushOracleContract.connect(signers.deployer).updateDailyPrices(300_000n, 6_000_000n);

    const encryptedInput = await fhevm
      .createEncryptedInput(hushOracleAddress, signers.alice.address)
      .add64(310_000n)
      .add8(1)
      .encrypt();

    const stake = ethers.parseEther("0.02");

    await hushOracleContract
      .connect(signers.alice)
      .placePrediction(0, encryptedInput.handles[0], encryptedInput.handles[1], encryptedInput.inputProof, {
        value: stake,
      });

    await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 10]);
    await ethers.provider.send("evm_mine", []);

    const day1 = day0 + 1n;
    await hushOracleContract.connect(signers.deployer).updateDailyPrices(300_000n, 6_100_000n);

    await expect(hushOracleContract.connect(signers.alice).confirmPrediction(0, day1)).to.be.revertedWithCustomError(
      hushOracleContract,
      "TooEarly",
    );

    await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 10]);
    await ethers.provider.send("evm_mine", []);

    await hushOracleContract.connect(signers.alice).confirmPrediction(0, day1);

    const encryptedPoints = await hushOracleContract.getUserPoints(signers.alice.address);
    const clearPoints = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedPoints,
      hushOracleAddress,
      signers.alice,
    );

    expect(clearPoints).to.eq(stake);
  });
});
