const express = require('express');
const { DomainError } = require('./domain/errors');
const userController = require('./controllers/userController');
const saleController = require('./controllers/saleController');
const payoutController = require('./controllers/payoutController');

function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // Users
  app.post('/users', userController.createUser);

  // Sales
  app.post('/sales', saleController.createSale);
  app.get('/users/:userId/sales', saleController.listSales);
  app.post('/sales/:id/reconcile', saleController.reconcileSale);

  // Payouts & balance
  app.post('/jobs/advance-payout', payoutController.runAdvancePayout);
  app.get('/users/:id/balance', payoutController.getBalance);
  app.get('/users/:id/ledger', payoutController.getLedger);
  app.post('/users/:id/withdrawals', payoutController.initiateWithdrawal);
  app.post('/payouts/:id/status', payoutController.updatePayoutStatus);

  // 404 fallback
  app.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  // Centralized error handling: domain errors -> their status; unique-constraint
  // violations -> 409; everything else -> 500.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof DomainError) {
      return res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
    }
    if (err && err.code === 'P2002') {
      return res
        .status(409)
        .json({ error: { code: 'CONFLICT', message: 'Duplicate resource' } });
    }
    // eslint-disable-next-line no-console
    console.error(err);
    return res
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
  });

  return app;
}

module.exports = createApp;
