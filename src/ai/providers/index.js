'use strict';

const openaiProvider = require('./openaiProvider');
const claudeProvider = require('./claudeProvider');

/**
 * Provider registry / factory.
 *
 * Maps a provider name to its implementation. Each provider exposes the same
 * `complete({ systemPrompt, userPrompt, config })` interface, so the rest of
 * the AI layer is provider-agnostic.
 */
const PROVIDERS = {
  openai: openaiProvider,
  claude: claudeProvider,
  // 'anthropic' is a common alias for Claude.
  anthropic: claudeProvider,
};

/**
 * Resolve a provider by name.
 * @param {string} name
 * @returns {{ complete: Function }}
 */
function getProvider(name) {
  const provider = PROVIDERS[String(name).toLowerCase()];
  if (!provider) {
    throw new Error(`Unsupported AI provider: "${name}"`);
  }
  return provider;
}

module.exports = { getProvider };
