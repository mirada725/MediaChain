import { network } from "hardhat";

// Chain ID of the local Hardhat node. On this chain we keep the old behaviour:
// account #2 is the arbiter (reviewer).
const LOCAL_CHAIN_ID = 31337n;
const SEPOLIA_CHAIN_ID = 11155111n;

async function main() {
    const { ethers } = await network.create();

    const { chainId } = await ethers.provider.getNetwork();
    const isLocal = chainId === LOCAL_CHAIN_ID;

    // Local node: it has 20 test accounts, so we use #2.
    // Sepolia: the only account is the one stored in the keystore, so we use the first signer.
    const signers = await ethers.getSigners();
    const deployer = isLocal ? signers[2] : signers[0];

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`Network chain ID: ${chainId}`);
    console.log(`Arbiter (deployer): ${deployer.address}`);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

    if (balance === 0n) {
        throw new Error("The deployer account has no ETH. Fund it first.");
    }

    const mediaRegistry = await ethers.deployContract("MediaRegistry", deployer);
    console.log("Waiting for the deployment to be confirmed...");
    await mediaRegistry.waitForDeployment();

    const address = await mediaRegistry.getAddress();
    const receipt = await mediaRegistry.deploymentTransaction()?.wait();
    const blockNumber = receipt?.blockNumber;

    console.log(`MediaRegistry deployed to: ${address}`);
    console.log(`Deployment block: ${blockNumber}`);
    console.log(`Transaction: ${receipt?.hash}`);

    if (chainId === SEPOLIA_CHAIN_ID) {
        console.log(`Etherscan: https://sepolia.etherscan.io/address/${address}`);
    }

    console.log("");
    console.log("Frontend env values:");
    console.log(`VITE_CONTRACT_ADDRESS=${address}`);
    console.log(`VITE_DEPLOY_BLOCK=${blockNumber}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});