const asyncHandler = require('../utils/asyncHandler');
const advancePayoutService = require('../services/advancePayoutService');
const withdrawalService = require('../services/withdrawalService');
const payoutRecoveryService = require('../services/payoutRecoveryService');
const balanceService = require('../services/balanceService');
const ledgerRepository = require('../repositories/ledgerRepository');
const present = require('../utils/presenter');

// POST /jobs/advance-payout  { userId? }
const runAdvancePayout = asyncHandler(async (req, res) => {
  const userId = (req.body || {}).userId != null ? Number(req.body.userId) : null;
  const result = await advancePayoutService.runAdvancePayouts(userId);
  res.json({
    processed: result.processed,
    skipped: result.skipped,
    totalAdvance: present.money(result.totalAdvancePaise),
    payouts: result.payouts.map(present.payout),
  });
});

// POST /users/:id/withdrawals  { amount? }
const initiateWithdrawal = asyncHandler(async (req, res) => {
  const amount = (req.body || {}).amount != null ? Number(req.body.amount) : null;
  const payout = await withdrawalService.initiateWithdrawal(req.params.id, amount);
  res.status(201).json(present.payout(payout));
});

// POST /payouts/:id/status  { status }
const updatePayoutStatus = asyncHandler(async (req, res) => {
  const payout = await payoutRecoveryService.handlePayoutStatusUpdate(
    req.params.id,
    (req.body || {}).status,
  );
  res.json(present.payout(payout));
});

// GET /users/:id/balance
const getBalance = asyncHandler(async (req, res) => {
  const userId = Number(req.params.id);
  const paise = await balanceService.getWithdrawableBalance(userId);
  res.json({ userId, withdrawableBalance: present.money(paise) });
});

// GET /users/:id/ledger
const getLedger = asyncHandler(async (req, res) => {
  const entries = await ledgerRepository.listByUser(Number(req.params.id));
  res.json(entries.map(present.ledgerEntry));
});

module.exports = {
  runAdvancePayout,
  initiateWithdrawal,
  updatePayoutStatus,
  getBalance,
  getLedger,
};
