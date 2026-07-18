// HTTP-level smoke test that drives the full worked example through the REST API.

const request = require('supertest');
const createApp = require('../src/app');
const prisma = require('../src/config/db');

const app = createApp();

async function reset() {
  await prisma.ledgerEntry.deleteMany();
  await prisma.payout.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.user.deleteMany();
}

beforeEach(reset);
afterAll(async () => {
  await reset();
  await prisma.$disconnect();
});

test('full flow over HTTP yields a ₹68 balance', async () => {
  const userRes = await request(app)
    .post('/users')
    .send({ name: 'John Doe', email: 'john_doe@example.com' })
    .expect(201);
  const userId = userRes.body.id;

  const saleIds = [];
  for (let i = 0; i < 3; i += 1) {
    const res = await request(app)
      .post('/sales')
      .send({ userId, brand: 'brand_1', earning: 40 })
      .expect(201);
    saleIds.push(res.body.id);
  }

  const advanceRes = await request(app).post('/jobs/advance-payout').send({ userId }).expect(200);
  expect(advanceRes.body.totalAdvance.rupees).toBe(12);

  await request(app).post(`/sales/${saleIds[0]}/reconcile`).send({ status: 'rejected' }).expect(200);
  await request(app).post(`/sales/${saleIds[1]}/reconcile`).send({ status: 'approved' }).expect(200);
  await request(app).post(`/sales/${saleIds[2]}/reconcile`).send({ status: 'approved' }).expect(200);

  const balanceRes = await request(app).get(`/users/${userId}/balance`).expect(200);
  expect(balanceRes.body.withdrawableBalance.rupees).toBe(68);
});

test('failed payout over HTTP (lowercase status) credits the balance back', async () => {
  const userRes = await request(app)
    .post('/users')
    .send({ name: 'Rick', email: 'rick@example.com' })
    .expect(201);
  const userId = userRes.body.id;

  const saleRes = await request(app)
    .post('/sales')
    .send({ userId, brand: 'brand_1', earning: 40 })
    .expect(201);

  await request(app).post('/jobs/advance-payout').send({ userId }).expect(200);
  // Mixed-case status must be accepted.
  await request(app).post(`/sales/${saleRes.body.id}/reconcile`).send({ status: 'Approved' }).expect(200);

  const wd = await request(app).post(`/users/${userId}/withdrawals`).send({}).expect(201);
  expect((await request(app).get(`/users/${userId}/balance`)).body.withdrawableBalance.rupees).toBe(0);

  // Lowercase status must be accepted and trigger recovery.
  await request(app).post(`/payouts/${wd.body.id}/status`).send({ status: 'failed' }).expect(200);
  expect((await request(app).get(`/users/${userId}/balance`)).body.withdrawableBalance.rupees).toBe(36);
});

test('second withdrawal within 24h is rejected with 429', async () => {
  const userRes = await request(app)
    .post('/users')
    .send({ name: 'Jane', email: 'jane@example.com' })
    .expect(201);
  const userId = userRes.body.id;

  const saleRes = await request(app)
    .post('/sales')
    .send({ userId, brand: 'brand_1', earning: 40 })
    .expect(201);

  await request(app).post('/jobs/advance-payout').send({ userId }).expect(200);
  await request(app).post(`/sales/${saleRes.body.id}/reconcile`).send({ status: 'approved' }).expect(200);

  await request(app).post(`/users/${userId}/withdrawals`).send({ amount: 10 }).expect(201);
  await request(app).post(`/users/${userId}/withdrawals`).send({ amount: 5 }).expect(429);
});
