const prisma = require('../config/db');
const { SaleStatus } = require('../domain/enums');

module.exports = {
  create: (data, client = prisma) => client.sale.create({ data }),

  findById: (id, client = prisma) => client.sale.findUnique({ where: { id } }),

  listByUser: (userId, client = prisma) =>
    client.sale.findMany({ where: { userId }, orderBy: { id: 'asc' } }),

  // A sale is eligible for an advance only if it is still pending AND has never
  // been advanced (advancePaidAt is null). Passing userId scopes the job to one
  // user; passing null runs it across everyone.
  findEligibleForAdvance: (userId, client = prisma) =>
    client.sale.findMany({
      where: {
        ...(userId ? { userId } : {}),
        status: SaleStatus.PENDING,
        advancePaidAt: null,
      },
      orderBy: { id: 'asc' },
    }),

  update: (id, data, client = prisma) => client.sale.update({ where: { id }, data }),
};
