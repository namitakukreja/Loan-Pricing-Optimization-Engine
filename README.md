# AI-Assisted Loan Pricing Engine

A production-ready Node.js (Express) service that recommends a **personalized interest rate** for a borrower based on risk, affordability, and basic financial logic — and returns a **clear, AI-generated explanation** of the decision.

The design enforces a hard boundary between two layers:

| Layer | Responsibility | Uses LLM? |
|-------|----------------|-----------|
| **Deterministic financial layer** | Computes risk premium, interest rate, EMI, affordability | No — pure, testable math |
| **AI explanation layer** | Turns the computed decision into human-readable prose | Yes (explanation only) |

> The AI layer never computes or alters any number. It only explains the deterministic result. This keeps pricing auditable and reproducible.

---

## Architecture

```
AI_POC/
├── src/
│   ├── server.js                # HTTP bootstrap + graceful shutdown
│   ├── app.js                   # Express app wiring (middleware, routes)
│   ├── config/
│   │   └── index.js             # Env-driven config + business constants
│   ├── routes/                  # API routes
│   │   └── loanRoutes.js        # POST /loan, POST /query (both protected)
│   ├── controllers/
│   │   └── loanController.js    # Thin HTTP adapter (evaluate, store, query)
│   ├── services/                # Pricing logic, EMI, affordability, eligibility, LLM
│   │   ├── loanService.js       # Orchestrates the full decision
│   │   ├── pricingService.js    # Risk band + risk premium + final ROI
│   │   ├── emiService.js        # EMI (amortization formula)
│   │   ├── affordabilityService.js
│   │   ├── eligibilityService.js  # Combined approve / approve_high_risk / reject
│   │   └── llmService.js          # External LLM call + generateExplanation + fallback (ACTIVE)
│   ├── store/
│   │   └── loanStore.js         # In-memory per-user store (data isolation)
│   ├── ai/                      # OPTIONAL provider-based explanation layer (NOT wired in)
│   │   ├── explanationService.js  # generateExplanation via provider + fallback
│   │   ├── promptBuilder.js       # System + user prompt from the decision
│   │   └── providers/             # Provider-agnostic LLM clients
│   │       ├── index.js           # Provider factory (openai | claude)
│   │       ├── openaiProvider.js  # OpenAI Chat Completions
│   │       ├── claudeProvider.js  # Anthropic Claude Messages
│   │       └── httpClient.js      # HTTPS-only JSON client w/ timeout
│   ├── middleware/
│   │   ├── auth.js              # Mock auth: extracts userId from x-user-id
│   │   ├── validateLoanInput.js # Input validation + sanitization
│   │   └── errorHandler.js      # 404 + centralized error handling
│   └── utils/
│       ├── errors.js            # Typed errors (Validation/Unauthorized/Forbidden/NotFound)
│       └── logger.js            # Minimal structured JSON logger (no sensitive data)
├── test/
│   └── financialLogic.test.js   # Unit tests for deterministic logic
├── prompt.md                    # Prompts used to build this project
├── .env.example
└── package.json
```

### Request flow

```
POST /loan
   │
   ▼
authenticate (x-user-id -> req.userId; 401 if missing/invalid)
   │
   ▼
validateLoanInput (whitelist + type/range checks, sanitization)
   │
   ▼
loanController.postLoan
   │
   ▼
loanService.evaluateLoan
   ├── 1. pricingService.priceLoan       → riskLevel, riskPremium, interestRate
   ├── 2. emiService.calculateEMI         → emi
   ├── 3. affordabilityService.check      → affordable
   ├── 4. eligibilityService.decide       → decision (combines score+afford.+collateral)
   └── 5. llmService.generateExplanation  → explanation (external LLM)
   │
   ▼
loanStore.saveLoan(userId, decision)   (data isolation, keyed by user)
   │
   ▼
log "loan processed for user" (userId only)  →  Strict JSON response

POST /query
   │
   ▼
authenticate → loanController.postQuery → loanStore.getLoanByUser(userId)
            → ownership check → user's own stored decision
```

---

## Business logic

> **Design principle:** applicants are **not** rejected on credit score alone.
> The final decision combines credit score, affordability, and collateral.

### 1. Credit score handling & risk level

| Credit score | Meaning | Risk level | Risk premium |
|--------------|---------|-----------|--------------|
| `0`          | new to credit (no history) | high | +6% |
| `< 650`      | high risk | high | +6% |
| `650 – 750`  | medium risk | medium | +3% |
| `> 750`      | low risk | low | +1% |

A score of `0` is a sentinel for **new to credit** — there is no history, so the
decision is driven by income and repayment capacity (and collateral). Scores
below `300` are treated as a **thin file** in the eligibility step (see below).

### 2. Interest rate

