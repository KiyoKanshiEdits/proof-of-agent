/**
 * Example: Trading agent issuing a Proof of Agent receipt
 *
 * This demonstrates how an AI agent would use the PoA SDK
 * to create a verifiable record of its computation.
 *
 * Run: npx ts-node examples/trading-agent.ts
 */

import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { PoA } from "../sdk/src";

async function main() {
  // Connect to local validator
  const connection = new Connection("http://127.0.0.1:8899", "confirmed");

  // Create an agent keypair (in production, load from secure storage)
  const agentKeypair = Keypair.generate();

  // Airdrop SOL for transaction fees
  const sig = await connection.requestAirdrop(agentKeypair.publicKey, 2 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig);

  console.log("Agent:", agentKeypair.publicKey.toBase58());
  console.log("Balance:", (await connection.getBalance(agentKeypair.publicKey)) / LAMPORTS_PER_SOL, "SOL\n");

  // Initialise the PoA SDK
  const poa = new PoA({ connection, agentKeypair });

  // ── 1. Issue a receipt ───────────────────────────────────────────

  console.log("Issuing compute receipt...\n");

  const result = await poa.issueReceipt({
    modelId: "yield-optimizer-v2.1",
    inputs: {
      portfolio: ["SOL", "USDC", "JUP"],
      balances: { SOL: 150, USDC: 5000, JUP: 2000 },
      marketData: { solPrice: 185.50, jupPrice: 1.20 },
    },
    outputs: {
      recommendation: "rebalance",
      actions: [
        { sell: "JUP", amount: 500, reason: "overweight" },
        { buy: "SOL", amount: 200, reason: "underweight" },
      ],
      confidence: 87,
      riskScore: 0.23,
    },
  });

  console.log("Receipt issued!");
  console.log("  TX:", result.txSignature);
  console.log("  PDA:", result.receiptAddress.toBase58());
  console.log("  Receipt ID:", result.receiptId.toString("hex"), "\n");

  // ── 2. Fetch the receipt ─────────────────────────────────────────

  const receipt = await poa.fetchReceipt(result.receiptAddress);

  console.log("Fetched receipt:");
  console.log("  Agent:", receipt.agent.toBase58());
  console.log("  Slot:", receipt.slot);
  console.log("  Valid:", receipt.isValid, "\n");

  // ── 3. Verify integrity client-side ──────────────────────────────

  const isValid = poa.verifyReceipt(receipt);
  console.log("Client-side verification:", isValid ? "PASS" : "FAIL", "\n");

  // ── 4. Fetch all receipts by this agent ──────────────────────────

  // Issue a second receipt to demonstrate listing
  await poa.issueReceipt({
    modelId: "risk-assessor-v1.0",
    inputs: { wallet: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" },
    outputs: { riskLevel: "medium", flags: ["concentrated_holdings"] },
  });

  const allReceipts = await poa.fetchAllReceipts();
  console.log(`Found ${allReceipts.length} receipts for this agent:`);
  allReceipts.forEach((r, i) => {
    console.log(`  [${i + 1}] Slot: ${r.slot} | Valid: ${r.isValid} | PDA: ${r.address.toBase58()}`);
  });

  console.log("\n── Done. Agent compute is now verifiable on-chain. ──");
}

main().catch(console.error);
