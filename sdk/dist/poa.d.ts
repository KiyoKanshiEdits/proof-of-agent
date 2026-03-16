import { Connection, PublicKey, Keypair, TransactionSignature } from "@solana/web3.js";
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
export declare class PoA {
    private program;
    private provider;
    private agentKeypair;
    programId: PublicKey;
    constructor(config: PoAConfig);
    /** The agent's public key */
    get agent(): PublicKey;
    /** Derive the PDA for a receipt given a receipt ID */
    findReceiptAddress(receiptId: Buffer): PublicKey;
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
    issueReceipt(params: IssueReceiptParams): Promise<IssueResult>;
    /**
     * Fetch a receipt from on-chain by its PDA address.
     */
    fetchReceipt(receiptAddress: PublicKey): Promise<Receipt>;
    /**
     * Fetch a receipt by its receipt ID (derives PDA automatically).
     */
    fetchReceiptById(receiptId: Buffer): Promise<Receipt>;
    /**
     * Verify a receipt's integrity client-side (no on-chain call needed).
     * Recomputes the receipt hash and checks it matches.
     */
    verifyReceipt(receipt: Receipt): boolean;
    /**
     * Invalidate a receipt (only the original agent can do this).
     */
    invalidateReceipt(receiptAddress: PublicKey): Promise<TransactionSignature>;
    /**
     * Fetch all receipts issued by this agent.
     */
    fetchAllReceipts(): Promise<Receipt[]>;
    /**
     * Fetch all receipts for any agent by their public key.
     */
    fetchReceiptsByAgent(agentPubkey: PublicKey): Promise<Receipt[]>;
}
//# sourceMappingURL=poa.d.ts.map