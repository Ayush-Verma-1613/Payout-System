// Advance payout job.
//
// For every eligible pending sale it transfers an advance of 10% of the earning.
// Idempotency is guaranteed on two levels:
//   1. The eligibility query filters out sales that already have advancePaidAt set.
//   2. Even under concurrent runs, the Payout.idempotencyKey unique constraint
//      ("advance:<saleId>") makes a duplicate insert fail with Prisma error P2002,
//      which we catch and treat as "already paid" -> skip.
//
// The advance is a pre-payment that is transferred immediately (status SUCCESS).
// It does NOT post to the withdrawable ledger; reconciliation is what settles the
// user's withdrawable balance and accounts for the advance already paid.

const prisma = require('../config/db');
const saleRepository = require('../repositories/saleRepository');
const payoutRepository = require('../repositories/payoutRepository');
const { computeAdvancePaise } = require('../domain/money');
const { PayoutType, PayoutStatus } = require('../domain/enums');

async function runAdvancePayouts(userId = null) {
  const eligible = await saleRepository.findEligibleForAdvance(userId);
  const result = { processed: 0, skipped: 0, totalAdvancePaise: 0, payouts: [] };

  for (const sale of eligible) {
    const advance = computeAdvancePaise(sale.earning);
    if (advance <= 0) {
      result.skipped += 1;
      continue;
    }

    try {
      const payout = await prisma.$transaction(async (tx) => {
        const created = await payoutRepository.create(
          {
            userId: sale.userId,
            type: PayoutType.ADVANCE,
            amount: advance,
            status: PayoutStatus.SUCCESS,
            saleId: sale.id,
            idempotencyKey: `advance:${sale.id}`,
          },
          tx,
        );
        await saleRepository.update(
          sale.id,
          { advanceAmount: advance, advancePaidAt: new Date() },
          tx,
        );
        return created;
      });

      result.processed += 1;
      result.totalAdvancePaise += advance;
      result.payouts.push(payout);
    } catch (err) {
      // P2002 = unique constraint violation on idempotencyKey => advance already paid.
      if (err.code === 'P2002') {
        result.skipped += 1;
        continue;
      }
      throw err;
    }
  }

  return result;
}

module.exports = { runAdvancePayouts };
