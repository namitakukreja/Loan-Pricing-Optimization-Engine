'use strict';

const config = require('../config');

const { AFFORDABILITY_THRESHOLD } = config.pricing;

/**
 * Affordability check.
 *
 * A loan is considered affordable when the borrower's total monthly debt
 * obligation (the new EMI plus any existing EMIs) does not exceed a fixed
 * share of their income (default 40%).
 *
 *   affordable  <=>  (emi + existingEMI) <= AFFORDABILITY_THRESHOLD * income
 *
 * NOTE: `income` and `existingEMI` are treated as MONTHLY figures so that they
 * are directly comparable to the monthly EMI. See README assumptions.
 *
 * @param {object} params
 * @param {number} params.emi Proposed new monthly EMI.
 * @param {number} params.existingEMI Borrower's existing monthly EMI obligations.
 * @param {number} params.income Borrower's monthly income.
 * @returns {{ affordable: boolean, totalEMI: number, maxAllowedEMI: number, dtiRatio: number }}
 */
function checkAffordability({ emi, existingEMI, income }) {
  const totalEMI = round2(emi + existingEMI);
  const maxAllowedEMI = round2(AFFORDABILITY_THRESHOLD * income);

  // Debt-to-income ratio for the proposed obligation (useful for explanations).
  const dtiRatio = income > 0 ? round4(totalEMI / income) : Infinity;

  const affordable = totalEMI <= maxAllowedEMI;

  return { affordable, totalEMI, maxAllowedEMI, dtiRatio };
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function round4(value) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

module.exports = { checkAffordability, AFFORDABILITY_THRESHOLD };
