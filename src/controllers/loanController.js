'use strict';

const { evaluateLoan } = require('../services/loanService');
const { saveLoan, getLoanByUser } = require('../store/loanStore');
const { UnauthorizedError, NotFoundError, ForbiddenError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * POST /loan
 *
 * Evaluates a borrower profile, persists the decision against the authenticated
 * user, and returns it. Thin HTTP adapter: business logic lives in services.
 *
 * Privacy: we deliberately do NOT log the request body or any sensitive field
 * (credit score, income, loan amount, EMI). Only the userId is logged.
 */
async function postLoan(req, res, next) {
  try {
    // `req.userId` is set by the auth middleware; guard defensively.
    if (!req.userId) {
      return next(new UnauthorizedError('Missing authenticated user'));
    }

    // req.body has already been validated & sanitized by middleware.
    const decision = await evaluateLoan(req.body);

    // Data isolation: store the decision keyed by the authenticated user.
    saveLoan(req.userId, { decision });

    // Sensitive-data-safe log line (no financial fields).
    logger.info('loan processed for user', { userId: req.userId });

    return res.status(200).json(decision);
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /query
 *
 * Returns the stored loan decision for the authenticated user. Enforces
 * authorization: a user can only ever read back their own data.
 */
async function postQuery(req, res, next) {
  try {
    if (!req.userId) {
      return next(new UnauthorizedError('Missing authenticated user'));
    }

    const record = getLoanByUser(req.userId);
    if (!record) {
      return next(new NotFoundError('No loan found for this user'));
    }

    // Defense-in-depth: explicitly assert ownership, even though the store is
    // already keyed by userId. (Matches: if stored.userId !== request.userId -> deny.)
    if (record.userId !== req.userId) {
      return next(new ForbiddenError('You are not allowed to access this loan'));
    }

    logger.info('loan retrieved for user', { userId: req.userId });

    return res.status(200).json({
      userId: record.userId,
      updatedAt: record.updatedAt,
      loan: record.decision,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { postLoan, postQuery };
