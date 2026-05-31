'use strict';

/**
 * Centralized application configuration.
 *
 * All configuration is sourced from environment variables so that no secret
 * or environment-specific value is ever hardcoded in source. Sensible,
 * non-secret defaults are provided for local development only.
 */

/**
 * Business constants for the deterministic pricing engine.
 * Kept in config so the financial policy can be tuned without touching logic.
 */
const pricing = Object.freeze({
  // Base rate of interest (annual %) before any risk premium is applied.
  BASE_ROI: 8,

  // Risk premium (annual %) added on top of the base ROI per risk band.
  RISK_PREMIUM: Object.freeze({
    low: 1,
    medium: 3,
    high: 6,
  }),

  // Credit score thresholds used to derive the risk band and eligibility.
  CREDIT_SCORE: Object.freeze({
    LOW_RISK_MIN: 750, // strictly greater than 750 => low risk
    MEDIUM_RISK_MIN: 650, // 650..750 (inclusive) => medium risk; below => high risk
    THIN_FILE_MAX: 300, // score < 300 => thin file: collateral/affordability can rescue
    NEW_TO_CREDIT: 0, // sentinel: 0 means no credit history ("new to credit")
  }),

  // Affordability ceiling: total EMI obligations must not exceed this share
  // of income (expressed as a fraction, e.g. 0.4 === 40%).
  AFFORDABILITY_THRESHOLD: 0.4,
});

// LLM layer configuration.
// The explanation layer calls an external LLM wrapper purely to turn the
// deterministic decision into prose. The LLM is NEVER used for calculation
// (EMI / risk / eligibility are all computed deterministically).
const llm = Object.freeze({
  // HTTPS endpoint of the external LLM wrapper (override via env if needed).
  endpoint:
    process.env.LLM_ENDPOINT ||
    'https://llm-wrapper-741152993481.asia-south1.run.app',
  // Bearer token is read from the environment only; never hardcoded.
  // NOTE: read again at call-time in llmService so it can be rotated without
  // a restart; mirrored here for visibility.
  token: process.env.LLM_TOKEN || null,
  timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 8000,
});

// OPTIONAL alternative explanation layer (provider-based: OpenAI / Claude).
// This is NOT wired into the active flow — the live path is `services/llmService.js`
// (external wrapper). It is kept as a pluggable option; see `src/ai/` and the
// README "Optional provider-based AI layer" section.
const provider = (process.env.AI_PROVIDER || 'openai').toLowerCase();

const DEFAULT_MODELS = Object.freeze({
  openai: 'gpt-4o-mini',
  claude: 'claude-3-5-haiku-latest',
});

const ai = Object.freeze({
  provider,
  model: process.env.AI_MODEL || DEFAULT_MODELS[provider] || null,
  // Secret is read from the environment only; never hardcode it.
  apiKey: process.env.AI_API_KEY || null,
  baseUrl: process.env.AI_BASE_URL || null,
  timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 8000,
  maxTokens: Number(process.env.AI_MAX_TOKENS) || 300,
  temperature: Number(process.env.AI_TEMPERATURE) || 0.3,
  get enabled() {
    return Boolean(this.apiKey);
  },
});

const config = Object.freeze({
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  pricing,
  llm,
  ai,
});

module.exports = config;
