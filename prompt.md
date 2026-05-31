# Prompts

This file records the prompts used to build this project, as required by the brief.

---

## Prompt 1 — Initial build (deterministic engine + scaffolding)

> Create a production ready Node.js (express) application that implements an AI assisted loan pricing engine.
>
> **Goal**
> Recommend a personalized interest rate for a borrower based on risk, affordability, and basic financial logic. Also provide a clear AI generated explanation for the decision.
>
> **Functional Req**
>
> 1. Accept borrower profile as input via REST API: `POST /loan`
>
> Request json
> ```json
> {
>   "creditScore": number,
>   "income": number,
>   "loanAmount": number,
>   "tenure": number,
>   "existingEMI": number,
>   "collateral": boolean
> }
> ```
>
> 2. Implement deterministic financial logic (LLM not to be used here)
>    - assign risk premium:
>      - credit score > 750 -> low risk -> +1%
>      - 650-750 -> medium risk -> +3%
>      - <650 -> high risk -> +6%
>    - Base roi = 8%
>    - Final roi = base roi + risk premium
>
> 3. EMI calculation, use formula:
>    `EMI = P*r*(r+1)^n / ((1+r)^n-1)` where p = loan amt, r = monthly interest rate, n = loan tenure
>
> 4. Affordability check
>    - If (EMI + existingEMI) > 40% of income -> Not affordable, else affordable
>
> 5. Risk level tag: low / medium / high based on credit score
>
> 6. Response Json (strict format):
> ```json
> {
>   "intrestRate": number,
>   "emi": number,
>   "affordable": boolean,
>   "riskLevel": "low or medium or high",
>   "explanation": string
> }
> ```
>
> Use code structure as `/routes` (API routes), `/services` (pricing logic, affordability, EMI), `/ai` (LLM integration).
>
> For the AI part another prompt will be provided, so leave that part unimplemented for now.
>
> **NFRs:** clean readable code, separation of concerns, error handling, comments for key logic, README with architecture/sample req & resp/assumptions, and a prompt.md storing these prompts.
>
> **Design consideration:** Deterministic financial logic (calculation) + AI layer (explanation).

### Notes / decisions made during this build

- The response field was specified as `intrestRate` (typo) in the brief. The implementation uses the correctly-spelled **`interestRate`** in the strict response. Adjust `loanService.js` if the literal misspelled key is required by a downstream consumer.
- `tenure` is treated as **months**, and `income`/`existingEMI` as **monthly** values (see README assumptions).
- The `/ai` layer (`explanationService.js`) is intentionally **unimplemented**: it exposes the final interface (`generateExplanation`, `buildPrompt`) and returns a deterministic template-based explanation as a fallback so the API contract is satisfied until the dedicated AI prompt is provided.

---

## Prompt 2 — AI explanation layer

> Now for AI explanation (use LLM): generate a clear explanation using OpenAI/Claude API.
> The prompt should include credit score, income vs EMI, affordability result, risk level, interest rate.
>
> Example: _"explain in simple terms why this borrower received this ROI. Mention credit score impact, affordability and risk."_
> Keep the explanation concise, transparent & user-friendly.
>
> **Performance constraints**
> - Do not call the LLM for calculation.
> - Call the LLM only once per request for the explanation.
> - Keep code modular and clean.
>
> Update the README if required (architecture etc.) and also mention in the README that for this prototype a database was avoided to keep it simple and focused on pricing logic — currently a stateless design, which can be extended with a persistence (DB) layer to store pricing decisions and borrower profiles.

### LLM prompt used (system + user)

The LLM prompt is constructed in `src/ai/promptBuilder.js`.

**System prompt:**

> You are a lending assistant who explains loan pricing decisions to borrowers.
> Explain in simple, transparent, user-friendly terms why this borrower received
> this interest rate. Always mention: the credit score impact, the affordability
> result (income vs EMI), and the risk level. Be concise (2-4 sentences). Use a
> neutral, helpful tone. Do NOT invent, recompute, or change any numbers — use
> only the figures provided. Do NOT give financial advice or promises; only
> explain the decision.

