'use strict';

const config = require('../config');
const logger = require('../utils/logger');
const { getProvider } = require('./providers');
const { SYSTEM_PROMPT, buildUserPrompt } = require('./promptBuilder');

/**
 * OPTIONAL provider-based AI Explanation Layer (OpenAI / Claude).
 *
 * STATUS: kept as a pluggable alternative; NOT wired into the active request
 * flow. The live explanation path is `src/services/llmService.js` (external
 * LLM wrapper). To use this layer instead, import `generateExplanation` from
 * here in `loanService.js` and set the `AI_*` environment variables.
 *
 * HARD DESIGN BOUNDARIES (same as the active layer):
 *   1. Explanation-only: never computes or alters any financial number.
 *   2. At most one LLM call per request.
 *   3. Graceful deterministic fallback if the LLM is unconfigured/unavailable.
 *
 * @typedef {object} LoanDecision
 * @property {number} creditScore
 * @property {boolean} newToCredit Whether the borrower has no credit history.
 * @property {boolean} collateral Whether collateral is offered.
 * @property {'approve'|'approve_high_risk'|'reject'} decision Eligibility outcome.
 * @property {number} interestRate Final annual ROI (%).
 * @property {number} baseRoi Base ROI (%).
 * @property {number} riskPremium Risk premium added (%).
 * @property {'low'|'medium'|'high'} riskLevel
 * @property {number} emi Monthly EMI.
 * @property {boolean} affordable
 * @property {number} totalEMI emi + existingEMI.
 * @property {number} maxAllowedEMI Affordability ceiling.
 * @property {number} income Monthly income.
 * @property {number} existingEMI Existing monthly EMIs.
 * @property {number} loanAmount
 * @property {number} tenure Tenure in months.
 */

/**
 * Generate an explanation for a loan decision.
 * @param {LoanDecision} decision
 * @returns {Promise<string>}
 */
async function generateExplanation(decision) {
  // No key configured -> use the deterministic fallback (no network call).
  if (!config.ai.enabled) {
    return buildFallbackExplanation(decision);
  }

  try {
    const provider = getProvider(config.ai.provider);
    const userPrompt = buildUserPrompt(decision);

    // Single LLM call per request (performance constraint).
    const text = await provider.complete({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      config: config.ai,
    });

    return sanitizeExplanation(text);
  } catch (err) {
    logger.warn('AI explanation failed; using deterministic fallback', {
      provider: config.ai.provider,
      reason: err.message,
    });
    return buildFallbackExplanation(decision);
  }
}

/**
 * Defensive cleanup of model output (trim, collapse whitespace, cap length).
 * @param {string} text
 * @returns {string}
 */
function sanitizeExplanation(text) {
  const cleaned = String(text).replace(/\s+/g, ' ').trim();
  const MAX_LEN = 1200;
  return cleaned.length > MAX_LEN ? `${cleaned.slice(0, MAX_LEN)}…` : cleaned;
}

/**
 * Deterministic, dependency-free explanation used when the LLM is disabled or
 * unavailable. Mirrors the same facts the LLM is asked to explain.
 * @param {LoanDecision} d
 * @returns {string}
 */
function buildFallbackExplanation(d) {
  const creditSentence = d.newToCredit
    ? 'The borrower has no credit history (new to credit), so the decision is based on income and repayment capacity rather than past credit behaviour.'
    : `Based on a credit score of ${d.creditScore}, the borrower is rated ${d.riskLevel} risk, adding a ${d.riskPremium}% premium to the base rate of ${d.baseRoi}%.`;

  const rateSentence = `The final interest rate is ${d.interestRate}% for a loan of ${d.loanAmount} over ${d.tenure} months, giving a monthly EMI of ${d.emi}.`;

  const affordabilitySentence = d.affordable
    ? `The total monthly obligation of ${d.totalEMI} is within the allowed limit of ${d.maxAllowedEMI} (40% of income), so it is affordable.`
    : `The total monthly obligation of ${d.totalEMI} exceeds the allowed limit of ${d.maxAllowedEMI} (40% of income), so it is not affordable.`;

  let decisionSentence;
  if (d.decision === 'reject') {
    const reasons = [];
    if (!d.affordable) reasons.push('the loan is not affordable');
    if (d.creditScore < 300) reasons.push('the credit profile is very low or unestablished');
    const reasonText = reasons.length > 0 ? reasons.join(' and ') : 'eligibility criteria were not met';
    decisionSentence = `The application is rejected because ${reasonText}.`;
  } else if (d.decision === 'approve_high_risk') {
    const basis = d.affordable
      ? (d.collateral ? 'strong affordability and the collateral offered' : 'strong affordability')
      : 'the collateral offered';
    decisionSentence = `Despite a low or unestablished credit score, the application is approved as high risk based on ${basis}.`;
  } else {
    decisionSentence = 'The application is approved.';
  }

  return `${creditSentence} ${rateSentence} ${affordabilitySentence} ${decisionSentence}`;
}

module.exports = { generateExplanation };
