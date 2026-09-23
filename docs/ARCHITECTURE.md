# SOYLE Architecture

## 1. Product purpose

SOYLE is a hackathon MVP that turns an incomplete business problem into a transparent, editable task for student teams. AI extracts only explicitly supplied facts and asks for missing information. A deterministic scoring engine measures completeness, while the business remains responsible for publishing the task and accepting or rejecting proposals.

## 2. User roles

- `BUSINESS` creates, edits, confirms, scores and publishes tasks, then reviews team proposals.
- `STUDENT_TEAM` browses published tasks, filters the catalog and submits proposals.

Authentication is intentionally represented by a local demo role switcher. The role changes navigation and available calls to action; it is not an authorization boundary.

## 3. Main flow

1. A business enters a weak free-form description.
2. The server-side AI service detects explicit facts and returns at least three relevant questions.
3. The business answers the questions and requests a structured task card.
4. The business edits the card and explicitly confirms individual fields.
5. Pure application code calculates the 0–100 readiness score and its breakdown.
6. The draft is saved and may be published regardless of its score.
7. Published tasks appear in the catalog.
8. A student team submits a proposal.
9. The business manually accepts or rejects each proposal. Multiple proposals may be accepted.

## 4. Technology stack

- Next.js App Router, React and TypeScript
- Tailwind CSS for styling
- Next.js Route Handlers and a server-side service layer
- Zod for request and AI-output validation
- Prisma ORM with SQLite
- Official OpenAI Node SDK, used only on the server
- Vitest for deterministic unit and service tests

## 5. Domain model

`BusinessTask` contains the original input, the editable structured fields, publication state and the names of fields explicitly confirmed by the user. Readiness is derived on every read and is never stored as the source of truth.

`Proposal` belongs to one task and contains a team name, solution idea, plan, duration, optional prototype URL and a manually controlled status (`PENDING`, `ACCEPTED`, `REJECTED`).

## 6. Database schema

SQLite stores `BusinessTask` and `Proposal` in a one-to-many relationship. `confirmedFields` is serialized as JSON text because SQLite has no native string-array column. Dates are Prisma `DateTime` values. Deleting a task cascades to its proposals, though the MVP exposes no delete endpoint.

## 7. Backend architecture

Route handlers validate transport input and map service errors to a stable response envelope. Services own database queries and domain transitions. The scoring and AI modules have no dependency on UI components. Prisma is instantiated once in development to survive hot reloads.

All API responses use `{ success, data? , error? }`. Mutation routes reject malformed payloads with a safe message and do not expose stack traces.

## 8. API routes

- `GET /api/tasks` — published catalog with `industry`, `level` and `sort` filters
- `POST /api/tasks` — create a draft
- `GET /api/tasks/:id` — get a task with derived readiness
- `PATCH /api/tasks/:id` — update a draft or published card
- `POST /api/tasks/:id/publish` — publish a task
- `GET /api/tasks/:id/proposals` — list proposals for a task
- `POST /api/tasks/:id/proposals` — submit a proposal
- `POST /api/proposals/:id/accept` — accept a proposal manually
- `POST /api/proposals/:id/reject` — reject a proposal manually
- `POST /api/ai/analyze` — analyze an initial description
- `POST /api/ai/generate-card` — build a structured card from the description and answers
- `GET /api/business` — business dashboard data
- `GET /api/team` — demo team proposal history

## 9. AI layer

The AI client is created only when `OPENAI_API_KEY` is available. Prompts require JSON output and explicitly forbid inference or invented facts. Every response is parsed and validated with Zod before it reaches a route or UI.

When the key is missing or the provider is unavailable, a deterministic `DEMO FALLBACK` analyzes recognizable details, selects questions for missing categories, and builds a card using only the supplied description and answers. The response exposes fallback status so the interface can label it honestly.

## 10. Frontend architecture

Pages load durable data on the server where practical. Focused client components handle the role switcher, task creation wizard, filters, proposal form and proposal status actions. Shared task and score components render the same derived data on business, catalog and detail pages.

The UI is Russian-first, keyboard accessible, responsive down to 375 px and optimized for a five-minute desktop demonstration.

## 11. Scoring engine

`calculateReadiness` is a pure function. A field receives points only when its trimmed value is non-empty and its key occurs in `confirmedFields`. Weights are: context 10, need 10, data/materials 20, expected result 15, success criteria 15, constraints 10, users 10, contact 5 and interaction format 5. Levels are selected from fixed score ranges. Missing fields and recommendations are generated from the same table, keeping the explanation consistent with the score.

## 12. Error handling

Forms display pending, success and failure states and disable submission while a request is active. API validation errors, missing records, AI failure and database failure have separate safe error codes. Next.js provides the outer 404 boundary and the task page has a domain-specific not-found path.

## 13. Security

OpenAI calls run only in route handlers and server modules. Secrets are never sent to the browser, `.env*` files are ignored except `.env.example`, request bodies are validated, URLs are checked, and errors returned to the UI contain no stack trace. The demo role switcher provides no real access control and must be replaced before production use.

## 14. Demo strategy

Seed data supplies five synthetic tasks at several completeness levels and at least five proposals. The primary demo starts with the education-center prompt, proceeds through fallback or live AI questions, confirms fields, publishes the generated task, submits a team proposal, and updates its status from the business dashboard.

## 15. Outside the MVP

OAuth, real registration, password recovery, production RBAC, realtime chat, notifications, calendar integration, file storage, vector search, custom model training, automatic team selection or ranking, microservices, Redis, Kubernetes and production infrastructure are intentionally excluded.
