import { expect } from "chai";
import { network } from "hardhat";

describe("MediaRegistry", function () {
  it("registers a new media hash successfully", async function () {
    const { ethers } = await network.connect();
    const [publisher] = await ethers.getSigners();

    const mediaRegistry = await ethers.deployContract("MediaRegistry");

    const hash = ethers.keccak256(ethers.toUtf8Bytes("sample-file-content"));
    await mediaRegistry.registerMedia(hash, "Test Publisher", "original upload");

    const record = await mediaRegistry.verifyMedia(hash);
    expect(record.exists).to.equal(true);
    expect(record.publisher).to.equal(publisher.address);
    expect(record.sourceName).to.equal("Test Publisher");
  });

  it("rejects registering the same hash twice", async function () {
    const { ethers } = await network.connect();
    const mediaRegistry = await ethers.deployContract("MediaRegistry");

    const hash = ethers.keccak256(ethers.toUtf8Bytes("duplicate-content"));
    await mediaRegistry.registerMedia(hash, "First Publisher", "original");

    await expect(
      mediaRegistry.registerMedia(hash, "Second Publisher", "attempted overwrite")
    ).to.be.revertedWithCustomError(mediaRegistry, "AlreadyRegistered");
  });

  it("returns exists = false for a hash that was never registered", async function () {
    const { ethers } = await network.connect();
    const mediaRegistry = await ethers.deployContract("MediaRegistry");

    const unknownHash = ethers.keccak256(ethers.toUtf8Bytes("never-registered"));
    const record = await mediaRegistry.verifyMedia(unknownHash);

    expect(record.exists).to.equal(false);
    expect(record.publisher).to.equal(ethers.ZeroAddress);
  });

  it("detects tampering: a modified file produces a different hash and is not found", async function () {
    const { ethers } = await network.connect();
    const mediaRegistry = await ethers.deployContract("MediaRegistry");

    const originalHash = ethers.keccak256(ethers.toUtf8Bytes("original-photo-bytes"));
    const tamperedHash = ethers.keccak256(ethers.toUtf8Bytes("original-photo-bytes-EDITED"));

    await mediaRegistry.registerMedia(originalHash, "News Org", "original upload");

    const originalRecord = await mediaRegistry.verifyMedia(originalHash);
    const tamperedRecord = await mediaRegistry.verifyMedia(tamperedHash);

    expect(originalRecord.exists).to.equal(true);
    expect(tamperedRecord.exists).to.equal(false);
  });
});