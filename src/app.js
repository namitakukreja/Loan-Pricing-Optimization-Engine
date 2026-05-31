'use strict';

const express = require('express');
const helmet = require('helmet');

const loanRoutes = require('./routes/loanRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

/**
 * Builds and configures the Express application.
 * Kept separate from the server bootstrap so it can be imported in tests
 * without binding to a network port.
 */
function createApp() {
  const app = express();

  // Security headers (secure-by-default HTTP responses).
  app.use(helmet());

  // Parse JSON bodies with a sane size limit to mitigate large-payload abuse.
  app.use(express.json({ limit: '10kb' }));

  // Liveness/readiness probe.
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Feature routes.
  app.use('/', loanRoutes);

  // 404 + centralized error handling (must be registered last).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
