// All money is handled as integer paise (1 rupee = 100 paise). Working in the
// smallest currency unit means every arithmetic operation stays an exact
// integer, so we never hit floating-point errors like 0.1 + 0.2 !== 0.3.

const { ValidationError } = require('./errors');

const PAISE_PER_RUPEE = 100;
const ADVANCE_RATE_PERCENT = 10;

function rupeesToPaise(rupees) {
  if (typeof rupees !== 'number' || !Number.isFinite(rupees)) {
    throw new ValidationError('Amount must be a finite number of rupees');
  }
  return Math.round(rupees * PAISE_PER_RUPEE);
}

function paiseToRupees(paise) {
  return paise / PAISE_PER_RUPEE;
}

// Advance = 10% of earnings. We floor to the nearest paise so the platform never
// over-pays a fraction of a paise on a fractional percentage (e.g. 10% of ₹33.33).
function computeAdvancePaise(earningPaise) {
  return Math.floor((earningPaise * ADVANCE_RATE_PERCENT) / 100);
}

module.exports = {
  PAISE_PER_RUPEE,
  ADVANCE_RATE_PERCENT,
  rupeesToPaise,
  paiseToRupees,
  computeAdvancePaise,
};
