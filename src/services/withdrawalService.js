// Initiates a withdrawal against the user's withdrawable balance.
//
// Rules enforced (all inside one transaction so concurrent requests are safe):
//   - Only one withdrawal per user per 24 hours (counting withdrawals that are
//     still INITIATED or already SUCCESS; failed/reversed ones do not count).
//   - Amount defaults to the full available balance, or a caller-specified
//     amount that must be > 0 and <= the available balance.
//
// Initiating a withdrawal immediately debits the ledger (the money is considered
// reserved / sent). If the downstream payout later fails, payoutRecoveryService
// credits it back.

const prisma = require('../config/db');
const userRepository = require('../repositories/userRepository');
const payoutRepository = require('../repositories/payoutRepository');
const ledgerRepository = require('../repositories/ledgerRepository');
const { rupeesToPaise } = require('../domain/money');
const { PayoutType, PayoutStatus, LedgerType } = require('../domain/enums');
const {
  ValidationError,
  NotFoundError,
  InsufficientBalanceError,
  RateLimitError,
} = require('../domain/errors');

const WITHDRAWAL_WINDOW_MS = 24 * 60 * 60 * 1000;

async function initiateWithdrawal(userId, requestedRupees = null) {
  return prisma.$transaction(async (tx) => {
    const user = await userRepository.findById(Number(userId), tx);
    if (!user) throw new NotFoundError('User not found');

    // 24-hour withdrawal restriction.
    const since = new Date(Date.now() - WITHDRAWAL_WINDOW_MS);
    const recent = await payoutRepository.findRecentWithdrawal(
      user.id,
      since,
      [PayoutStatus.INITIATED, PayoutStatus.SUCCESS],
      tx,
    );
    if (recent) {
      const nextAllowedAt = new Date(recent.createdAt.getTime() + WITHDRAWAL_WINDOW_MS);
      throw new RateLimitError(
        `Only one withdrawal is allowed every 24 hours. Next withdrawal allowed at ${nextAllowedAt.toISOString()}`,
      );
    }

    const balance = await ledgerRepository.sumByUser(user.id, tx);
    if (balance <= 0) {
      throw new InsufficientBalanceError('No withdrawable balance available');
    }

    let amountPaise = balance; // default: withdraw everything available
    if (requestedRupees != null) {
      if (typeof requestedRupees !== 'number' || requestedRupees <= 0) {
        throw new ValidationError('amount must be a positive number (in rupees)');
      }
      amountPaise = rupeesToPaise(requestedRupees);
      if (amountPaise > balance) {
        throw new InsufficientBalanceError('Requested amount exceeds withdrawable balance');
      }
    }

    const payout = await payoutRepository.create(
      {
        userId: user.id,
        type: PayoutType.WITHDRAWAL,
        amount: amountPaise,
        status: PayoutStatus.INITIATED,
        idempotencyKey: `withdrawal:${user.id}:${Date.now()}`,
      },
      tx,
    );

    await ledgerRepository.create(
      {
        userId: user.id,
        amount: -amountPaise,
        type: LedgerType.WITHDRAWAL_DEBIT,
        payoutId: payout.id,
      },
      tx,
    );

    return payout;
  });
}

module.exports = { initiateWithdrawal, WITHDRAWAL_WINDOW_MS };
