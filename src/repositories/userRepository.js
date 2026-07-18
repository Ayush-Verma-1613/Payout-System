// Thin data-access wrapper around the User table.
//
// Every method accepts an optional `client` so it works both standalone (using
// the shared Prisma singleton) and inside a `prisma.$transaction(tx => ...)`
// block, where the transactional client must be threaded through.

const prisma = require('../config/db');

module.exports = {
  create: (data, client = prisma) => client.user.create({ data }),
  findById: (id, client = prisma) => client.user.findUnique({ where: { id } }),
  findByEmail: (email, client = prisma) => client.user.findUnique({ where: { email } }),
};
