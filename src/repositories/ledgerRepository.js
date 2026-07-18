const prisma = require('../config/db');
const { LedgerType } = require('../domain/enums');

module.exports = {
  create: (data, client = prisma) => client.ledgerEntry.create({ data }),

  // The withdrawable balance is simply the signed sum of a user's ledger entries.
  sumByUser: async (userId, client = prisma) => {
    const result = await client.ledgerEntry.aggregate({
      where: { userId },
      _sum: { amount: true },
    });
    return result._sum.amount || 0;
  },

  listByUser: (userId, client = prisma) =>
    client.ledgerEntry.findMany({ where: { userId }, orderBy: { id: 'asc' } }),

  // Used to guarantee a failed payout is reversed at most once.
  findReversal: (payoutId, client = prisma) =>
    client.ledgerEntry.findFirst({
      where: { payoutId, type: LedgerType.PAYOUT_REVERSAL },
    }),
};
