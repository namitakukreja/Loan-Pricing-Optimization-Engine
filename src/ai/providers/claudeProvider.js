'use strict';

const { postJson } = require('./httpClient');

const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Anthropic Claude Messages provider.
 *
 * @param {object} params
 * @param {string} params.systemPrompt
 * @param {string} params.userPrompt
 * @param {object} params.config Resolved `config.ai`.
 * @returns {Promise<string>} The model's text response.
 */
async function complete({ systemPrompt, userPrompt, config }) {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;

  const data = await postJson({
    url: `${baseUrl}/messages`,
    headers: {
      // API key comes from config (env), never hardcoded.
      'x-api-key': config.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: {
      model: config.model,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    },
    timeoutMs: config.timeoutMs,
  });

  // Claude returns an array of content blocks; concatenate the text blocks.
  const text = Array.isArray(data?.content)
    ? data.content
        .filter((block) => block?.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('')
        .trim()
    : '';

  if (text === '') {
    throw new Error('Claude returned an empty completion');
  }
  return text;
}

module.exports = { complete };
