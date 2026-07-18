const asyncHandler = require('../utils/asyncHandler');
const saleService = require('../services/saleService');
const reconciliationService = require('../services/reconciliationService');
const present = require('../utils/presenter');

const createSale = asyncHandler(async (req, res) => {
  const sale = await saleService.createSale(req.body || {});
  res.status(201).json(present.sale(sale));
});

const listSales = asyncHandler(async (req, res) => {
  const sales = await saleService.listSales(req.params.userId);
  res.json(sales.map(present.sale));
});

const reconcileSale = asyncHandler(async (req, res) => {
  const sale = await reconciliationService.reconcile(req.params.id, (req.body || {}).status);
  res.json(present.sale(sale));
});

module.exports = { createSale, listSales, reconcileSale };
