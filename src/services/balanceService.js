// The withdrawable balance is derived, never stored: it is the signed sum of all
// ledger entries for the user. This keeps a single source of truth and makes
// every balance fully explainable from the ledger audit trail.

const ledgerRepository = require('../repositories/ledgerRepository');

async function getWithdrawableBalance(userId, client) {
  return ledgerRepository.sumByUser(userId, client);
}

module.exports = { getWithdrawableBalance };
