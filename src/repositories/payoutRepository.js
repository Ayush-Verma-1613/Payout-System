const prisma = require('../config/db');
const { PayoutType } = require('../domain/enums');

module.exports = {
  create: (data, client = prisma) => client.payout.create({ data }),

  findById: (id, client = prisma) => client.payout.findUnique({ where: { id } }),

  update: (id, data, client = prisma) => client.payout.update({ where: { id }, data }),

  // Most recent withdrawal for a user in the given statuses since `since`.
  // Used to enforce the "one withdrawal per 24 hours" rule.
  findRecentWithdrawal: (userId, since, statuses, client = prisma) =>
    client.payout.findFirst({
      where: {
        userId,
        type: PayoutType.WITHDRAWAL,
        status: { in: statuses },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
    }),
};
