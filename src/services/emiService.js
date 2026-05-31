'use strict';

/**
 * EMI (Equated Monthly Installment) calculation.
 *
 * Standard amortization formula:
 *
 *     EMI = P * r * (1 + r)^n / ((1 + r)^n - 1)
 *
 * where:
 *   P = principal (loan amount)
 *   r = monthly interest rate (annual rate / 12 / 100)
 *   n = number of monthly installments (loan tenure in months)
 */

/**
 * Convert an annual rate of interest (in %) to a per-month decimal rate.
 * @param {number} annualRatePercent e.g. 11 for 11%
 * @returns {number} monthly rate as a decimal, e.g. 0.009166...
 */
function monthlyRateFromAnnual(annualRatePercent) {
  return annualRatePercent / 12 / 100;
}

/**
 * Calculate the EMI for a loan.
 *
 * @param {object} params
 * @param {number} params.principal Loan amount (P), > 0.
 * @param {number} params.annualRatePercent Final annual ROI in % (e.g. 9 for 9%).
 * @param {number} params.tenureMonths Number of monthly installments (n), > 0.
 * @returns {number} EMI rounded to 2 decimal places.
 */
function calculateEMI({ principal, annualRatePercent, tenureMonths }) {
  const r = monthlyRateFromAnnual(annualRatePercent);
  const n = tenureMonths;

  // Edge case: a zero interest rate would make the standard formula divide by
  // zero, so fall back to simple equal principal repayment.
  if (r === 0) {
    return round2(principal / n);
  }

  const compound = Math.pow(1 + r, n); // (1 + r)^n
  const emi = (principal * r * compound) / (compound - 1);

  return round2(emi);
}

/** Round to 2 decimal places (currency precision). */
function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

module.exports = { calculateEMI, monthlyRateFromAnnual };
