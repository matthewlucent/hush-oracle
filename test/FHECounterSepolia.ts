import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { HushOracle } from "../types";
import { expect } from "chai";

type Signers = {
  alice: HardhatEthersSigner;
};

describe("HushOracleSepolia", function () {
  let signers: Signers;
  let hushOracleContract: HushOracle;

  before(async function () {
    if (fhevm.isMock) {
      console.warn(`This hardhat test suite can only run on Sepolia Testnet`);
      this.skip();
    }

    try {
      const hushOracleDeployment = await deployments.get("HushOracle");
      hushOracleContract = await ethers.getContractAt("HushOracle", hushOracleDeployment.address);
    } catch (e) {
      (e as Error).message += ". Call 'npx hardhat deploy --network sepolia'";
      throw e;
    }

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { alice: ethSigners[0] };
  });

  it("reads current day and latest day", async function () {
    const currentDay = await hushOracleContract.getCurrentDay();
    const latestDay = await hushOracleContract.getLatestDay();

    expect(currentDay).to.be.a("bigint");
    expect(latestDay).to.be.a("bigint");

    const latestPrice = await hushOracleContract.getDailyPrice(latestDay);
    expect(latestPrice.length).to.eq(3);

    const points = await hushOracleContract.getUserPoints(signers.alice.address);
    expect(points).to.not.equal(undefined);
  });
});