```
final ROI = base ROI (8%) + risk premium
```

### 3. EMI (Equated Monthly Installment)

```
EMI = P · r · (1 + r)^n / ((1 + r)^n − 1)

P = loan amount
r = monthly interest rate = final ROI / 12 / 100
n = tenure (in months)
```

A zero-rate edge case falls back to `P / n` to avoid division by zero.

### 4. Affordability

```
affordable  ⇔  (EMI + existingEMI) ≤ 40% × income
```

### 5. Risk tag

`low` / `medium` / `high`, derived from the credit score as above.

### 6. Eligibility decision (balanced)

The decision combines credit score, affordability, and collateral:

```
if creditScore < 300:                 # thin file / new to credit
    if NOT affordable AND no collateral -> reject
    else                                -> approve_high_risk
else:                                  # usable bureau score
    if NOT affordable -> reject
    else              -> approve
```

| `decision` value | When |
|------------------|------|
| `approve`            | Usable score (`≥ 300`) **and** affordable |
| `approve_high_risk`  | Thin file (`< 300`) that is affordable **or** offers collateral |
| `reject`             | Not affordable (with a usable score), or thin file that is neither affordable nor collateralized |

This ensures a low/no credit score does not, by itself, cause a rejection: a
thin-file applicant can still be approved (as high risk) on the strength of
affordability or collateral.

---

## LLM explanation layer

The LLM layer (`src/services/llmService.js`) turns the **already-computed**
decision into a short, transparent, user-friendly explanation by calling an
**external LLM wrapper API**. It is strictly explanation-only:

- **No LLM in calculation.** Risk, interest rate, EMI, affordability and the
  eligibility decision are all computed deterministically *before* the LLM runs.
  The LLM only describes the result.
- **One call per request.** `generateExplanation(data)` makes a single POST to
  the wrapper — no retries or multi-step chains.
- **Graceful fallback.** If `LLM_TOKEN` is missing, or the call errors/times out,
  or the response can't be parsed, the service returns a fixed fallback string so
  the API always responds with a valid `explanation`. The request never fails
  because of the LLM.

### External API contract

`callLLM(prompt)` (reusable, `axios`, `async/await`):

```
POST  https://llm-wrapper-741152993481.asia-south1.run.app/llm/query
Headers:
  Content-Type:  application/json
  Authorization: Bearer <LLM_TOKEN>           # read from process.env.LLM_TOKEN
Body:
  { "prompt": "<string>" }
```

`callLLM` returns only `response.data` (the wrapper replies with
`{ "response": "...", "usage": {...}, "latency": ... }`, so the explanation text
is taken from `response`). On any error it logs a safe summary (never the token
or body) and throws.

### `generateExplanation(data)`

Takes `data = { creditScore, riskLevel, decision, affordable }`, builds a prompt
and calls `callLLM`. On failure it returns the fallback:

> "Loan decision was made based on credit score, risk level and repayment capacity."

The prompt is decision-aware: it asks the model to explain the credit-score
impact, risk level, affordability and final decision; to note "new to credit"
(score `0`) decisions are based on income/repayment capacity; and to frame
`reject` (affordability / very low credit) and `approve_high_risk` (low score but
approved via affordability/collateral) appropriately.

### Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `LLM_TOKEN` | _(empty)_ | Bearer token for the wrapper. **Empty ⇒ fallback.** |
| `LLM_ENDPOINT` | provided wrapper URL | Override the endpoint (HTTPS) |
| `LLM_TIMEOUT_MS` | `8000` | Hard timeout per LLM call |

Secrets are read **only** from environment variables and are never logged.

### Optional provider-based AI layer (kept, not wired in)

In addition to the active wrapper-based layer above, the project keeps an
**alternative, provider-based explanation layer** under `src/ai/` that talks
directly to **OpenAI** or **Claude**. It is intentionally **not used** by the
current request flow — it is preserved as a pluggable option so the explanation
backend can be swapped without rewriting the orchestration.

- **Same contract & guarantees:** explanation-only, one call per request, and a
  deterministic decision-aware fallback (`reject` / `approve_high_risk` /
  new-to-credit wording).
- **How to switch to it:** in `src/services/loanService.js`, import
  `generateExplanation` from `../ai/explanationService` instead of `./llmService`
  (its fallback works with the richer decision object, so pass the full decision
  data), then set the `AI_*` environment variables (`AI_PROVIDER`, `AI_API_KEY`,
  `AI_MODEL`, …). See `.env.example`.
- **Files:** `src/ai/explanationService.js`, `src/ai/promptBuilder.js`, and the
  provider clients in `src/ai/providers/` (OpenAI, Claude, shared HTTPS client).

