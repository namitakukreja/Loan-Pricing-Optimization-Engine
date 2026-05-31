'use strict';

const express = require('express');
const authenticate = require('../middleware/auth');
const validateLoanInput = require('../middleware/validateLoanInput');
const { postLoan, postQuery } = require('../controllers/loanController');

const router = express.Router();

/**
 * All routes below are protected. The middleware chain is applied per-route:
 *   authenticate  -> resolves & attaches req.userId (401 if missing/invalid)
 *   validate...   -> validates & sanitizes the request body where applicable
 */

/**
 * POST /loan
 * Evaluate a borrower profile, store it for the user, and return the decision.
 */
router.post('/loan', authenticate, validateLoanInput, postLoan);

/**
 * POST /query
 * Return the authenticated user's previously stored loan decision.
 */
router.post('/query', authenticate, postQuery);

module.exports = router;
