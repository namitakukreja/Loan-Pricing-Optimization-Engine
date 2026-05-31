'use strict';

const { UnauthorizedError } = require('../utils/errors');

/**
 * Mock authentication middleware.
 *
 * For this prototype, identity is asserted via the `x-user-id` request header
 * (a stand-in for a real auth token). In production this would be replaced by
 * verified JWT/session auth — see the README "Production improvements" section.
 *
 * Security notes:
 *  - The header value is treated as untrusted input: it is validated and
 *    sanitized to a safe identifier format before being used as a store key.
 *  - On success, the resolved id is attached as `req.userId` for downstream
 *    authorization and data-isolation checks.
 */

// Allow a conservative identifier shape only (letters, digits, _, -, .),
// bounded in length, to keep it safe as an in-memory store key.
const USER_ID_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

function authenticate(req, res, next) {
  const raw = req.headers['x-user-id'];

  if (typeof raw !== 'string' || raw.trim() === '') {
    return next(new UnauthorizedError('Missing x-user-id header'));
  }

  const userId = raw.trim();
  if (!USER_ID_PATTERN.test(userId)) {
    return next(new UnauthorizedError('Invalid x-user-id header'));
  }

  req.userId = userId;
  return next();
}

module.exports = authenticate;
