'use strict';

/**
 * In-memory, per-user loan store (data isolation layer).
 *
 * Shape: a Map of { userId -> loan record }. Keying by userId guarantees that
 * a user can only ever read back their own data: lookups are always scoped to
 * the authenticated userId, so cross-user access is structurally impossible.
 *
 * NOTE: This is intentionally non-persistent (prototype). It lives in a single
 * process and is cleared on restart. See the README for how to extend this
 * with a real persistence layer (DB) without changing the pricing logic.
 */

const store = new Map();

/**
 * Save (or overwrite) the latest loan record for a user.
 * The userId is stored inside the record too, so authorization checks can
 * explicitly compare `record.userId` against the requesting user.
 *
 * @param {string} userId
 * @param {object} loanData The decision + minimal request context to retain.
 * @returns {object} The stored record.
 */
function saveLoan(userId, loanData) {
  const record = {
    userId,
    ...loanData,
    updatedAt: new Date().toISOString(),
  };
  store.set(userId, record);
  return record;
}

/**
 * Fetch the loan record belonging to a user.
 * @param {string} userId
 * @returns {object|null}
 */
function getLoanByUser(userId) {
  return store.has(userId) ? store.get(userId) : null;
}

/** Test/maintenance helper: wipe the store. */
function clear() {
  store.clear();
}

module.exports = { saveLoan, getLoanByUser, clear };
