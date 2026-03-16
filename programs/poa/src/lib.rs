use anchor_lang::prelude::*;



declare_id!("A8wBefib1QpxPpkV7hrz4tRp49L6gxzDhWBQFcLmBVnv");

#[program]
pub mod poa {
    use super::*;

    pub fn issue_receipt(
        ctx: Context<IssueReceipt>,
        receipt_id: [u8; 16],
        model_hash: [u8; 32],
        input_hash: [u8; 32],
        output_hash: [u8; 32],
    ) -> Result<()> {
        let receipt = &mut ctx.accounts.receipt;
        let agent = ctx.accounts.agent.key();
        let slot = Clock::get()?.slot;

        receipt.agent = agent;
        receipt.receipt_id = receipt_id;
        receipt.model_hash = model_hash;
        receipt.input_hash = input_hash;
        receipt.output_hash = output_hash;
        receipt.slot = slot;
        receipt.is_valid = true;

        let mut data = Vec::with_capacity(152);
        data.extend_from_slice(agent.as_ref());
        data.extend_from_slice(&receipt_id);
        data.extend_from_slice(&model_hash);
        data.extend_from_slice(&input_hash);
        data.extend_from_slice(&output_hash);
        data.extend_from_slice(&slot.to_le_bytes());
        receipt.receipt_hash = solana_program::hash::hash(&data).to_bytes();

        emit!(ReceiptIssued {
            receipt_hash: receipt.receipt_hash,
            agent,
            model_hash,
            slot,
        });

        msg!("PoA: Receipt issued by {} at slot {}", agent, slot);
        Ok(())
    }

    pub fn verify_receipt(ctx: Context<VerifyReceipt>) -> Result<bool> {
        let receipt = &ctx.accounts.receipt;

        let mut data = Vec::with_capacity(152);
        data.extend_from_slice(receipt.agent.as_ref());
        data.extend_from_slice(&receipt.receipt_id);
        data.extend_from_slice(&receipt.model_hash);
        data.extend_from_slice(&receipt.input_hash);
        data.extend_from_slice(&receipt.output_hash);
        data.extend_from_slice(&receipt.slot.to_le_bytes());
        let computed_hash = solana_program::hash::hash(&data).to_bytes();

        let valid = receipt.is_valid && computed_hash == receipt.receipt_hash;
        msg!("PoA: Receipt valid = {}", valid);
        Ok(valid)
    }

    pub fn invalidate_receipt(ctx: Context<InvalidateReceipt>) -> Result<()> {
        let receipt = &mut ctx.accounts.receipt;
        receipt.is_valid = false;

        emit!(ReceiptInvalidated {
            receipt_hash: receipt.receipt_hash,
            agent: receipt.agent,
            slot: Clock::get()?.slot,
        });

        msg!("PoA: Receipt invalidated by {}", receipt.agent);
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct ComputeReceipt {
    pub agent: Pubkey,
    pub receipt_id: [u8; 16],
    pub model_hash: [u8; 32],
    pub input_hash: [u8; 32],
    pub output_hash: [u8; 32],
    pub slot: u64,
    pub receipt_hash: [u8; 32],
    pub is_valid: bool,
}

#[derive(Accounts)]
#[instruction(receipt_id: [u8; 16], model_hash: [u8; 32], input_hash: [u8; 32], output_hash: [u8; 32])]
pub struct IssueReceipt<'info> {
    #[account(mut)]
    pub agent: Signer<'info>,

    #[account(
        init,
        payer = agent,
        space = 8 + ComputeReceipt::INIT_SPACE,
        seeds = [
            b"receipt",
            agent.key().as_ref(),
            receipt_id.as_ref(),
        ],
        bump,
    )]
    pub receipt: Account<'info, ComputeReceipt>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VerifyReceipt<'info> {
    pub receipt: Account<'info, ComputeReceipt>,
}

#[derive(Accounts)]
pub struct InvalidateReceipt<'info> {
    #[account(mut)]
    pub agent: Signer<'info>,

    #[account(
        mut,
        constraint = receipt.agent == agent.key() @ PoaError::UnauthorizedInvalidation,
        constraint = receipt.is_valid @ PoaError::AlreadyInvalidated,
    )]
    pub receipt: Account<'info, ComputeReceipt>,
}

#[event]
pub struct ReceiptIssued {
    pub receipt_hash: [u8; 32],
    pub agent: Pubkey,
    pub model_hash: [u8; 32],
    pub slot: u64,
}

#[event]
pub struct ReceiptInvalidated {
    pub receipt_hash: [u8; 32],
    pub agent: Pubkey,
    pub slot: u64,
}

#[error_code]
pub enum PoaError {
    #[msg("Only the original agent can invalidate a receipt")]
    UnauthorizedInvalidation,
    #[msg("Receipt has already been invalidated")]
    AlreadyInvalidated,
}
