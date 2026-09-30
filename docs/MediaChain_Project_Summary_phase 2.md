# MediaChain — Project Summary & Handoff Notes

**Module:** EC8204 Blockchain and Cyber Security, University of Ruhuna
**Student:** Lahiru (EG/2021/4549), group project, 4 members
**Deadline:** ~30 Sept 2026, 3-minute presentation
**Repo location (user's machine):** `E:\My Projects\mediachain` (Windows, PowerShell)

---

## 1. What MediaChain is

**Title:** MediaChain – Decentralized Digital Asset IP & Copyright Timestamping

**Pitch:** A blockchain-based system for creators, designers, and developers to
establish undeniable proof of prior art and copyright ownership. Cryptographic
signatures and version histories of digital assets (designs, code, audio,
media) are anchored on-chain at creation, allowing creators to instantly prove
original authorship and detect unauthorized tampering or stolen copies
without relying on centralized copyright offices.

This is a **pivot** from an earlier "media/newsroom tamper-detection" framing.
The pivot was made to avoid domain overlap with another group's project
(EvidenceChain — digital forensics/chain-of-custody) and to target a broader,
more defensible real-world use case. Confirmed via two reads of the official
group-project Google Sheet that no other group occupies this exact space.
Closest mechanism-peers (hash-anchor-verify pattern, different domain):
CertiChain, SkillSeal, UniLedger, SecureOTA.

## 2. Architecture

- **Phase 1 — Smart contract** (`contracts/MediaRegistry.sol`, Solidity ^0.8.24,
  Hardhat 3 + TypeScript): register a work's hash on-chain, verify a hash,
  plus a **version-history chain** (`registerVersion`, `MediaVersionRegistered`
  event, `parentHash` linkage, `ParentNotFound`/`NotParentPublisher` custom
  errors). 9/9 tests passing.
- **Phase 2 — Backend** (Express/TypeScript, ethers.js): register/verify REST
  API. Built and working, but **not used in the live demo path** — kept as a
  separate, independently valid piece of the project.
- **Phase 3 — Frontend** (React + TypeScript + Vite, in a sibling folder
  `mediachain-frontend`): a **true dapp** — talks directly to the contract.
  Register is a wallet-signed transaction via MetaMask (`BrowserProvider`);
  verify is a free read-only call (`JsonRpcProvider`). No backend dependency
  for the demo. This matches the architecture pattern from the lecturer's
  reference tutorial (Dapp University), even though the actual domain/use
  case differs completely.

Local network: Hardhat node, chain id `31337`, RPC `http://127.0.0.1:8545`.

## 3. Current feature status

### ✅ Feature A — Version-history chain (DONE, tested, frontend updated)
- Contract: `registerVersion(parentHash, newHash, sourceName, versionNote)`
  links a new version to a prior one; only the original publisher can extend
  their own chain (`NotParentPublisher` guard). `verifyMedia` now returns a
  6th value, `parentHash`, appended at the end (non-breaking ABI change).
- Frontend: rewritten with two tabs — "Check a work" (verify + renders a
  version-history timeline by walking `parentHash` client-side via
  `getVersionChain()`) and "Register (Creator)" (toggle between "New original
  work" and "New version of my work" — the parent hash is computed
  automatically by hashing the previous version's file, no manual hash entry).
  Rebranded copy throughout (tagline, badges, field labels) to match the new
  IP/copyright framing. Any file type accepted (not just images).
- Delivered to the user as plain-text code blocks (not zips) for 4 files:
  `contract-abi.json`, `lib/contract.ts` (addition), `App.tsx` (full
  rewrite), `App.css` (addition). **User has not yet confirmed applying and
  testing these on their own machine.**

### ⏳ Feature B — Dispute / prior-art-challenge workflow (NOT STARTED)
Planned next: a `raiseDispute` / `resolveDispute`-style workflow with an
arbiter address, to reach the "multi-step workflow, multiple parties, state
transitions" complexity tier seen in some other groups' projects (e.g.
TenderSeal's commit-reveal+deposits, Smart Contract Escrow's arbiter+timeout
pattern). User approved "Feature A, then B if time allows" and said they have
more time, so B should be picked up next once A is confirmed working.

### ⏳ Slide deck — needs rework (built, but on the OLD framing)
An 8-slide deck (`GP_XX_MediaChain.pptx`) was already built with pptxgenjs,
validated (structure, visual QA via rendered images, content QA), with
speaker notes forming a timed ~3:00 script (including a ~55s live demo
window). **It still reflects the old newsroom/photo-tampering story** and
needs to be reworked to the new IP/copyright timestoning framing. This was
deliberately deferred until the app itself was updated.

**Still missing for the deck:** the group's real number/short task name (for
the `GP_XX_Task_name.pptx` filename convention) and real member names/index
numbers for the title slide (currently placeholders).

## 4. Standing process rules (must keep following)

1. **Never deliver code changes as zip files** — always give exact code/diffs
   as plain text in chat, file by file, clearly labeled (whole-file
   replacement vs. snippet to add).
2. **Describe the plan and get explicit confirmation before generating
   complete code.**
3. **Commit messages in Conventional Commits format:**
   `type(scope): description` (e.g. `feat(contract): implement MediaRegistry
   with register and verify`).

## 5. Known issues already solved (for reference, don't re-debug these)

- A CSP "eval blocked" warning in-browser is from MetaMask's own injected
  script, not app code — harmless.
- "could not decode result data" on verify was caused by a stale Vite env
  var load / a restarted Hardhat node wiping contract state / wrong address
  in `.env.local` — always restart `npm run dev` after editing `.env.local`,
  and redeploy + update the address if the Hardhat node was restarted.
- After changing `MediaRegistry.sol`, always run
  `npx hardhat clean && npx hardhat compile` before `npx hardhat test` so
  TypeChain types regenerate.

## 6. Immediate next steps

1. User applies the Feature A frontend changes locally, runs
   `npm run build`/`npm run dev`, redeploys the contract (new bytecode →
   new address), updates `.env.local`.
2. Functional test: register an "original," register a "version" of it,
   check the version and confirm the version-history timeline renders
   correctly.
3. Commit Feature A with a conventional commit message.
4. Build Feature B (dispute/arbiter workflow) — plan first, confirm with
   user, then implement contract + tests + frontend, same process as A.
5. Rework the slide deck to the new IP/copyright framing, once the app is
   fully settled.
6. Get real group number, short task name, and member names/index numbers
   for the deck's filename and title slide.
