// Failed Payout Recovery (Question 2).
//
// A payout that was INITIATED can transition to a terminal status via an external
// gateway callback:
//   - SUCCESS   -> money confirmed sent; the ledger was already debited, nothing to do.
//   - FAILED / CANCELLED / REJECTED -> the money never reached the user, so we
//     credit the amount back into the withdrawable balance, letting them withdraw
//     again.
//
// Exactly-once guarantee: the reversal only fires while the payout is still
// INITIATED, and the transaction flips it to the terminal status in the same step.
// A duplicate callback therefore sees a non-INITIATED payout and is rejected, so
// the amount can never be credited back twice.

const prisma = require('../config/db');
const payoutRepository = require('../repositories/payoutRepository');
const ledgerRepository = require('../repositories/ledgerRepository');
const { PayoutStatus, LedgerType } = require('../domain/enums');
const { ValidationError, NotFoundError, ConflictError } = require('../domain/errors');

const TERMINAL_FAILURES = [
  PayoutStatus.FAILED,
  PayoutStatus.CANCELLED,
  PayoutStatus.REJECTED,
];

async function handlePayoutStatusUpdate(payoutId, newStatus) {
  // Accept status case-insensitively (e.g. "failed" -> "FAILED").
  const status = typeof newStatus === 'string' ? newStatus.toUpperCase() : newStatus;
  const allowed = [PayoutStatus.SUCCESS, ...TERMINAL_FAILURES];
  if (!allowed.includes(status)) {
    throw new ValidationError(`status must be one of: ${allowed.join(', ')}`);
  }

  return prisma.$transaction(async (tx) => {
    const payout = await payoutRepository.findById(Number(payoutId), tx);
    if (!payout) throw new NotFoundError('Payout not found');

    if (payout.status !== PayoutStatus.INITIATED) {
      throw new ConflictError(
        `Payout ${payout.id} is already in terminal state '${payout.status}'`,
      );
    }

    const updated = await payoutRepository.update(payout.id, { status }, tx);

    if (TERMINAL_FAILURES.includes(status)) {
      await ledgerRepository.create(
        {
          userId: payout.userId,
          amount: payout.amount, // positive: credit the debited amount back
          type: LedgerType.PAYOUT_REVERSAL,
          payoutId: payout.id,
        },
        tx,
      );
    }

    return updated;
  });
}

module.exports = { handlePayoutStatusUpdate };