| Env var | Default | Purpose |
|---------|---------|---------|
| `AI_PROVIDER` | `openai` | `openai` or `claude` (alias `anthropic`) |
| `AI_MODEL` | `gpt-4o-mini` / `claude-3-5-haiku-latest` | Model id |
| `AI_API_KEY` | _(empty)_ | Provider secret. **Empty ⇒ deterministic fallback.** |
| `AI_BASE_URL` | provider default | Override for proxy/gateway (HTTPS only) |
| `AI_TIMEOUT_MS` | `8000` | Hard timeout per provider call |
| `AI_MAX_TOKENS` | `300` | Keeps the explanation concise |
| `AI_TEMPERATURE` | `0.3` | Low temperature for consistent explanations |

---

## API

> All loan endpoints are **protected**. Every request must include an
> `x-user-id` header identifying the caller (mock auth). Requests without it
> receive `401 Unauthorized`.

### `POST /loan`

**Headers**

```
x-user-id: alice
Content-Type: application/json
```

**Request body**

```json
{
  "creditScore": 780,
  "income": 90000,
  "loanAmount": 500000,
  "tenure": 60,
  "existingEMI": 10000,
  "collateral": true
}
```

**Response (strict format)**

```json
{
  "interestRate": 9,
  "emi": 10379.99,
  "affordable": true,
  "riskLevel": "low",
  "decision": "approve",
  "explanation": "Based on a credit score of 780, the borrower is rated low risk, adding a 1% premium to the base rate of 8%. The final interest rate is 9% for a loan of 500000 over 60 months, giving a monthly EMI of 10379.99. The total monthly obligation of 20379.99 is within the allowed limit of 36000 (40% of income), so it is affordable. The application is approved."
}
```

`decision` is one of `approve` | `approve_high_risk` | `reject`.

> When `LLM_TOKEN` is configured, `explanation` is generated by the external LLM. Without a token (or on any LLM error/timeout), the fallback string `"Loan decision was made based on credit score, risk level and repayment capacity."` is returned, so the API contract is always satisfied.

**Example — new to credit, approved as high risk** (`creditScore: 0`, affordable):

```json
{
  "interestRate": 14,
  "emi": 12500.5,
  "affordable": true,
  "riskLevel": "high",
  "decision": "approve_high_risk",
  "explanation": "The borrower has no credit history (new to credit), so the decision is based on income and repayment capacity rather than past credit behaviour. ... Despite a low or unestablished credit score, the application is approved as high risk based on strong affordability."
}
```

**Validation error (`400`)**

```json
{
  "error": {
    "message": "Invalid loan request",
    "details": {
      "errors": ["\"creditScore\" must be an integer", "\"income\" must be > 0"]
    }
  }
}
```

**Unauthorized (`401`)** — when `x-user-id` is missing/invalid:

```json
{ "error": { "message": "Missing x-user-id header" } }
```

### `POST /query`

Returns the authenticated user's previously stored loan decision. Requires the
`x-user-id` header; no request body is needed.

**Headers**

```
x-user-id: alice
```

**Response (`200`)**

```json
{
  "userId": "alice",
  "updatedAt": "2026-05-31T13:40:00.000Z",
  "loan": {
    "interestRate": 9,
    "emi": 10379.99,
    "affordable": true,
    "riskLevel": "low",
    "decision": "approve",
    "explanation": "..."
  }
}
```

Returns `404` if the user has no stored loan. A user can only ever read their
own data — lookups are scoped to the authenticated `userId`.

### `GET /health`

Returns `{ "status": "ok" }` for liveness/readiness checks. Not authenticated.

---

## Running

```bash
# 1. Install dependencies
npm install

# 2. (Optional) configure environment
cp .env.example .env

# 3. (Optional) enable the LLM explanation — otherwise the fallback
#    explanation string is used:
#      LLM_TOKEN=<your-bearer-token>

# 4. Start the server
npm start          # production
npm run dev        # auto-reload (node --watch)

# 5. Run tests
npm test
```

Default port is `3000` (override with `PORT`).

### Quick smoke test

```bash
# Create / price a loan for user "alice"
curl -s -X POST http://localhost:3000/loan \
  -H 'x-user-id: alice' \
  -H 'Content-Type: application/json' \
  -d '{"creditScore":780,"income":90000,"loanAmount":500000,"tenure":60,"existingEMI":10000,"collateral":true}'

# New to credit (creditScore 0), affordable -> approve_high_risk
curl -s -X POST http://localhost:3000/loan \
  -H 'x-user-id: dave' \
  -H 'Content-Type: application/json' \
  -d '{"creditScore":0,"income":120000,"loanAmount":300000,"tenure":36,"existingEMI":0,"collateral":false}'

# Retrieve alice's stored decision
curl -s -X POST http://localhost:3000/query -H 'x-user-id: alice'

# Without the header -> 401 Unauthorized
curl -s -X POST http://localhost:3000/query
```