**User prompt:** a labelled fact list containing credit score, risk level &
premium, final interest rate, loan amount/tenure, monthly EMI, income, existing
EMIs, total monthly obligation, affordability limit, and affordability result.

### Notes / decisions made during this build

- **Providers:** OpenAI (Chat Completions) and Claude (Messages) are supported
  behind a shared `complete()` interface in `src/ai/providers`, selected via
  `AI_PROVIDER`. Calls use native `fetch` over HTTPS with an `AbortController`
  timeout — no heavy SDK dependencies added.
- **No LLM in calculation:** the decision is fully computed by the deterministic
  services before the AI layer runs; the prompt forbids changing any number.
- **One call per request:** `generateExplanation` performs a single completion
  call, no retries/chains.
- **Graceful fallback:** if `AI_API_KEY` is unset or the call errors/times out,
  a deterministic template explanation is returned so the API never fails due to
  the LLM.
- **Secrets:** the API key is read only from `AI_API_KEY` (env) and never logged.

---

## Prompt 3 — Security & privacy layer

> Enhance this application by adding a basic but production-aware security & privacy layer.
>
> 1. **Mock authentication** — extract `userId` from request header `x-user-id`; if not present return Unauthorized.
> 2. **Authorization** — ensure each loan request is tied to a userId; users can only access their own loan data (if `stored loan.userId != request.userId` throw error).
> 3. **Data isolation** — maintain an in-memory store like `{ userId: loanData }`; ensure no cross-user data access.
> 4. **Sensitive data handling** — don't log full loan details (income, loan amount, credit score); only log `"loan processed for user": userId`.
> 5. **Input validation** — credit score between 300–900, income > 0, loanAmount > 0, tenure > 0; return error if invalid.
> 6. **Middleware structure** — auth middleware (extracts userId) and validation middleware (validates input).
> 7. **API protection** — apply middleware to all routes: `POST /query`, `POST /loan`.
> 8. **README update** — add a Security and Privacy section (mocked header auth, user-level auth, data isolation, sensitive data protection, input validation) and mention production improvements (JWT auth, RBAC, encryption, audit logging).

### Notes / decisions made during this build

- **Auth middleware** (`src/middleware/auth.js`): reads `x-user-id`, validates it
  against a safe identifier pattern (defense against malformed keys), and sets
  `req.userId`. Missing/invalid → `401`.
- **`/query` endpoint added** to satisfy requirement #7. It returns the
  authenticated user's stored decision and performs an explicit ownership check
  (`record.userId === req.userId`, else `403`).
- **Data isolation** (`src/store/loanStore.js`): an in-memory `Map` keyed by
  userId. Lookups are always scoped to the authenticated user, so cross-user
  access is structurally impossible. Non-persistent by design (prototype).
- **PII-safe logging:** no financial fields or request bodies are ever logged;
  the only loan log line is `"loan processed for user"` with `userId`.
- **Validation tightened:** added `exclusiveMin` support so `income > 0`,
  `loanAmount > 0`, and `tenure > 0` are enforced (credit score remains 300–900).
- **New typed errors:** `UnauthorizedError (401)`, `ForbiddenError (403)`,
  `NotFoundError (404)`, handled by the existing centralized error handler.

---

## Prompt 4 — Balanced eligibility decision

