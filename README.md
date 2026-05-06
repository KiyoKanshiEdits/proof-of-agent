# Proof of Agent (PoA)

**Verifiable Compute Receipts for Solana AI Agents**

The AI agent economy has generated over $470M in aGDP. You can verify that an agent *transacted* — but you can't verify what it actually *computed*. The transaction receipt exists. The compute receipt doesn't.

Proof of Agent fixes this.

---

## What It Does

PoA is an open standard and Solana program that enables AI agents to issue cryptographically signed receipts proving what they computed — stored on-chain and verifiable by anyone.

Each receipt binds:

- **Who** computed — agent public key
- **What model** — hash of the model/logic used
- **What inputs** — hash of the computation inputs
- **What outputs** — hash of the computation outputs
- **When** — anchored to a Solana slot

Six fields. One on-chain instruction. Verifiable forever.

---

## Why It Matters

- **Agent-to-agent trust.** When Agent A hires Agent B via Virtuals ACP, A can verify B did the work before releasing escrow. No more paying for hallucinated outputs.
- **Accountability.** When an agent managing capital makes a bad trade, there's a verifiable record of what model it ran, what data it saw, and what it decided. Principals can audit the decision, not just the result.
- **Regulatory readiness.** As autonomous agents handle real money, regulators will demand evidence of agent behaviour. PoA creates the audit trail before they ask for it.
- **Reputation infrastructure.** Agents with a track record of verified, accurate compute receipts build on-chain reputation. Agents without receipts are unverifiable black boxes.

---

## How It Works

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  AI Agent    │────▶│  PoA SDK     │────▶│  Solana Program  │
│  runs task   │     │  generates   │     │  stores receipt   │
│              │     │  receipt     │     │  on-chain         │
└─────────────┘     └──────────────┘     └─────────────────┘
                                                │
                                                ▼
                                         ┌─────────────────┐
                                         │  Anyone can      │
                                         │  verify receipt   │
                                         └─────────────────┘
```

1. An agent performs a computation (analysis, trade decision, content generation, etc.)
2. The PoA SDK hashes the inputs, model identifier, and outputs
3. The agent signs the receipt with its keypair
4. The signed receipt is submitted to the PoA Solana program
5. The program stores the receipt on-chain via ZK compression (Light Protocol)
6. Anyone can query and verify the receipt — the agent, the principal, a counterparty, or a regulator

---

## Receipt Schema (v0.1)

```rust
pub struct ComputeReceipt {
    /// Agent's public key (signer)
    pub agent: Pubkey,
    /// Poseidon hash of model identifier / logic version
    pub model_hash: [u8; 32],
    /// Poseidon hash of computation inputs
    pub input_hash: [u8; 32],
    /// Poseidon hash of computation outputs
    pub output_hash: [u8; 32],
    /// Solana slot at time of submission
    pub slot: u64,
    /// Optional: task ID linking to an ACP job or external reference
    pub task_id: Option<[u8; 32]>,
}
```

Receipts are stored using Light Protocol's ZK compression — keeping costs low (~0.0001 SOL per receipt) while maintaining full on-chain verifiability.

---

## What PoA Does NOT Do

PoA proves that an agent *claims* it ran a specific computation. It does **not** prove the computation was executed correctly (that requires full ZK execution proofs or TEEs, which are orders of magnitude more expensive).

Think of it as a **signed audit trail**, not a mathematical proof of correctness. The value is in:

- Creating an immutable, queryable record of agent behaviour
- Enabling reputation systems built on verifiable claims
- Making agents accountable — lying on a receipt is detectable if the inputs/outputs are later revealed

---

## Use Cases

| Scenario | Without PoA | With PoA |
|----------|-------------|----------|
| Agent-to-agent hiring (Virtuals ACP) | Pay and hope the agent did the work | Verify the compute receipt before releasing escrow |
| Portfolio management agent | "Trust me, I analysed your portfolio" | Receipt proves which model, which data, which output |
| Trading bot | Black box decisions | Auditable decision trail for every trade |
| Research agent | Unverifiable summaries | Receipts link to input data hashes — verify the agent read what it claims |
| Multi-agent pipeline | No visibility into intermediate steps | Each agent in the chain issues a receipt — full pipeline audit |

---

## Architecture

```
proof-of-agent/
├── programs/
│   └── poa/                  # Anchor program — receipt storage + verification
├── sdk/
│   └── typescript/           # TypeScript SDK — receipt generation + querying
├── circuits/
│   └── receipt-verify/       # Circom circuit for ZK-compressed storage
├── spec/
│   └── POA-SPEC-v0.1.md      # Formal standard specification
├── examples/
│   ├── trading-agent/        # Example: trading bot with PoA receipts
│   └── acp-integration/      # Example: Virtuals ACP escrow verification
└── tests/
```

---

## Tech Stack

- **Smart contracts:** Anchor (Rust) on Solana
- **ZK compression:** Light Protocol (cost-efficient on-chain storage)
- **Hash function:** Poseidon (native Solana syscall — `solana-poseidon`)
- **SDK:** TypeScript/JavaScript (npm package)
- **Proving system:** Groth16 via `groth16-solana` (for ZK-compressed receipt storage)

---

## Quick Start

```bash
# Install the SDK
# SDK publishing in progress — clone the repo to use locally
npm install @proof-of-agent/sdk

# In your agent code
import { PoA } from '@proof-of-agent/sdk';

const poa = new PoA({ agentKeypair });

// After your agent completes a computation
const receipt = await poa.issueReceipt({
  modelId: 'gpt-4-trading-v2.1',
  inputs: { portfolio, marketData, riskParams },
  outputs: { recommendation, confidence, reasoning },
});

// receipt.txSignature — Solana transaction
// receipt.receiptId — unique receipt identifier
// receipt.verify() — anyone can call this
```

---

## Roadmap

- [x] **v0.1** — Receipt schema + Anchor program + TypeScript SDK
- [ ] **v0.2** — Light Protocol ZK compression integration
- [ ] **v0.3** — Virtuals ACP integration example
- [ ] **v0.4** — Receipt querying API (by agent, by time range, by task)
- [ ] **v1.0** — Formal spec publication + security audit
- [ ] **v1.1** — Multi-chain support (Base/EVM)

---

## How This Connects to ZK Spend Guard

PoA and ZK Spend Guard are complementary layers:

- **PoA** answers: *"Did the agent do what it claims?"* (compute verification)
- **ZK Spend Guard** answers: *"Is the agent allowed to do this?"* (policy enforcement)

Together: an agent proves its computation is legitimate (PoA receipt) AND proves its action is within policy (Spend Guard proof). The escrow verifies both before releasing payment.

---

## Contributing

This is an open standard. Contributions welcome.

- **Spec feedback:** Open an issue on the spec document
- **SDK integrations:** PRs for additional language SDKs
- **Agent framework plugins:** Integrations with elizaOS, Solana Agent Kit, GOAT

---

## License

MIT

---

*Built by [Logan](https://twitter.com/) — if agents are going to manage billions, they need to prove their work.*

---

## Token Model (POA)

POA is the economic layer that makes the receipt network trustless.

**Utility:**

Agents stake POA to issue receipts. Stake acts as a quality signal and slashing condition for provably false receipts. Protocols pay POA to query verified agent histories before releasing escrow.

**Supply:**

Fixed supply, no inflation. Distribution weighted toward agents actively issuing receipts — the network rewards usage not speculation.

**Why a token:**

PoA is an open standard with no central operator. POA coordinates the network. Without it, trust defaults back to whoever runs the infrastructure.
