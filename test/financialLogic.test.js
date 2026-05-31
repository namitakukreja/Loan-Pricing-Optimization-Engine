'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { getRiskLevel, priceLoan, isNewToCredit } = require('../src/services/pricingService');
const { calculateEMI } = require('../src/services/emiService');
const { checkAffordability } = require('../src/services/affordabilityService');
const { decideEligibility } = require('../src/services/eligibilityService');

test('risk level bands', () => {
  assert.equal(getRiskLevel(800), 'low');
  assert.equal(getRiskLevel(751), 'low');
  assert.equal(getRiskLevel(750), 'medium'); // 650..750 inclusive => medium
  assert.equal(getRiskLevel(650), 'medium');
  assert.equal(getRiskLevel(649), 'high');
  assert.equal(getRiskLevel(500), 'high');
});

test('pricing: base ROI + risk premium', () => {
  assert.deepEqual(priceLoan(800), { riskLevel: 'low', riskPremium: 1, interestRate: 9 });
  assert.deepEqual(priceLoan(700), { riskLevel: 'medium', riskPremium: 3, interestRate: 11 });
  assert.deepEqual(priceLoan(600), { riskLevel: 'high', riskPremium: 6, interestRate: 14 });
});

test('EMI matches amortization formula', () => {
  // P=100000, annual=12% => monthly r=0.01, n=12
  // Expected EMI ~ 8884.88
  const emi = calculateEMI({ principal: 100000, annualRatePercent: 12, tenureMonths: 12 });
  assert.ok(Math.abs(emi - 8884.88) < 0.05, `unexpected EMI: ${emi}`);
});

test('EMI handles zero interest gracefully', () => {
  const emi = calculateEMI({ principal: 12000, annualRatePercent: 0, tenureMonths: 12 });
  assert.equal(emi, 1000);
});

test('affordability check', () => {
  const ok = checkAffordability({ emi: 3000, existingEMI: 0, income: 10000 });
  assert.equal(ok.affordable, true);
  assert.equal(ok.maxAllowedEMI, 4000);

  const notOk = checkAffordability({ emi: 3000, existingEMI: 2000, income: 10000 });
  assert.equal(notOk.affordable, false);
  assert.equal(notOk.totalEMI, 5000);
});

test('new to credit detection (score === 0)', () => {
  assert.equal(isNewToCredit(0), true);
  assert.equal(isNewToCredit(700), false);
});

test('eligibility: usable bureau score decided by affordability', () => {
  assert.equal(decideEligibility({ creditScore: 800, affordable: true, collateral: false }), 'approve');
  assert.equal(decideEligibility({ creditScore: 800, affordable: false, collateral: true }), 'reject');
  assert.equal(decideEligibility({ creditScore: 600, affordable: true, collateral: false }), 'approve');
  assert.equal(decideEligibility({ creditScore: 600, affordable: false, collateral: false }), 'reject');
});

test('eligibility: thin file / new to credit (score < 300)', () => {
  // Not affordable AND no collateral -> reject
  assert.equal(decideEligibility({ creditScore: 0, affordable: false, collateral: false }), 'reject');
  // Not affordable BUT has collateral -> approve_high_risk (collateral rescue)
  assert.equal(decideEligibility({ creditScore: 0, affordable: false, collateral: true }), 'approve_high_risk');
  // Affordable -> approve_high_risk regardless of collateral
  assert.equal(decideEligibility({ creditScore: 0, affordable: true, collateral: false }), 'approve_high_risk');
  assert.equal(decideEligibility({ creditScore: 250, affordable: true, collateral: false }), 'approve_high_risk');
});
