// Creates and lists sales. A sale always enters the system as `pending`.
// The API accepts earnings in rupees (matching the reference data) and we
// convert to integer paise at this boundary.

const saleRepository = require('../repositories/saleRepository');
const userRepository = require('../repositories/userRepository');
const { rupeesToPaise } = require('../domain/money');
const { SaleStatus } = require('../domain/enums');
const { ValidationError, NotFoundError } = require('../domain/errors');

async function createSale({ userId, brand, earning }) {
  if (userId == null || !brand || earning == null) {
    throw new ValidationError('userId, brand and earning are required');
  }
  if (typeof earning !== 'number' || earning <= 0) {
    throw new ValidationError('earning must be a positive number (in rupees)');
  }

  const user = await userRepository.findById(Number(userId));
  if (!user) throw new NotFoundError('User not found');

  return saleRepository.create({
    userId: user.id,
    brand,
    earning: rupeesToPaise(earning),
    status: SaleStatus.PENDING,
  });
}

async function listSales(userId) {
  return saleRepository.listByUser(Number(userId));
}

module.exports = { createSale, listSales };
