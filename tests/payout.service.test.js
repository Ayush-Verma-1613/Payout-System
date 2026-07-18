// End-to-end domain tests exercised through the service layer.
// These prove the assignment's worked example and every core business rule.

const prisma = require('../src/config/db');
const saleService = require('../src/services/saleService');
const advancePayoutService = require('../src/services/advancePayoutService');
const reconciliationService = require('../src/services/reconciliationService');
const withdrawalService = require('../src/services/withdrawalService');
const payoutRecoveryService = require('../src/services/payoutRecoveryService');
const balanceService = require('../src/services/balanceService');
const { SaleStatus, PayoutStatus } = require('../src/domain/enums');

async function reset() {
  await prisma.ledgerEntry.deleteMany();
  await prisma.payout.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.user.deleteMany();
}

function makeUser(email = 'john_doe@example.com') {
  return prisma.user.create({ data: { name: 'John Doe', email } });
}

beforeEach(reset);
afterAll(async () => {
  await reset();
  await prisma.$disconnect();
});

test('reproduces the assignment worked example: final payout = ₹68', async () => {
  const user = await makeUser();
  const s1 = await saleService.createSale({ userId: user.id, brand: 'brand_1', earning: 40 });
  const s2 = await saleService.createSale({ userId: user.id, brand: 'brand_1', earning: 40 });
  const s3 = await saleService.createSale({ userId: user.id, brand: 'brand_1', earning: 40 });

  const advance = await advancePayoutService.runAdvancePayouts(user.id);
  expect(advance.processed).toBe(3);
  expect(advance.totalAdvancePaise).toBe(1200); // 10% of ₹120 = ₹12

  await reconciliationService.reconcile(s1.id, SaleStatus.REJECTED); // -₹4
  await reconciliationService.reconcile(s2.id, SaleStatus.APPROVED); // +₹36
  await reconciliationService.reconcile(s3.id, SaleStatus.APPROVED); // +₹36

  const balance = await balanceService.getWithdrawableBalance(user.id);
  expect(balance).toBe(6800); // ₹68
});

test('advance payout is idempotent across repeated job runs', async () => {
  const user = await makeUser();
  const s1 = await saleService.createSale({ userId: user.id, brand: 'brand_1', earning: 40 });

  const first = await advancePayoutService.runAdvancePayouts(user.id);
  const second = await advancePayoutService.runAdvancePayouts(user.id);
  const third = await advancePayoutService.runAdvancePayouts(user.id);

  expect(first.processed).toBe(1);
  expect(second.processed).toBe(0);
  expect(third.processed).toBe(0);

  const payouts = await prisma.payout.findMany({
    where: { saleId: s1.id, type: 'ADVANCE' },
  });
  expect(payouts).toHaveLength(1); // never a second advance for the same sale
});

test('rejected sale claws back the advance as a negative adjustment', async () => {
  const user = await makeUser();
  const s1 = await saleService.createSale({ userId: user.id, brand: 'brand_1', earning: 50 });
  await advancePayoutService.runAdvancePayouts(user.id); // advance = ₹5
  await reconciliationService.reconcile(s1.id, SaleStatus.REJECTED);

  const balance = await balanceService.getWithdrawableBalance(user.id);
  expect(balance).toBe(-500); // -₹5
});

test('a sale cannot be reconciled twice', async () => {
  const user = await makeUser();
  const s1 = await saleService.createSale({ userId: user.id, brand: 'brand_1', earning: 40 });
  await advancePayoutService.runAdvancePayouts(user.id);
  await reconciliationService.reconcile(s1.id, SaleStatus.APPROVED);

  await expect(
    reconciliationService.reconcile(s1.id, SaleStatus.REJECTED),
  ).rejects.toThrow(/already been reconciled/);
});

test('only one withdrawal is allowed per 24 hours', async () => {
  const user = await makeUser();
  const s1 = await saleService.createSale({ userId: user.id, brand: 'brand_1', earning: 40 });
  await advancePayoutService.runAdvancePayouts(user.id);
  await reconciliationService.reconcile(s1.id, SaleStatus.APPROVED); // +₹36

  await withdrawalService.initiateWithdrawal(user.id, 10); // ₹10
  await expect(withdrawalService.initiateWithdrawal(user.id, 5)).rejects.toThrow(/24 hours/);
});

test('withdrawal cannot exceed the withdrawable balance', async () => {
  const user = await makeUser();
  const s1 = await saleService.createSale({ userId: user.id, brand: 'brand_1', earning: 40 });
  await advancePayoutService.runAdvancePayouts(user.id);
  await reconciliationService.reconcile(s1.id, SaleStatus.APPROVED); // +₹36

  await expect(withdrawalService.initiateWithdrawal(user.id, 100)).rejects.toThrow(
    /exceeds withdrawable balance/,
  );
});

test('failed payout is credited back and re-withdrawal is allowed (Q2 recovery)', async () => {
  const user = await makeUser();
  const s1 = await saleService.createSale({ userId: user.id, brand: 'brand_1', earning: 40 });
  await advancePayoutService.runAdvancePayouts(user.id);
  await reconciliationService.reconcile(s1.id, SaleStatus.APPROVED); // +₹36

  const before = await balanceService.getWithdrawableBalance(user.id); // 3600
  const payout = await withdrawalService.initiateWithdrawal(user.id); // debits full balance
  expect(await balanceService.getWithdrawableBalance(user.id)).toBe(0);

  await payoutRecoveryService.handlePayoutStatusUpdate(payout.id, PayoutStatus.FAILED);
  expect(await balanceService.getWithdrawableBalance(user.id)).toBe(before); // restored

  // The user can withdraw again (the failed withdrawal does not count for the 24h rule).
  const retry = await withdrawalService.initiateWithdrawal(user.id);
  expect(retry.status).toBe(PayoutStatus.INITIATED);
});

test('a payout can only be moved out of INITIATED once (reversal is exactly-once)', async () => {
  const user = await makeUser();
  const s1 = await saleService.createSale({ userId: user.id, brand: 'brand_1', earning: 40 });
  await advancePayoutService.runAdvancePayouts(user.id);
  await reconciliationService.reconcile(s1.id, SaleStatus.APPROVED);

  const payout = await withdrawalService.initiateWithdrawal(user.id);
  await payoutRecoveryService.handlePayoutStatusUpdate(payout.id, PayoutStatus.FAILED);

  await expect(
    payoutRecoveryService.handlePayoutStatusUpdate(payout.id, PayoutStatus.FAILED),
  ).rejects.toThrow(/terminal state/);
});
