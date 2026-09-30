import { network } from "hardhat";

async function main() {
    const { ethers } = await network.create();

    const [, , arbiterSigner] = await ethers.getSigners();
    const mediaRegistry = await ethers.deployContract("MediaRegistry", arbiterSigner);
    console.log(`Arbiter (deployer): ${arbiterSigner.address}`);

    const address = await mediaRegistry.getAddress();
    console.log(`MediaRegistry deployed to: ${address}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
    
    