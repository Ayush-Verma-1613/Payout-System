// Converts internal entities (money in paise) into API responses that expose both
// the exact paise value and a human-friendly rupee value.

const { paiseToRupees } = require('../domain/money');

const money = (paise) =>
  paise == null ? null : { paise, rupees: paiseToRupees(paise) };

const sale = (s) => ({
  id: s.id,
  userId: s.userId,
  brand: s.brand,
  status: s.status,
  earning: money(s.earning),
  advance: money(s.advanceAmount),
  advancePaidAt: s.advancePaidAt,
  reconciledAt: s.reconciledAt,
  createdAt: s.createdAt,
});

const payout = (p) => ({
  id: p.id,
  userId: p.userId,
  type: p.type,
  status: p.status,
  amount: money(p.amount),
  saleId: p.saleId,
  idempotencyKey: p.idempotencyKey,
  createdAt: p.createdAt,
});

const ledgerEntry = (e) => ({
  id: e.id,
  userId: e.userId,
  type: e.type,
  amount: money(e.amount),
  saleId: e.saleId,
  payoutId: e.payoutId,
  createdAt: e.createdAt,
});

module.exports = { money, sale, payout, ledgerEntry };
