'use strict';

const config = require('../config');

const { THIN_FILE_MAX } = config.pricing.CREDIT_SCORE;

/**
 * Eligibility decision.
 *
 * Goal: do NOT reject solely on credit score. Combine credit score,
 * affordability, and collateral into a balanced decision.
 *
 * Logic:
 *   if creditScore < THIN_FILE_MAX (300):        // thin file / new to credit
 *     if NOT affordable AND no collateral -> reject
 *     else                                -> approve_high_risk
 *   else:                                          // has a usable bureau score
 *     if NOT affordable -> reject
 *     else              -> approve
 *
 * Rationale: a thin-file applicant can still be approved (as high risk) when
 * they are affordable OR can pledge collateral to offset the missing history.
 *
 * @param {object} params
 * @param {number} params.creditScore
 * @param {boolean} params.affordable Result of the affordability check.
 * @param {boolean} params.collateral Whether collateral is offered.
 * @returns {'approve'|'approve_high_risk'|'reject'}
 */
function decideEligibility({ creditScore, affordable, collateral }) {
  // Thin-file / new-to-credit applicants: don't auto-reject on score alone.
  if (creditScore < THIN_FILE_MAX) {
    if (!affordable && !collateral) {
      return 'reject';
    }
    return 'approve_high_risk';
  }

  // Applicants with a usable bureau score: decide purely on affordability.
  if (!affordable) {
    return 'reject';
  }
  return 'approve';
}

module.exports = { decideEligibility, THIN_FILE_MAX };
