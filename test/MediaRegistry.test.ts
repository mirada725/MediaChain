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

  it("registers a new version linked to its parent, by the same publisher", async function () {
    const { ethers } = await network.connect();
    const [owner] = await ethers.getSigners();
    const contract = await ethers.deployContract("MediaRegistry");
    const v1 = ethers.keccak256(ethers.toUtf8Bytes("v1"));
    const v2 = ethers.keccak256(ethers.toUtf8Bytes("v2"));

    await contract.registerMedia(v1, "Daily Times", "original upload");
    await expect(contract.registerVersion(v1, v2, "Daily Times", "cropped for print"))
      .to.emit(contract, "MediaVersionRegistered")
      .withArgs(v2, v1, owner.address, (ts: bigint) => ts > 0n);

    const [exists, publisher, , , note, parentHash] = await contract.verifyMedia(v2);
    expect(exists).to.equal(true);
    expect(publisher).to.equal(owner.address);
    expect(note).to.equal("cropped for print");
    expect(parentHash).to.equal(v1);
  });

  it("builds a walkable chain across multiple versions", async function () {
    const { ethers } = await network.connect();
    const contract = await ethers.deployContract("MediaRegistry");
    const v1 = ethers.keccak256(ethers.toUtf8Bytes("chain-v1"));
    const v2 = ethers.keccak256(ethers.toUtf8Bytes("chain-v2"));
    const v3 = ethers.keccak256(ethers.toUtf8Bytes("chain-v3"));

    await contract.registerMedia(v1, "Daily Times", "original");
    await contract.registerVersion(v1, v2, "Daily Times", "edit 1");
    await contract.registerVersion(v2, v3, "Daily Times", "edit 2");

    const [, , , , , parentOf3] = await contract.verifyMedia(v3);
    const [, , , , , parentOf2] = await contract.verifyMedia(v2);
    expect(parentOf3).to.equal(v2);
    expect(parentOf2).to.equal(v1);
  });

  it("rejects registering a version whose parent was never registered", async function () {
    const { ethers } = await network.connect();
    const contract = await ethers.deployContract("MediaRegistry");
    const fakeParent = ethers.keccak256(ethers.toUtf8Bytes("never-registered-parent"));
    const v2 = ethers.keccak256(ethers.toUtf8Bytes("orphan-version"));

    await expect(contract.registerVersion(fakeParent, v2, "Daily Times", "note"))
      .to.be.revertedWithCustomError(contract, "ParentNotFound")
      .withArgs(fakeParent);
  });

  it("rejects a version registered by someone other than the parent's publisher", async function () {
    const { ethers } = await network.connect();
    const [, other] = await ethers.getSigners();
    const contract = await ethers.deployContract("MediaRegistry");
    const v1 = ethers.keccak256(ethers.toUtf8Bytes("owned-v1"));
    const v2 = ethers.keccak256(ethers.toUtf8Bytes("stolen-v2"));

    await contract.registerMedia(v1, "Daily Times", "original");
    await expect(
      contract.connect(other).registerVersion(v1, v2, "Impersonator", "note")
    )
      .to.be.revertedWithCustomError(contract, "NotParentPublisher")
      .withArgs(v1, other.address);
  });

  it("rejects a version hash that is already registered elsewhere", async function () {
    const { ethers } = await network.connect();
    const contract = await ethers.deployContract("MediaRegistry");
    const v1 = ethers.keccak256(ethers.toUtf8Bytes("dup-v1"));
    const already = ethers.keccak256(ethers.toUtf8Bytes("already-registered"));

    await contract.registerMedia(v1, "Daily Times", "original");
    await contract.registerMedia(already, "Someone", "unrelated");

    await expect(contract.registerVersion(v1, already, "Daily Times", "note"))
      .to.be.revertedWithCustomError(contract, "AlreadyRegistered")
      .withArgs(already);
  });

    // ---------- Feature B: disputes ----------

  it("sets the deployer as the arbiter", async function () {
    const { ethers } = await network.connect();
    const [deployer] = await ethers.getSigners();
    const contract = await ethers.deployContract("MediaRegistry");

    expect(await contract.arbiter()).to.equal(deployer.address);
  });

  it("lets a third party raise a dispute against a registered work", async function () {
    const { ethers } = await network.connect();
    const [, publisher, challenger] = await ethers.getSigners();
    const contract = await ethers.deployContract("MediaRegistry");
    const work = ethers.keccak256(ethers.toUtf8Bytes("disputed-work"));
    const evidence = ethers.keccak256(ethers.toUtf8Bytes("my-earlier-draft"));

    await contract.connect(publisher).registerMedia(work, "Publisher", "original");

    await expect(
      contract.connect(challenger).raiseDispute(work, evidence, "I made this in 2024")
    )
      .to.emit(contract, "DisputeRaised")
      .withArgs(work, challenger.address, evidence, (ts: bigint) => ts > 0n);

    const d = await contract.getDispute(work);
    expect(d.status).to.equal(1n); // Open
    expect(d.challenger).to.equal(challenger.address);
    expect(d.evidenceHash).to.equal(evidence);
    expect(d.evidenceNote).to.equal("I made this in 2024");
  });

  it("rejects a dispute against a work that was never registered", async function () {
    const { ethers } = await network.connect();
    const [, , challenger] = await ethers.getSigners();
    const contract = await ethers.deployContract("MediaRegistry");
    const ghost = ethers.keccak256(ethers.toUtf8Bytes("ghost-work"));

    await expect(
      contract.connect(challenger).raiseDispute(ghost, ethers.ZeroHash, "note")
    )
      .to.be.revertedWithCustomError(contract, "MediaNotFound")
      .withArgs(ghost);
  });

  it("rejects a publisher disputing their own work", async function () {
    const { ethers } = await network.connect();
    const [, publisher] = await ethers.getSigners();
    const contract = await ethers.deployContract("MediaRegistry");
    const work = ethers.keccak256(ethers.toUtf8Bytes("self-dispute"));

    await contract.connect(publisher).registerMedia(work, "Publisher", "original");

    await expect(
      contract.connect(publisher).raiseDispute(work, ethers.ZeroHash, "note")
    )
      .to.be.revertedWithCustomError(contract, "CannotDisputeOwnWork")
      .withArgs(work);
  });

  it("rejects a second dispute while one is still open", async function () {
    const { ethers } = await network.connect();
    const [, publisher, challenger, other] = await ethers.getSigners();
    const contract = await ethers.deployContract("MediaRegistry");
    const work = ethers.keccak256(ethers.toUtf8Bytes("double-dispute"));

    await contract.connect(publisher).registerMedia(work, "Publisher", "original");
    await contract.connect(challenger).raiseDispute(work, ethers.ZeroHash, "first");

    await expect(
      contract.connect(other).raiseDispute(work, ethers.ZeroHash, "second")
    )
      .to.be.revertedWithCustomError(contract, "DisputeAlreadyOpen")
      .withArgs(work);
  });

  it("lets the arbiter uphold a dispute without altering the original record", async function () {
    const { ethers } = await network.connect();
    const [arbiter, publisher, challenger] = await ethers.getSigners();
    const contract = await ethers.deployContract("MediaRegistry");
    const work = ethers.keccak256(ethers.toUtf8Bytes("upheld-work"));

    await contract.connect(publisher).registerMedia(work, "Publisher", "original");
    await contract.connect(challenger).raiseDispute(work, ethers.ZeroHash, "prior art");

    await expect(contract.connect(arbiter).resolveDispute(work, true, "Evidence is convincing"))
      .to.emit(contract, "DisputeResolved")
      .withArgs(work, arbiter.address, true, (ts: bigint) => ts > 0n);

    const d = await contract.getDispute(work);
    expect(d.status).to.equal(2n); // Upheld
    expect(d.ruling).to.equal("Evidence is convincing");
    expect(d.resolvedAt).to.be.greaterThan(0n);

    // The record itself is untouched: annotated, never deleted.
    const record = await contract.verifyMedia(work);
    expect(record.exists).to.equal(true);
    expect(record.publisher).to.equal(publisher.address);
  });

  it("lets the arbiter reject a dispute, after which it can be re-raised", async function () {
    const { ethers } = await network.connect();
    const [arbiter, publisher, challenger] = await ethers.getSigners();
    const contract = await ethers.deployContract("MediaRegistry");
    const work = ethers.keccak256(ethers.toUtf8Bytes("rejected-work"));
    const betterEvidence = ethers.keccak256(ethers.toUtf8Bytes("stronger-proof"));

    await contract.connect(publisher).registerMedia(work, "Publisher", "original");
    await contract.connect(challenger).raiseDispute(work, ethers.ZeroHash, "weak claim");
    await contract.connect(arbiter).resolveDispute(work, false, "Insufficient evidence");

    expect((await contract.getDispute(work)).status).to.equal(3n); // Rejected

    await contract.connect(challenger).raiseDispute(work, betterEvidence, "new evidence");
    const d = await contract.getDispute(work);
    expect(d.status).to.equal(1n); // Open again
    expect(d.evidenceHash).to.equal(betterEvidence);
  });

  it("makes an upheld dispute final", async function () {
    const { ethers } = await network.connect();
    const [arbiter, publisher, challenger] = await ethers.getSigners();
    const contract = await ethers.deployContract("MediaRegistry");
    const work = ethers.keccak256(ethers.toUtf8Bytes("final-upheld"));

    await contract.connect(publisher).registerMedia(work, "Publisher", "original");
    await contract.connect(challenger).raiseDispute(work, ethers.ZeroHash, "claim");
    await contract.connect(arbiter).resolveDispute(work, true, "Upheld");

    await expect(
      contract.connect(challenger).raiseDispute(work, ethers.ZeroHash, "again")
    )
      .to.be.revertedWithCustomError(contract, "DisputeAlreadyUpheld")
      .withArgs(work);
  });

  it("rejects resolving a dispute by anyone other than the arbiter", async function () {
    const { ethers } = await network.connect();
    const [, publisher, challenger] = await ethers.getSigners();
    const contract = await ethers.deployContract("MediaRegistry");
    const work = ethers.keccak256(ethers.toUtf8Bytes("not-arbiter"));

    await contract.connect(publisher).registerMedia(work, "Publisher", "original");
    await contract.connect(challenger).raiseDispute(work, ethers.ZeroHash, "claim");

    await expect(contract.connect(publisher).resolveDispute(work, false, "I say no"))
      .to.be.revertedWithCustomError(contract, "NotArbiter")
      .withArgs(publisher.address);
  });

  it("rejects resolving a dispute that is not open", async function () {
    const { ethers } = await network.connect();
    const [arbiter, publisher] = await ethers.getSigners();
    const contract = await ethers.deployContract("MediaRegistry");
    const work = ethers.keccak256(ethers.toUtf8Bytes("no-dispute"));

    await contract.connect(publisher).registerMedia(work, "Publisher", "original");

    await expect(contract.connect(arbiter).resolveDispute(work, true, "nothing to rule on"))
      .to.be.revertedWithCustomError(contract, "NoOpenDispute")
      .withArgs(work);
  });
});