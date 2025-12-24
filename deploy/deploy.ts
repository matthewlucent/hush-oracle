import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedHushOracle = await deploy("HushOracle", {
    from: deployer,
    log: true,
  });

  console.log(`HushOracle contract: `, deployedHushOracle.address);
};
export default func;
func.id = "deploy_hushOracle"; // id required to prevent reexecution
func.tags = ["HushOracle"];