> Goal: do not reject users based only on credit score — instead combine credit
> score, affordability, and collateral to make a balanced decision.
>
> 1. **Credit score handling:** `cs = 0` → new to credit; `cs < 650` → high; `cs 650–750` → medium; `cs > 750` → low.
> 2. **Affordability rule:** `totalEMI = EMI + existingEMI`; if `totalEMI > 40% income` → not affordable.
> 3. **Eligibility decision:**
>    ```
>    if cs < 300:
>      if not affordable and no collateral -> reject  else -> approve_high_risk
>    else:
>      if not affordable -> reject  else -> approve
>    ```
> 4. **Response (strict JSON):** add `decision: "approve|approve_high_risk|reject"`.
> 5. **AI update:** if rejected, explain due to affordability or very low credit; if high risk, mention low cs but approval due to affordability/collateral; if `creditScore = 0`, mention "no credit history, decision based on income & repayment capacity".

### Notes / decisions made during this build

- **New `eligibilityService.js`** implements the balanced decision exactly as
  specified, using a configurable `THIN_FILE_MAX` (300) threshold.
- **Credit-score validation widened to `0–900`** so `0` (new to credit) and the
  `< 300` thin-file band are accepted (previously `300–900`). `0` is the
  new-to-credit sentinel (`isNewToCredit` in `pricingService`).
- **Risk band unchanged** (`> 750` low, `650–750` medium, `< 650` high). A
  new-to-credit / thin-file applicant is still priced as high risk, but is no
  longer auto-rejected — affordability or collateral can yield `approve_high_risk`.
- **`decision` added** to the strict response (order: interestRate, emi,
  affordable, riskLevel, decision, explanation).
- **AI layer updated** (both LLM prompt and deterministic fallback) with the
  reject / approve_high_risk / new-to-credit messaging rules.
- **Tests added** for `isNewToCredit` and all `decideEligibility` branches.

---

## Prompt 5 — Integrate external LLM wrapper API

> Integrate an external LLM API into this existing Node app.
> Endpoint: `POST https://llm-wrapper-741152993481.asia-south1.run.app`
> Headers: `Content-Type: application/json`, `Authorization: Bearer <TOKEN FROM ENV>`
> Body: `{ "prompt": "string" }`
>
> - Create `services/llmService.js` with a reusable `async callLLM(prompt)` that uses
>   **axios**, reads the token from `process.env.LLM_TOKEN`, handles errors, and returns
>   only `resp.data`. POST to the endpoint with the prompt in the body and the Bearer
>   auth header, using async/await.
> - Usage rule: do not use the LLM for EMI / risk calculation or the eligibility decision.
> - Create `async generateExplanation(data)` where `data` has `creditScore`, `riskLevel`,
>   `decision`, `affordable`. Call it inside the main loan flow and add an `explanation`
>   field to the final JSON response. If the LLM fails, return
>   "Loan decision was made based on credit score, risk level and repayment capacity."

### Notes / decisions made during this build

- **New `src/services/llmService.js`** exposes `callLLM(prompt)` (axios POST, Bearer
  token from `process.env.LLM_TOKEN`, returns only `response.data`) and
  `generateExplanation(data)` (builds a decision-aware prompt, calls `callLLM`, returns
  the text or the fixed fallback string on any failure).
- **Wired into `loanService.js`** step 5, called with `{ creditScore, riskLevel,
  decision, affordable }`. EMI / risk / eligibility remain fully deterministic.
- **`axios`** added as a dependency. Token/endpoint config via `LLM_TOKEN` /
  `LLM_ENDPOINT` / `LLM_TIMEOUT_MS`; the token is never logged.

---

## Prompt 6 — Keep the provider-based AI layer as an option

> Bring back the AI layer even though it's not used — keep it as an option and
> mention the same in the README.

### Notes / decisions made during this build

- **Restored `src/ai/`** (provider-based OpenAI/Claude explanation layer:
  `explanationService.js`, `promptBuilder.js`, `providers/`) and the `config.ai`
  block plus the optional `AI_*` variables in `.env.example`.
- **Not wired into the flow:** the active explanation path remains
  `services/llmService.js` (external wrapper). The `ai/` layer is preserved as a
  pluggable alternative; the README "Optional provider-based AI layer" section
  documents how to switch to it.
