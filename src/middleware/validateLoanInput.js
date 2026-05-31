'use strict';

const { ValidationError } = require('../utils/errors');

/**
 * Validation + sanitization for the POST /loan request body.
 *
 * Security rule: ALL external input must be validated and sanitized before it
 * is used in any logic. We build a brand-new, typed object containing only the
 * known fields (whitelist) and reject anything malformed. This also prevents
 * prototype-pollution style payloads from flowing into business logic.
 */

/**
 * Schema describing every accepted field and its constraints.
 *  - `min`          : inclusive lower bound (value >= min)
 *  - `exclusiveMin` : strict lower bound   (value >  exclusiveMin)
 *  - `max`          : inclusive upper bound (value <= max)
 */
const FIELD_SPECS = [
  // Credit score: 0 means "new to credit" (no history); otherwise a bureau
  // score up to 900. Scores below 300 are treated as thin-file in eligibility.
  { key: 'creditScore', type: 'number', min: 0, max: 900, integer: true },
  // income > 0
  { key: 'income', type: 'number', exclusiveMin: 0 },
  // loanAmount > 0
  { key: 'loanAmount', type: 'number', exclusiveMin: 0 },
  // tenure > 0 (months); capped to a sane maximum.
  { key: 'tenure', type: 'number', exclusiveMin: 0, max: 600, integer: true },
  // existingEMI >= 0 (a borrower may legitimately have no existing EMIs).
  { key: 'existingEMI', type: 'number', min: 0 },
  { key: 'collateral', type: 'boolean' },
];

/**
 * Validate a single field value against its spec.
 * @returns {string|null} an error message, or null if valid.
 */
function validateField(spec, value) {
  if (value === undefined || value === null) {
    return `"${spec.key}" is required`;
  }

  if (spec.type === 'number') {
    // Reject NaN, Infinity, numeric strings, etc. Must be a real finite number.
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return `"${spec.key}" must be a finite number`;
    }
    if (spec.integer && !Number.isInteger(value)) {
      return `"${spec.key}" must be an integer`;
    }
    if (spec.min !== undefined && value < spec.min) {
      return `"${spec.key}" must be >= ${spec.min}`;
    }
    if (spec.exclusiveMin !== undefined && value <= spec.exclusiveMin) {
      return `"${spec.key}" must be > ${spec.exclusiveMin}`;
    }
    if (spec.max !== undefined && value > spec.max) {
      return `"${spec.key}" must be <= ${spec.max}`;
    }
    return null;
  }

  if (spec.type === 'boolean') {
    if (typeof value !== 'boolean') {
      return `"${spec.key}" must be a boolean`;
    }
    return null;
  }

  return `"${spec.key}" has an unsupported type`;
}

/**
 * Express middleware: validates and sanitizes req.body, replacing it with a
 * clean whitelisted object on success.
 */
function validateLoanInput(req, res, next) {
  const body = req.body;

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return next(new ValidationError('Request body must be a JSON object'));
  }

  const errors = [];
  const sanitized = {};

  for (const spec of FIELD_SPECS) {
    // Use Object.prototype.hasOwnProperty.call to avoid inherited/polluted props.
    const value = Object.prototype.hasOwnProperty.call(body, spec.key)
      ? body[spec.key]
      : undefined;

    const message = validateField(spec, value);
    if (message) {
      errors.push(message);
    } else {
      sanitized[spec.key] = value;
    }
  }

  if (errors.length > 0) {
    return next(new ValidationError('Invalid loan request', { errors }));
  }

  // Replace the body with the sanitized, whitelisted version.
  req.body = sanitized;
  return next();
}

module.exports = validateLoanInput;
