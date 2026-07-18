// Reconciliation settles a pending sale into the user's withdrawable balance.
//
//   Approved: the user keeps the full earning, but they were already advanced
//             `advance`, so only the remainder becomes newly withdrawable:
//                 ledger += (earning - advance)
//
//   Rejected: the sale does not count. The user already received `advance` they
//             were not entitled to, so it is clawed back:
//                 ledger += (-advance)
//
// The whole operation runs in a transaction and is guarded against double
// reconciliation by the sale's `reconciledAt` timestamp.

const prisma = require('../config/db');
const saleRepository = require('../repositories/saleRepository');
const ledgerRepository = require('../repositories/ledgerRepository');
const { SaleStatus, LedgerType } = require('../domain/enums');
const { ValidationError, NotFoundError, ConflictError } = require('../domain/errors');

async function reconcile(saleId, rawStatus) {
  // Accept status case-insensitively (e.g. "Approved" -> "approved").
  const status = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : rawStatus;
  if (![SaleStatus.APPROVED, SaleStatus.REJECTED].includes(status)) {
    throw new ValidationError(
      `status must be '${SaleStatus.APPROVED}' or '${SaleStatus.REJECTED}'`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const sale = await saleRepository.findById(Number(saleId), tx);
    if (!sale) throw new NotFoundError('Sale not found');

    if (sale.status !== SaleStatus.PENDING || sale.reconciledAt) {
      throw new ConflictError(`Sale ${sale.id} has already been reconciled`);
    }

    const advance = sale.advanceAmount || 0;

    let amount;
    let type;
    if (status === SaleStatus.APPROVED) {
      amount = sale.earning - advance;
      type = LedgerType.RECONCILE_APPROVED;
    } else {
      amount = -advance;
      type = LedgerType.RECONCILE_REJECTED;
    }

    // A zero adjustment (e.g. a rejected sale that never received an advance)
    // needs no ledger row.
    if (amount !== 0) {
      await ledgerRepository.create(
        { userId: sale.userId, amount, type, saleId: sale.id },
        tx,
      );
    }

    return saleRepository.update(
      sale.id,
      { status, reconciledAt: new Date() },
      tx,
    );
  });
}

module.exports = { reconcile };
