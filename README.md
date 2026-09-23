# SOYLE

## About

SOYLE is a working hackathon MVP that connects businesses with student teams. It turns an incomplete problem statement into an editable, structured task, explains how ready that task is for publication, and supports team proposals with manual business decisions.

The product interface is in Russian. This document uses English for contributor clarity.

## Hackathon problem

Business requests often arrive without the context, data, constraints or success criteria a student team needs. Teams spend time clarifying the brief, while businesses have no transparent way to see what is missing.

## Solution

SOYLE asks focused questions, produces a structured card using only user-provided facts and calculates a deterministic readiness score. The business can edit and confirm every field before publishing. Student teams then browse the shared catalog and submit proposals.

## User flow

1. Switch to `BUSINESS` and create a task from a free-form description.
2. Answer at least three AI-generated clarification questions.
3. Review, edit and confirm the generated fields.
4. Inspect the score breakdown and publish the task.
5. Switch to `TEAM`, open the task in the catalog and submit a proposal.
6. Switch back to `BUSINESS`, review proposals and accept or reject them manually.

## Features

- five-step business task wizard;
- local demo role switcher (`BUSINESS` / `TEAM`);
- task editor with field-level confirmation;
- published catalog with industry, readiness and sorting controls;
- complete task pages with missing-field handling;
- proposal submission and team history;
- business dashboard and manual proposal decisions;
- loading, empty, validation, success and failure states;
- responsive layouts for phone, tablet and desktop.

## AI functionality

`POST /api/ai/analyze` finds explicitly provided information and returns at least three relevant questions. `POST /api/ai/generate-card` turns the original description and answers into a structured card. Prompts prohibit invented business facts, and Zod validates every AI result before it is returned.

If `OPENAI_API_KEY` is absent or the provider is unavailable, the application uses a deterministic local path explicitly labeled `DEMO FALLBACK`. An invalid provider response is rejected with a retryable error and is never saved.

## Readiness scoring

The score is calculated in `lib/scoring/calculate-readiness.ts`. A field receives points only when it has a non-whitespace value and the business has confirmed it.

| Field | Points |
| --- | ---: |
| Context | 10 |
| Need | 10 |
| Data and materials | 20 |
| Expected result | 15 |
| Success criteria | 15 |
| Constraints | 10 |
| Users | 10 |
| Contact | 5 |
| Interaction format | 5 |

Levels are `REQUIRES_CLARIFICATION` (0–39), `WORKING` (40–69), `READY` (70–89) and `PRIORITY` (90–100). A low score never prevents publication.

## Architecture

The application is a single Next.js App Router project. Route Handlers call server-side services; services access SQLite through Prisma. Scoring is pure domain code. OpenAI access is server-only. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for decisions, routes, security and excluded scope.

## Tech stack

- Next.js, React, TypeScript
- Tailwind CSS
- Prisma ORM and SQLite
- Zod
- official OpenAI Node SDK
- Vitest

## Project structure

```text
app/                  pages and API route handlers
components/           layout, task, score, AI and proposal UI
docs/ARCHITECTURE.md  architecture and domain decisions
lib/ai/               prompts, client, schemas and fallback service
lib/db/               Prisma singleton
lib/scoring/          deterministic readiness engine
lib/services/         task and proposal use cases
lib/validation/       Zod transport schemas
prisma/               SQLite schema and synthetic seed
tests/                readiness and validation tests
types/                shared domain and API types
```

## Getting started

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
```

On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm.ps1`.

## Environment variables

Copy `.env.example` to `.env.local` only when a live OpenAI call is wanted:

```text
OPENAI_API_KEY=
```

The key is optional for the demo and must never be committed. `OPENAI_MODEL` may be set server-side to override the default model, although it is intentionally omitted from the minimal example file.

## Database

SQLite is stored at `prisma/dev.db` and ignored by Git. `BusinessTask` has many `Proposal` records. Confirmed task fields are serialized as JSON text because SQLite has no native string-array field. The readiness score is always derived and is not stored.

The seed command resets local demo records and creates five synthetic tasks with scores of 25, 45, 65, 80 and 95, plus five proposals. Do not run it against data you want to keep.

## Running locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). A production-style run uses `npm run build` followed by `npm run start`.

## Tests

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Tests cover readiness weights, whitespace and confirmation rules, all level boundaries, determinism, URL validation, publication enums and AI schemas.

## Demo scenario

Use the prefilled weak input: “У нас учебный центр. Хотим улучшить работу с учениками и понимать, почему некоторые перестают ходить.” Continue through the questions, confirm fields, inspect the changed score and publish. Open the published task as `TEAM`, send a proposal, return to the business dashboard and accept or reject it.

## Security

AI calls are server-only. API inputs and generated structures are validated. `.env` files and the SQLite database are ignored. No route returns stack traces or environment values. The role switcher is only a demo aid and does not provide authorization.

## Limitations

The MVP has no user accounts or production access control. Demo proposals are shown together on the team page. The fallback extracts a small deterministic set of cues and is less capable than a configured model.

## Future development

Replace the role switcher with authentication and ownership checks, add organization/team profiles, audit proposal decisions, introduce notifications and attachments, and move from SQLite to a production database when the workflow is validated.
