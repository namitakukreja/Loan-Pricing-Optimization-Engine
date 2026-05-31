'use strict';

const { postJson } = require('./httpClient');

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

/**
 * OpenAI Chat Completions provider.
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
    url: `${baseUrl}/chat/completions`,
    headers: {
      // API key comes from config (env), never hardcoded.
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: {
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    },
    timeoutMs: config.timeoutMs,
  });

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    throw new Error('OpenAI returned an empty completion');
  }
  return content.trim();
}

module.exports = { complete };