---

## Security & Privacy

This prototype includes a basic but production-aware security & privacy layer.

- **Mock authentication (header-based).** Every protected request must send an
  `x-user-id` header. The `authenticate` middleware (`src/middleware/auth.js`)
  validates/sanitizes it and attaches `req.userId`. Missing or malformed →
  `401 Unauthorized`. This is a stand-in for real token auth.
- **User-level authorization.** Each loan is tied to the authenticated user.
  Reads are scoped to `req.userId`, and `/query` additionally performs an
  explicit ownership check (`stored.userId === request.userId`) before
  returning data — otherwise `403 Forbidden`.
- **Data isolation.** Loan data is held in an in-memory store keyed by user
  (`{ userId → loanData }`, see `src/store/loanStore.js`). Because every lookup
  is scoped by the authenticated userId, cross-user access is structurally
  impossible.
- **Sensitive data protection.** Logs never contain financial/PII fields — no
  credit score, income, loan amount, EMI, or request bodies. The only loan log
  line is `"loan processed for user"` with the `userId`. Secrets (LLM API key)
  come from env vars and are never logged.
- **Input validation.** All input is validated and sanitized before use:
  credit score `300–900`, `income > 0`, `loanAmount > 0`, `tenure > 0`
  (and a whitelist that strips unknown/polluting fields). Invalid input →
  `400` with field-level details.

### Production improvements

This layer is intentionally lightweight for the prototype. For production it
should be hardened with:

- **JWT (or OAuth2/OIDC) authentication** — replace the `x-user-id` header with
  signed, expiring tokens verified on every request (and refresh handling).
- **Role-Based Access Control (RBAC)** — roles/scopes (e.g. borrower, agent,
  admin) enforced per route, beyond simple per-user ownership.
- **Encryption** — TLS in transit (terminated at the gateway/LB) and encryption
  at rest for stored borrower profiles and decisions; secrets in a managed
  vault/KMS.
- **Audit logging** — tamper-evident, structured audit trail of who accessed or
  changed which records and when, separate from application logs and retained
  per compliance requirements.

---

## Assumptions

1. **`tenure` is in months** — the EMI formula uses `n` as the number of monthly installments, and `r` is a monthly rate. (Range accepted: 1–600 months.)
2. **`income` and `existingEMI` are monthly figures** so they are directly comparable to the monthly EMI in the affordability check.
3. **Credit score range** is `0–900`. `0` is a sentinel for **new to credit** (no history); a normal bureau score is `300–900`. Values `1–299` don't occur in practice but are accepted and handled as a thin file by the eligibility logic. Values outside `0–900` are rejected.
4. **Currency is unitless** — the engine is currency-agnostic; amounts are treated as plain numbers.
5. **`collateral`** does not change the interest rate, but it **does affect eligibility**: for a thin-file applicant (`creditScore < 300`) collateral can turn an otherwise-rejected (unaffordable) application into `approve_high_risk`. It is also surfaced to the AI explanation layer.
6. Monetary outputs (`emi`) are rounded to **2 decimal places**.
7. The **LLM layer is explanation-only**: it never affects pricing/eligibility, is called at most once per request (external wrapper API), and falls back to a fixed message string when `LLM_TOKEN` is unconfigured or the call fails.
8. **No database (by design for this prototype).** To keep the prototype simple and focused on the pricing logic, persistence was intentionally avoided. The service uses a **stateless design** — each request is evaluated independently and nothing is stored. It can be extended with a persistence (DB) layer to store pricing decisions and borrower profiles (e.g. for audit trails, analytics, or reprocessing) without changing the core pricing services.

---

## Non-functional considerations

- **Separation of concerns** — routes → controller → services → AI, each with a single responsibility.
- **Deterministic & testable** — financial math is pure and covered by unit tests.
- **Security & privacy** — header-based mock auth, per-user authorization, in-memory data isolation, and PII-safe logging (see the Security & Privacy section). Input is whitelisted/validated/sanitized; `helmet` sets secure headers; JSON body size is capped; secrets come only from environment variables.
- **Error handling** — typed operational errors map to proper HTTP codes; unexpected errors return a generic 500 without leaking internals.
- **LLM resilience & performance** — a single external LLM call per request, with a hard timeout and a fixed fallback string so latency and availability of the API don't depend on the LLM. The token is read from the environment and never logged.
- **Stateless / no DB** — no persistence in this prototype; each request is self-contained. Easily extensible with a DB layer for storing decisions and borrower profiles (see Assumptions).
- **Graceful shutdown** — SIGINT/SIGTERM drain in-flight connections.

---

## License

MIT
