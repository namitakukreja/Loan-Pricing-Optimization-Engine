'use strict';

const { createApp } = require('./app');
const config = require('./config');
const logger = require('./utils/logger');

/**
 * Server bootstrap: starts the HTTP listener and wires up graceful shutdown.
 */
const app = createApp();

const server = app.listen(config.port, () => {
  logger.info('Loan pricing engine started', {
    port: config.port,
    env: config.env,
  });
});

/** Gracefully drain connections on termination signals. */
function shutdown(signal) {
  logger.info('Shutting down', { signal });
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });

  // Force-exit if connections don't drain in time.
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = server;
