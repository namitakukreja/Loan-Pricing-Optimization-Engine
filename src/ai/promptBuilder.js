'use strict';

/**
 * Prompt construction for the OPTIONAL provider-based explanation layer.
 *
 * The prompt is built ONLY from the already-computed deterministic decision.
 * The model is explicitly instructed not to recompute or change any number —
 * it must only explain the provided values. This keeps pricing auditable.
 */

const SYSTEM_PROMPT = [
  'You are a lending assistant who explains loan pricing and eligibility decisions to borrowers.',
  'Explain in simple, transparent, user-friendly terms why this borrower received this interest rate and decision.',
  'Always mention: the credit score impact, the affordability result (income vs EMI), and the risk level.',
  'Decision-specific guidance:',
  '- If the decision is "reject", clearly state it was due to affordability and/or a very low credit score.',
  '- If the decision is "approve_high_risk", mention the low credit score but explain the approval was possible due to affordability and/or collateral.',
  '- If the borrower is new to credit (no credit history), say: the decision is based on income and repayment capacity rather than credit history.',
  'Be concise (2-4 sentences). Use a neutral, helpful tone.',
  'Do NOT invent, recompute, or change any numbers — use only the figures provided.',
  'Do NOT give financial advice or promises; only explain the decision.',
].join(' ');

/**
 * Build the user prompt from a loan decision.
 *
 * @param {object} d Decision data (all values already computed deterministically).
 * @returns {string}
 */
function buildUserPrompt(d) {
  // Present the facts as a clean, labelled list so the model has no ambiguity.
  const lines = [
    'Explain in simple terms why this borrower received this rate of interest (ROI) and decision.',
    'Mention credit score impact, affordability, and risk. Here are the facts:',
    '',
    `- Credit score: ${d.creditScore}${d.newToCredit ? ' (NEW TO CREDIT — no credit history)' : ''}`,
    `- Risk level: ${d.riskLevel} (this added a ${d.riskPremium}% premium to the ${d.baseRoi}% base rate)`,
    `- Final interest rate (ROI): ${d.interestRate}% per annum`,
    `- Loan amount: ${d.loanAmount} over ${d.tenure} months`,
    `- Monthly EMI for this loan: ${d.emi}`,
    `- Borrower monthly income: ${d.income}`,
    `- Existing monthly EMIs: ${d.existingEMI}`,
    `- Total monthly obligation (this EMI + existing): ${d.totalEMI}`,
    `- Affordability limit (40% of income): ${d.maxAllowedEMI}`,
    `- Affordability result: ${d.affordable ? 'AFFORDABLE' : 'NOT AFFORDABLE'}`,
    `- Collateral offered: ${d.collateral ? 'YES' : 'NO'}`,
    `- Final decision: ${d.decision}`,
  ];
  return lines.join('\n');
}

module.exports = { SYSTEM_PROMPT, buildUserPrompt };
