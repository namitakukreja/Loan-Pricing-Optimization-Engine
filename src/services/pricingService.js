'use strict';

const config = require('../config');

/**
 * Deterministic loan pricing logic.
 *
 * This module owns the risk/pricing policy. It is 100% deterministic and must
 * NOT call any LLM/AI service — the AI layer is only ever used to *explain*
 * the numbers produced here, never to compute them.
 */

const { BASE_ROI, RISK_PREMIUM, CREDIT_SCORE } = config.pricing;

/**
 * Derive the risk band from a credit score.
 *
 *   credit score > 750        -> low risk
 *   650 <= credit score <= 750 -> medium risk
 *   credit score < 650        -> high risk
 *
 * @param {number} creditScore
 * @returns {'low'|'medium'|'high'}
 */
function getRiskLevel(creditScore) {
  if (creditScore > CREDIT_SCORE.LOW_RISK_MIN) {
    return 'low';
  }
  if (creditScore >= CREDIT_SCORE.MEDIUM_RISK_MIN) {
    return 'medium';
  }
  return 'high';
}

/**
 * Map a risk band to its risk premium (annual %).
 * @param {'low'|'medium'|'high'} riskLevel
 * @returns {number}
 */
function getRiskPremium(riskLevel) {
  return RISK_PREMIUM[riskLevel];
}

/**
 * Whether the applicant has no credit history.
 * A credit score of 0 is the sentinel for "new to credit".
 * @param {number} creditScore
 * @returns {boolean}
 */
function isNewToCredit(creditScore) {
  return creditScore === CREDIT_SCORE.NEW_TO_CREDIT;
}

/**
 * Compute the final annual rate of interest (ROI).
 *
 *   final ROI = base ROI + risk premium
 *
 * @param {number} creditScore
 * @returns {{ riskLevel: 'low'|'medium'|'high', riskPremium: number, interestRate: number }}
 */
function priceLoan(creditScore) {
  const riskLevel = getRiskLevel(creditScore);
  const riskPremium = getRiskPremium(riskLevel);
  const interestRate = round2(BASE_ROI + riskPremium);

  return { riskLevel, riskPremium, interestRate };
}

/** Round to 2 decimal places. */
function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

module.exports = { getRiskLevel, getRiskPremium, priceLoan, isNewToCredit, BASE_ROI };
