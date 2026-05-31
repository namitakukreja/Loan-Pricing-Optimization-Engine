'use strict';

/**
 * Application-level error types.
 *
 * Using typed errors lets the centralized error handler distinguish between
 * expected client errors (e.g. bad input) and unexpected server failures,
 * and respond with the correct HTTP status code without leaking internals.
 */

/** Base class for all known/operational errors raised by the app. */
class AppError extends Error {
  /**
   * @param {string} message Human-readable error message.
   * @param {number} statusCode HTTP status code to return.
   * @param {object} [details] Optional structured details (e.g. field errors).
   */
  constructor(message, statusCode, details) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = true; // distinguishes expected errors from bugs
    if (details !== undefined) {
      this.details = details;
    }
    Error.captureStackTrace(this, this.constructor);
  }
}

/** 400 - request failed validation. */
class ValidationError extends AppError {
  constructor(message, details) {
    super(message, 400, details);
  }
}

/** 401 - authentication missing or invalid. */
class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details) {
    super(message, 401, details);
  }
}

/** 403 - authenticated but not allowed to access the resource. */
class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details) {
    super(message, 403, details);
  }
}

/** 404 - resource not found. */
class NotFoundError extends AppError {
  constructor(message = 'Not found', details) {
    super(message, 404, details);
  }
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
};
