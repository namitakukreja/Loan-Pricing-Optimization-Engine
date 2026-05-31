'use strict';

const { priceLoan } = require('./pricingService');
const { calculateEMI } = require('./emiService');
const { checkAffordability } = require('./affordabilityService');
const { decideEligibility } = require('./eligibilityService');
const { generateExplanation } = require('./llmService');

/**
 * Orchestrates a full loan pricing + eligibility decision.
 *
 * Flow (deterministic first, AI last):
 *   1. Price the loan      -> risk level, risk premium, final interest rate.
 *   2. Calculate the EMI    -> using the amortization formula.
 *   3. Affordability check  -> compare total EMI against 40% of income.
 *   4. Eligibility decision -> combine credit score + affordability + collateral.
 *   5. AI explanation       -> turn the decision into prose (explanation-only).
 *
 * The borrower input is assumed to be already validated by the time it
 * reaches this service (see validation middleware).
 *
 * @param {object} profile Validated borrower profile.
 * @param {number} profile.creditScore
 * @param {number} profile.income Monthly income.
 * @param {number} profile.loanAmount Principal.
 * @param {number} profile.tenure Tenure in months.
 * @param {number} profile.existingEMI Existing monthly EMI obligations.
 * @param {boolean} profile.collateral Whether the loan is collateralized.
 * @returns {Promise<{interestRate:number, emi:number, affordable:boolean, riskLevel:string, decision:string, explanation:string}>}
 */
async function evaluateLoan(profile) {
  const { creditScore, income, loanAmount, tenure, existingEMI, collateral } = profile;

  // 1) Deterministic pricing.
  const { riskLevel, interestRate } = priceLoan(creditScore);

  // 2) EMI from the amortization formula.
  const emi = calculateEMI({
    principal: loanAmount,
    annualRatePercent: interestRate,
    tenureMonths: tenure,
  });

  // 3) Affordability.
  const { affordable } = checkAffordability({
    emi,
    existingEMI,
    income,
  });

  // 4) Eligibility: balanced decision, never rejecting on credit score alone.
  const decision = decideEligibility({ creditScore, affordable, collateral });

  // 5) LLM explanation (explanation-only; never alters the numbers above).
  //    Falls back to a deterministic message inside llmService on any failure.
  const explanation = await generateExplanation({
    creditScore,
    riskLevel,
    decision,
    affordable,
  });

  // Strict response contract.
  return {
    interestRate,
    emi,
    affordable,
    riskLevel,
    decision,
    explanation,
  };
}

module.exports = { evaluateLoan };
