"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PoA = void 0;
const anchor = __importStar(require("@coral-xyz/anchor"));
const anchor_1 = require("@coral-xyz/anchor");
const web3_js_1 = require("@solana/web3.js");
const crypto_1 = require("crypto");
const poa_json_1 = __importDefault(require("./idl/poa.json"));
const PROGRAM_ID = new web3_js_1.PublicKey("A8wBefib1QpxPpkV7hrz4tRp49L6gxzDhWBQFcLmBVnv");
// ── Helpers ────────────────────────────────────────────────────────
function sha256(data) {
    return Array.from((0, crypto_1.createHash)("sha256").update(data).digest());
}
function hashInputs(inputs) {
    return sha256(JSON.stringify(inputs));
}
// ── SDK Class ──────────────────────────────────────────────────────
class PoA {
    constructor(config) {
        this.agentKeypair = config.agentKeypair;
        this.programId = config.programId ?? PROGRAM_ID;
        const wallet = new anchor_1.Wallet(this.agentKeypair);
        this.provider = new anchor_1.AnchorProvider(config.connection, wallet, {
            commitment: "confirmed",
        });
        this.program = new anchor_1.Program(poa_json_1.default, this.provider);
    }
    /** The agent's public key */
    get agent() {
        return this.agentKeypair.publicKey;
    }
    /** Derive the PDA for a receipt given a receipt ID */
    findReceiptAddress(receiptId) {
        const [pda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("receipt"), this.agent.toBuffer(), receiptId], this.programId);
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
    async issueReceipt(params) {
        const receiptId = params.receiptId ?? (0, crypto_1.randomBytes)(16);
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
            systemProgram: web3_js_1.SystemProgram.programId,
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
    async fetchReceipt(receiptAddress) {
        const account = await this.program.account.computeReceipt.fetch(receiptAddress);
        return {
            address: receiptAddress,
            agent: account.agent,
            receiptId: account.receiptId,
            modelHash: account.modelHash,
            inputHash: account.inputHash,
            outputHash: account.outputHash,
            slot: account.slot.toNumber(),
            receiptHash: account.receiptHash,
            isValid: account.isValid,
        };
    }
    /**
     * Fetch a receipt by its receipt ID (derives PDA automatically).
     */
    async fetchReceiptById(receiptId) {
        const address = this.findReceiptAddress(receiptId);
        return this.fetchReceipt(address);
    }
    /**
     * Verify a receipt's integrity client-side (no on-chain call needed).
     * Recomputes the receipt hash and checks it matches.
     */
    verifyReceipt(receipt) {
        if (!receipt.isValid)
            return false;
        const data = Buffer.concat([
            receipt.agent.toBuffer(),
            Buffer.from(receipt.receiptId),
            Buffer.from(receipt.modelHash),
            Buffer.from(receipt.inputHash),
            Buffer.from(receipt.outputHash),
            Buffer.from(new anchor.BN(receipt.slot).toArray("le", 8)),
        ]);
        const computed = Array.from((0, crypto_1.createHash)("sha256").update(data).digest());
        return (computed.length === receipt.receiptHash.length &&
            computed.every((v, i) => v === receipt.receiptHash[i]));
    }
    /**
     * Invalidate a receipt (only the original agent can do this).
     */
    async invalidateReceipt(receiptAddress) {
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
    async fetchAllReceipts() {
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
            agent: a.account.agent,
            receiptId: a.account.receiptId,
            modelHash: a.account.modelHash,
            inputHash: a.account.inputHash,
            outputHash: a.account.outputHash,
            slot: a.account.slot.toNumber(),
            receiptHash: a.account.receiptHash,
            isValid: a.account.isValid,
        }));
    }
    /**
     * Fetch all receipts for any agent by their public key.
     */
    async fetchReceiptsByAgent(agentPubkey) {
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
            agent: a.account.agent,
            receiptId: a.account.receiptId,
            modelHash: a.account.modelHash,
            inputHash: a.account.inputHash,
            outputHash: a.account.outputHash,
            slot: a.account.slot.toNumber(),
            receiptHash: a.account.receiptHash,
            isValid: a.account.isValid,
        }));
    }
}
exports.PoA = PoA;
//# sourceMappingURL=poa.js.map