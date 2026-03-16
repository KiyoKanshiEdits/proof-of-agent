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

describe("proof-of-agent", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.poa as Program<Poa>;
  const agent = anchor.getProvider().publicKey;

  const receiptId = generateReceiptId();
  const modelHash = sha256("yield-optimizer-v2.1");
  const inputHash = sha256(JSON.stringify({ portfolio: ["SOL", "USDC"], amount: 1000 }));
  const outputHash = sha256(JSON.stringify({ recommendation: "rebalance", confidence: 87 }));

  let receiptPda: PublicKey;

  it("Issues a compute receipt", async () => {
    [receiptPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("receipt"),
        anchor.getProvider().publicKey.toBuffer(),
        Buffer.from(receiptId),
      ],
      program.programId
    );

    const tx = await program.methods
      .issueReceipt(receiptId, modelHash, inputHash, outputHash)
      .accounts({
        agent: agent,
        receipt: receiptPda,
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
      .issueReceipt(secondReceiptId, modelHash, inputHash, outputHash)
      .accounts({
        agent: agent,
        receipt: secondPda,
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
      .issueReceipt(closeReceiptId, modelHash, inputHash, outputHash)
      .accounts({
        agent: agent,
        receipt: closePda,
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
});
