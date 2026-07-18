// Central definitions of every status/type string used across the system.
// Keeping these in one place avoids typos leaking into the database.

const SaleStatus = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

const PayoutType = Object.freeze({
  ADVANCE: 'ADVANCE',
  WITHDRAWAL: 'WITHDRAWAL',
});

const PayoutStatus = Object.freeze({
  INITIATED: 'INITIATED',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
});

// Reasons a signed amount was written to the ledger.
const LedgerType = Object.freeze({
  RECONCILE_APPROVED: 'RECONCILE_APPROVED', // + (earning - advance)
  RECONCILE_REJECTED: 'RECONCILE_REJECTED', // - advance (claw back)
  WITHDRAWAL_DEBIT: 'WITHDRAWAL_DEBIT', // - amount withdrawn
  PAYOUT_REVERSAL: 'PAYOUT_REVERSAL', // + amount credited back after a failed payout
});

module.exports = { SaleStatus, PayoutType, PayoutStatus, LedgerType };
