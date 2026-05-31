'use strict';

/**
 * Minimal structured logger.
 *
 * Kept dependency-free for the POC. It emits single-line JSON so logs are
 * easy to ingest, and it never logs request bodies to avoid leaking PII or
 * other sensitive borrower data (secure logging rule).
 */

function write(level, message, meta) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  if (meta && typeof meta === 'object') {
    Object.assign(entry, meta);
  }
  const line = JSON.stringify(entry);
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

module.exports = {
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
};
