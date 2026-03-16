import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  TransactionSignature,
} from "@solana/web3.js";
import { createHash, randomBytes } from "crypto";
import idl from "./idl/poa.json";

const PROGRAM_ID = new PublicKey("A8wBefib1QpxPpkV7hrz4tRp49L6gxzDhWBQFcLmBVnv");

// ── Types ──────────────────────────────────────────────────────────

export interface PoAConfig {
  /** Solana RPC connection */
  connection: Connection;
  /** Agent's keypair (signs receipts) */
  agentKeypair: Keypair;
  /** Optional: custom program ID (defaults to deployed PoA program) */
  programId?: PublicKey;
}

export interface IssueReceiptParams {
  /** Model identifier string (e.g. "gpt-4-trading-v2.1") */
  modelId: string;
  /** Raw inputs — any serializable object */
  inputs: any;
  /** Raw outputs — any serializable object */
  outputs: any;
  /** Optional: provide your own 16-byte receipt ID (auto-generated if omitted) */
  receiptId?: Buffer;
}

export interface Receipt {
  /** On-chain account address (PDA) */
  address: PublicKey;
  /** Agent that issued the receipt */
  agent: PublicKey;
  /** 16-byte unique identifier */
  receiptId: number[];
  /** SHA-256 of model identifier */
  modelHash: number[];
  /** SHA-256 of inputs */
  inputHash: number[];
  /** SHA-256 of outputs */
  outputHash: number[];
  /** Solana slot at time of issuance */
  slot: number;
  /** Integrity hash binding all fields */
  receiptHash: number[];
  /** Whether the receipt is still valid */
  isValid: boolean;
}

export interface IssueResult {
  /** Transaction signature */
  txSignature: TransactionSignature;
  /** PDA address of the receipt account */
  receiptAddress: PublicKey;
  /** The 16-byte receipt ID used */
  receiptId: Buffer;
}

// ── Helpers ────────────────────────────────────────────────────────

function sha256(data: string): number[] {
  return Array.from(createHash("sha256").update(data).digest());
}

function hashInputs(inputs: any): number[] {
  return sha256(JSON.stringify(inputs));
}

// ── SDK Class ──────────────────────────────────────────────────────

export class PoA {
  private program: Program;
  private provider: AnchorProvider;
  private agentKeypair: Keypair;
  public programId: PublicKey;

  constructor(config: PoAConfig) {
    this.agentKeypair = config.agentKeypair;
    this.programId = config.programId ?? PROGRAM_ID;

    const wallet = new Wallet(this.agentKeypair);
    this.provider = new AnchorProvider(config.connection, wallet, {
      commitment: "confirmed",
    });

    this.program = new Program(idl as any, this.provider);
  }

  /** The agent's public key */
  get agent(): PublicKey {
    return this.agentKeypair.publicKey;
  }

