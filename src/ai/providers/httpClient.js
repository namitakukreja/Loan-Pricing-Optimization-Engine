'use strict';

/**
 * Tiny HTTPS JSON client for LLM provider calls.
 *
 * - Enforces HTTPS only (secure rule: no plaintext HTTP for remote calls).
 * - Applies a hard request timeout via AbortController so a slow provider can
 *   never block the request indefinitely.
 */

/**
 * @param {object} params
 * @param {string} params.url Absolute HTTPS endpoint.
 * @param {object} params.headers Request headers (incl. auth).
 * @param {object} params.body JSON-serializable request body.
 * @param {number} params.timeoutMs Abort after this many ms.
 * @returns {Promise<object>} Parsed JSON response.
 */
async function postJson({ url, headers, body, timeoutMs }) {
  if (!/^https:\/\//i.test(url)) {
    // Secure rule #7: always use HTTPS for remote calls.
    throw new Error('LLM provider URL must use HTTPS');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      // Read the error body for diagnostics but keep it server-side only.
      const text = await safeReadText(res);
      throw new Error(`LLM provider responded ${res.status}: ${truncate(text, 500)}`);
    }

    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function safeReadText(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function truncate(str, max) {
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

module.exports = { postJson };
