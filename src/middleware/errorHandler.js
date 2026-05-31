'use strict';

const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');

/**
 * 404 handler for unmatched routes.
 */
function notFoundHandler(req, res, next) {
  res.status(404).json({
    error: {
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    },
  });
}

/**
 * Centralized error handler.
 *
 * - Known operational errors (AppError) are returned with their status code
 *   and a safe message/details.
 * - Anything else is treated as an unexpected server error: we log it and
 *   return a generic 500 so internal details are never leaked to the client.
 *
 * Express identifies this as an error handler by its 4-arg signature.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError && err.isOperational) {
    const payload = { error: { message: err.message } };
    if (err.details) {
      payload.error.details = err.details;
    }
    return res.status(err.statusCode).json(payload);
  }

  // Unexpected error: log the full detail server-side, return a generic message.
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  return res.status(500).json({
    error: { message: 'Internal server error' },
  });
}

module.exports = { notFoundHandler, errorHandler };
