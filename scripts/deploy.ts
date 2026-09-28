import { network } from "hardhat";

async function main() {
    const { ethers } = await network.connect();
    const mediaRegistry = await ethers.deployContract("MediaRegistry");

    const address = await mediaRegistry.getAddress();
    console.log(`MediaRegistry deployed to: ${address}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
    