  /** Derive the PDA for a receipt given a receipt ID */
  findReceiptAddress(receiptId: Buffer): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("receipt"), this.agent.toBuffer(), receiptId],
      this.programId
    );
    return pda;
  }

  /**
   * Issue a compute receipt on-chain.
   *
   * ```ts
   * const result = await poa.issueReceipt({
   *   modelId: "gpt-4-trading-v2.1",
   *   inputs: { portfolio: ["SOL", "USDC"], amount: 1000 },
   *   outputs: { recommendation: "rebalance", confidence: 87 },
   * });
   * ```
   */
  async issueReceipt(params: IssueReceiptParams): Promise<IssueResult> {
    const receiptId = params.receiptId ?? randomBytes(16);
    const receiptIdArray = Array.from(receiptId);

    const modelHash = sha256(params.modelId);
    const inputHash = hashInputs(params.inputs);
    const outputHash = hashInputs(params.outputs);

    const receiptAddress = this.findReceiptAddress(receiptId);

    const txSignature = await this.program.methods
      .issueReceipt(receiptIdArray, modelHash, inputHash, outputHash)
      .accounts({
        agent: this.agent,
        receipt: receiptAddress,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return {
      txSignature,
      receiptAddress,
      receiptId: Buffer.from(receiptId),
    };
  }

  /**
   * Fetch a receipt from on-chain by its PDA address.
   */
  async fetchReceipt(receiptAddress: PublicKey): Promise<Receipt> {
    const account = await this.program.account.computeReceipt.fetch(receiptAddress);

    return {
      address: receiptAddress,
      agent: account.agent as PublicKey,
      receiptId: account.receiptId as number[],
      modelHash: account.modelHash as number[],
      inputHash: account.inputHash as number[],
      outputHash: account.outputHash as number[],
      slot: (account.slot as any).toNumber(),
      receiptHash: account.receiptHash as number[],
      isValid: account.isValid as boolean,
    };
  }

  /**
   * Fetch a receipt by its receipt ID (derives PDA automatically).
   */
  async fetchReceiptById(receiptId: Buffer): Promise<Receipt> {
    const address = this.findReceiptAddress(receiptId);
    return this.fetchReceipt(address);
  }

  /**
   * Verify a receipt's integrity client-side (no on-chain call needed).
   * Recomputes the receipt hash and checks it matches.
   */
  verifyReceipt(receipt: Receipt): boolean {
    if (!receipt.isValid) return false;

    const data = Buffer.concat([
      receipt.agent.toBuffer(),
      Buffer.from(receipt.receiptId),
      Buffer.from(receipt.modelHash),
      Buffer.from(receipt.inputHash),
      Buffer.from(receipt.outputHash),
      Buffer.from(new anchor.BN(receipt.slot).toArray("le", 8)),
    ]);

    const computed = Array.from(createHash("sha256").update(data).digest());
    return (
      computed.length === receipt.receiptHash.length &&
      computed.every((v, i) => v === receipt.receiptHash[i])
    );
  }

  /**
   * Invalidate a receipt (only the original agent can do this).
   */
  async invalidateReceipt(receiptAddress: PublicKey): Promise<TransactionSignature> {
    return this.program.methods
      .invalidateReceipt()
      .accounts({
        agent: this.agent,
        receipt: receiptAddress,
      })
      .rpc();
  }

  /**
   * Fetch all receipts issued by this agent.
   */
  async fetchAllReceipts(): Promise<Receipt[]> {
    const accounts = await this.program.account.computeReceipt.all([
      {
        memcmp: {
          offset: 8, // after discriminator
          bytes: this.agent.toBase58(),
        },
      },
    ]);

    return accounts.map((a) => ({
      address: a.publicKey,
      agent: a.account.agent as PublicKey,
      receiptId: a.account.receiptId as number[],
      modelHash: a.account.modelHash as number[],
      inputHash: a.account.inputHash as number[],
      outputHash: a.account.outputHash as number[],
      slot: (a.account.slot as any).toNumber(),
      receiptHash: a.account.receiptHash as number[],
      isValid: a.account.isValid as boolean,
    }));
  }

  /**
   * Fetch all receipts for any agent by their public key.
   */
  async fetchReceiptsByAgent(agentPubkey: PublicKey): Promise<Receipt[]> {
    const accounts = await this.program.account.computeReceipt.all([
      {
        memcmp: {
          offset: 8,
          bytes: agentPubkey.toBase58(),
        },
      },
    ]);

    return accounts.map((a) => ({
      address: a.publicKey,
      agent: a.account.agent as PublicKey,
      receiptId: a.account.receiptId as number[],
      modelHash: a.account.modelHash as number[],
      inputHash: a.account.inputHash as number[],
      outputHash: a.account.outputHash as number[],
      slot: (a.account.slot as any).toNumber(),
      receiptHash: a.account.receiptHash as number[],
      isValid: a.account.isValid as boolean,
    }));
  }
}
