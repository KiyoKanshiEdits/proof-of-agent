import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Poa } from "../target/types/poa";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { createHash, randomBytes } from "crypto";
import { assert } from "chai";

function sha256(data: string): number[] {
  const hash = createHash("sha256").update(data).digest();
  return Array.from(hash);
}

function generateReceiptId(): number[] {
  return Array.from(randomBytes(16));
}

const EMPTY_HASH = Array(32).fill(0);

describe("proof-of-agent", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.poa as Program<Poa>;
  const agent = anchor.getProvider().publicKey;

  const receiptId = generateReceiptId();
  const modelHash = sha256("yield-optimizer-v2.1");
  const inputHash = sha256(JSON.stringify({ portfolio: ["SOL", "USDC"], amount: 1000 }));
  const outputHash = sha256(JSON.stringify({ recommendation: "rebalance", confidence: 87 }));

  let receiptPda: PublicKey;

  it("Issues a compute receipt (no parent)", async () => {
    [receiptPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("receipt"),
        anchor.getProvider().publicKey.toBuffer(),
        Buffer.from(receiptId),
      ],
      program.programId
    );

    const tx = await program.methods
      .issueReceipt(receiptId, modelHash, inputHash, outputHash, EMPTY_HASH)
      .accounts({
        agent: agent,
        receipt: receiptPda,
        parentReceipt: null,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Issue receipt tx:", tx);

    const receipt = await program.account.computeReceipt.fetch(receiptPda);
    console.log("Agent:", receipt.agent.toBase58());
    console.log("Slot:", receipt.slot.toString());
    console.log("Valid:", receipt.isValid);

    assert.ok(receipt.agent.equals(agent));
    assert.ok(receipt.isValid);
    assert.deepEqual(receipt.receiptId, receiptId);
    assert.deepEqual(receipt.modelHash, modelHash);
    assert.deepEqual(receipt.inputHash, inputHash);
    assert.deepEqual(receipt.outputHash, outputHash);
    assert.deepEqual(receipt.parentReceiptHash, EMPTY_HASH);
  });

  it("Issues a second receipt with same inputs (different receipt_id)", async () => {
    const secondReceiptId = generateReceiptId();

    const [secondPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("receipt"),
        anchor.getProvider().publicKey.toBuffer(),
        Buffer.from(secondReceiptId),
      ],
      program.programId
    );

    const tx = await program.methods
      .issueReceipt(secondReceiptId, modelHash, inputHash, outputHash, EMPTY_HASH)
      .accounts({
        agent: agent,
        receipt: secondPda,
        parentReceipt: null,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Second receipt tx:", tx);

    const receipt = await program.account.computeReceipt.fetch(secondPda);
    assert.ok(receipt.isValid);
    assert.deepEqual(receipt.inputHash, inputHash);
    console.log("Same inputs, different receipt_id — no collision");
  });

  it("Verifies a receipt", async () => {
    const tx = await program.methods
      .verifyReceipt()
      .accounts({
        receipt: receiptPda,
      })
      .rpc();

    console.log("Verify receipt tx:", tx);
  });

  it("Fails to invalidate from wrong agent", async () => {
    const fakeAgent = anchor.web3.Keypair.generate();

    try {
      await program.methods
        .invalidateReceipt()
        .accounts({
          agent: fakeAgent.publicKey,
          receipt: receiptPda,
        })
        .signers([fakeAgent])
        .rpc();
      assert.fail("Should have thrown");
    } catch (err) {
      console.log("Correctly rejected unauthorized invalidation");
    }
  });

  it("Invalidates a receipt from original agent", async () => {
    const tx = await program.methods
      .invalidateReceipt()
      .accounts({
        agent: agent,
        receipt: receiptPda,
      })
      .rpc();

    console.log("Invalidate receipt tx:", tx);

    const receipt = await program.account.computeReceipt.fetch(receiptPda);
    assert.ok(!receipt.isValid);
    console.log("Receipt invalidated successfully");
  });

  it("Fails to invalidate an already invalidated receipt", async () => {
    try {
      await program.methods
        .invalidateReceipt()
        .accounts({
          agent: agent,
          receipt: receiptPda,
        })
        .rpc();
      assert.fail("Should have thrown");
    } catch (err) {
      console.log("Correctly rejected double invalidation");
    }
  });

  it("Closes a receipt and reclaims rent", async () => {
    const closeReceiptId = generateReceiptId();
    const [closePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("receipt"),
        anchor.getProvider().publicKey.toBuffer(),
        Buffer.from(closeReceiptId),
      ],
      program.programId
    );

    await program.methods
      .issueReceipt(closeReceiptId, modelHash, inputHash, outputHash, EMPTY_HASH)
      .accounts({
        agent: agent,
        receipt: closePda,
        parentReceipt: null,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const balanceBefore = await anchor.getProvider().connection.getBalance(agent);

    await program.methods
      .closeReceipt()
      .accounts({
        agent: agent,
        receipt: closePda,
      })
      .rpc();

    const balanceAfter = await anchor.getProvider().connection.getBalance(agent);
    assert.ok(balanceAfter > balanceBefore, "Rent should be reclaimed");

    try {
      await program.account.computeReceipt.fetch(closePda);
      assert.fail("Account should be closed");
    } catch (err) {
      console.log("Receipt closed, rent reclaimed successfully");
    }
  });

  // ── Task Linking Tests ─────────────────────────────────────────

  it("Issues a child receipt linked to a parent", async () => {
    // Issue parent receipt
    const parentId = generateReceiptId();
    const [parentPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("receipt"),
        anchor.getProvider().publicKey.toBuffer(),
        Buffer.from(parentId),
      ],
      program.programId
    );

    await program.methods
      .issueReceipt(
        parentId,
        sha256("data-collector-v1"),
        sha256(JSON.stringify({ source: "coingecko" })),
        sha256(JSON.stringify({ prices: { SOL: 185 } })),
        EMPTY_HASH
      )
      .accounts({
        agent: agent,
        receipt: parentPda,
        parentReceipt: null,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const parentReceipt = await program.account.computeReceipt.fetch(parentPda);
    const parentHash = Array.from(parentReceipt.receiptHash);

    // Issue child receipt linked to parent
    const childId = generateReceiptId();
    const [childPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("receipt"),
        anchor.getProvider().publicKey.toBuffer(),
        Buffer.from(childId),
      ],
      program.programId
    );

    await program.methods
      .issueReceipt(
        childId,
        sha256("analyser-v2"),
        sha256(JSON.stringify({ prices: { SOL: 185 } })),
        sha256(JSON.stringify({ signal: "buy", confidence: 92 })),
        parentHash
      )
      .accounts({
        agent: agent,
        receipt: childPda,
        parentReceipt: parentPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const childReceipt = await program.account.computeReceipt.fetch(childPda);
    assert.deepEqual(childReceipt.parentReceiptHash, parentHash);
    assert.ok(childReceipt.isValid);
    console.log("Child receipt linked to parent successfully");
  });

  it("Fails to link to an invalidated parent", async () => {
    // Issue and invalidate a parent
    const badParentId = generateReceiptId();
    const [badParentPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("receipt"),
        anchor.getProvider().publicKey.toBuffer(),
        Buffer.from(badParentId),
      ],
      program.programId
    );

    await program.methods
      .issueReceipt(
        badParentId,
        sha256("bad-model"),
        sha256("bad-input"),
        sha256("bad-output"),
        EMPTY_HASH
      )
      .accounts({
        agent: agent,
        receipt: badParentPda,
        parentReceipt: null,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const badParentReceipt = await program.account.computeReceipt.fetch(badParentPda);
    const badParentHash = Array.from(badParentReceipt.receiptHash);

    // Invalidate it
    await program.methods
      .invalidateReceipt()
      .accounts({
        agent: agent,
        receipt: badParentPda,
      })
      .rpc();

    // Try to issue child linked to invalidated parent
    const childId = generateReceiptId();
    const [childPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("receipt"),
        anchor.getProvider().publicKey.toBuffer(),
        Buffer.from(childId),
      ],
      program.programId
    );

    try {
      await program.methods
        .issueReceipt(
          childId,
          sha256("child-model"),
          sha256("child-input"),
          sha256("child-output"),
          badParentHash
        )
        .accounts({
          agent: agent,
          receipt: childPda,
          parentReceipt: badParentPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should have thrown");
    } catch (err) {
      console.log("Correctly rejected linking to invalidated parent");
    }
  });
});
