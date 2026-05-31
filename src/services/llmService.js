'use strict';

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * LLM integration service.
 *
 * Talks to an external LLM wrapper over HTTPS. This service is used ONLY to
 * generate natural-language explanations — never for EMI, risk, or eligibility
 * calculations (those are fully deterministic elsewhere).
 */

// Fallback explanation returned whenever the LLM cannot be used (no token,
// network/HTTP error, timeout, or an unexpected response shape).
const FALLBACK_EXPLANATION =
  'Loan decision was made based on credit score, risk level and repayment capacity.';

/**
 * Reusable LLM call.
 *
 * Makes a POST to the configured endpoint with `{ prompt }` in the body and a
 * Bearer token (read from `process.env.LLM_TOKEN`). Returns ONLY `resp.data`.
 *
 * @param {string} prompt The prompt to send.
 * @returns {Promise<*>} The raw `response.data` from the LLM wrapper.
 * @throws {Error} If the token is missing or the request fails.
 */
async function callLLM(prompt) {
  // Secret is read from the environment at call-time; never hardcoded/logged.
  const token = process.env.LLM_TOKEN;
  if (!token) {
    throw new Error('LLM_TOKEN is not configured');
  }

  try {
    const response = await axios.post(
      config.llm.endpoint,
      { prompt },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        timeout: config.llm.timeoutMs,
      }
    );

    // Per contract: return only the response data.
    return response.data;
  } catch (err) {
    // Log a safe, non-sensitive summary (never the token or request body).
    logger.error('LLM request failed', {
      status: err.response ? err.response.status : undefined,
      code: err.code,
      message: err.message,
    });
    throw new Error(`LLM request failed: ${err.message}`);
  }
}

/**
 * Generate a borrower-facing explanation for a loan decision.
 *
 * @param {object} data
 * @param {number} data.creditScore
 * @param {'low'|'medium'|'high'} data.riskLevel
 * @param {'approve'|'approve_high_risk'|'reject'} data.decision
 * @param {boolean} data.affordable
 * @returns {Promise<string>} The explanation text (or the fallback on failure).
 */
async function generateExplanation(data) {
  const prompt = buildPrompt(data);

  try {
    const result = await callLLM(prompt);
    const text = extractText(result);
    return text || FALLBACK_EXPLANATION;
  } catch (err) {
    // Never fail the loan request because the explanation is unavailable.
    logger.warn('Explanation generation failed; using fallback', {
      reason: err.message,
    });
    return FALLBACK_EXPLANATION;
  }
}

/**
 * Build the explanation prompt from the decision data.
 * @param {object} data
 * @returns {string}
 */
function buildPrompt(data) {
  const { creditScore, riskLevel, decision, affordable } = data;
  const newToCredit = creditScore === 0;

  return [
    'Explain in simple, transparent and user-friendly terms why this borrower received this loan decision.',
    'Mention the credit score impact, the risk level, affordability (repayment capacity) and the final decision.',
    newToCredit
      ? 'The borrower is new to credit (no credit history), so note that the decision is based on income and repayment capacity rather than credit history.'
      : '',
    decision === 'reject'
      ? 'The application was rejected — explain it was due to affordability and/or a very low credit score.'
      : '',
    decision === 'approve_high_risk'
      ? 'The application was approved as high risk — mention the low credit score but that approval was possible due to affordability and/or collateral.'
      : '',
    'Keep it concise (2-3 sentences). Do not invent numbers.',
    '',
    'Decision data:',
    `- Credit score: ${creditScore}`,
    `- Risk level: ${riskLevel}`,
    `- Affordable: ${affordable ? 'yes' : 'no'}`,
    `- Decision: ${decision}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Best-effort extraction of a text explanation from the wrapper's response.
 * Handles a plain string or common object shapes; returns '' if none found.
 * @param {*} data
 * @returns {string}
 */
function extractText(data) {
  if (typeof data === 'string') {
    return data.trim();
  }
  if (data && typeof data === 'object') {
    const candidate =
      data.explanation || data.response || data.text || data.output || data.message || data.result;
    if (typeof candidate === 'string') {
      return candidate.trim();
    }
  }
  return '';
}

module.exports = { callLLM, generateExplanation, FALLBACK_EXPLANATION };
