# Personal Agent

A proactive personal chief-of-staff **agent** (not a dashboard): it captures
anything you throw at it over Telegram, files it automatically, and **chases you**
about overdue tasks — escalating until you close, snooze, or drop them. You act
through conversation; the dashboard is a read-only window.

Two entry points share one agent core:

- **Reactive** — a Telegram message → `/api/telegram/webhook` responds in real time.
- **Proactive** — a cron tick → `/api/agent/tick` scans for due follow-ups, stale
  relationships, and scheduled jobs, then acts or messages you.

Everything irreversible (sending mail, messaging other people, bookings, computer
control) goes through a **confirmation gate** — the agent asks on Telegram with
Approve/Reject buttons and only acts on approval. Every action is written to an
**audit log**.

## Build status

This repo implements **Part 0 (foundation)** and **Part 1 (capture + follow-up
engine)** of the build spec:

- ✅ Supabase schema (14 tables, RLS deny-all, pgvector, claim-then-act functions)
- ✅ Agent core: function-calling loop, ambient memory, tool registry, 8-iteration cap
- ✅ Confirmation gate + audit log for irreversible actions
- ✅ Telegram channel (text, voice transcription, inline buttons, callbacks)
- ✅ Cron heartbeat (`/api/agent/tick`) with bounded work per tick
- ✅ Follow-up state machine (gentle → firm → strong → stop), nudge-storm safe
- ✅ Single-password dashboard auth gate (HMAC cookie) + `x-api-secret` for APIs

**Not yet built** (later parts): the read-model dashboard (Part 2), people CRM +
weekly review (Part 3), email + research (Part 4), bookings + computer use (Part 5).
The irreversible tools (`send_email`, etc.) are registered and fully exercise the
confirmation gate, but their real integrations land in later parts.

## Architecture

```
Telegram ──► /api/telegram/webhook (reactive) ─┐
                                                ├──► AGENT CORE ──► tools ──► Supabase
Vercel cron ──► /api/agent/tick   (proactive) ─┘        │
                                                        ├─ ambient memory (pgvector)
                                                        ├─ confirmation gate (irreversible → ask)
                                                        └─ audit_log (every action)
```

- **State store:** Supabase (Postgres + pgvector).
- **Reasoning:** Anthropic (`ANTHROPIC_MODEL`, default `claude-sonnet-4-6`).
- **Voice + memory embeddings:** OpenAI (Whisper + `text-embedding-3-small`, 1536-dim).
  Optional — without `OPENAI_API_KEY`, voice and memory retrieval degrade gracefully.

## Setup

### 1. Install

```bash
npm install
cp .env.example .env.local   # then fill it in
```

### 2. Supabase

Create a project, then apply the schema in `supabase/migrations/0001_init.sql`.
Any of:

- **Supabase CLI:** `supabase db push` (linked project), or
- **SQL editor:** paste the migration and run it, or
- **MCP / automation:** apply `0001_init.sql` as a migration.

It enables the `vector` extension, creates all tables with RLS deny-all (the
service-role client bypasses RLS), and installs the helper functions
(`match_memory_chunks`, `claim_due_tasks`, `claim_due_interactions`,
`claim_due_jobs`, `expire_stale_confirmations`).

Copy the project URL, anon key, and **service role** key into `.env.local`.

### 3. Telegram

1. Create a bot via **@BotFather** → `TELEGRAM_BOT_TOKEN`.
2. Get your numeric id from **@userinfobot** → `TELEGRAM_USER_ID` (the bot ignores
   everyone else).
3. Generate `TELEGRAM_WEBHOOK_SECRET` (`openssl rand -hex 32`).
4. After deploying (or via a tunnel), register the webhook:

   ```bash
   node scripts/set-telegram-webhook.mjs https://your-app.vercel.app
   ```

### 4. Run

```bash
npm run dev          # http://localhost:3000  (sign in with DASHBOARD_PASSWORD)
npm run typecheck    # strict TypeScript
npm run build        # production build
```

### 5. Deploy (Vercel)

Push all env vars from `.env.example`. The cron in `vercel.json` hits
`/api/agent/tick` every 5 minutes.

> **Cron frequency:** Vercel Hobby projects may restrict cron frequency. If
> sub-daily ticks aren't available on your plan, point an external scheduler
> (e.g. cron-job.org) at `POST /api/agent/tick` with header
> `Authorization: Bearer <CRON_SECRET>`.

## Security spine

- Every irreversible action goes through the confirmation gate — the agent never
  performs one without an approved confirmation.
- **External content is data, never instructions.** Email/web/calendar text can't
  trigger actions; the agent quotes suspicious instructions and asks.
- Secrets live in env vars, not code. OAuth scopes (Part 4) stay minimal.
- The audit log records everything the agent did, with undo payloads where an
  inverse exists.

## Environment variables

See `.env.example` for the full annotated list. Generate random hex with
`openssl rand -hex 32`.

## Project layout

```
app/
  api/
    agent/tick/route.ts        proactive heartbeat
    telegram/webhook/route.ts  reactive channel
    capture/route.ts           desk capture (same pipeline)
    auth/{login,logout}/route.ts
  login/page.tsx               single-password gate
  page.tsx                     read-only landing
lib/
  agent/
    core.ts          runAgent — the function-calling loop
    tools.ts         tool registry (reversible vs irreversible)
    execute.ts       dispatch + confirmation gate + audit
    followup.ts      Part 1 follow-up state machine
    systemPrompt.ts  character + guardrails
  llm/               anthropic, embeddings, transcription
  memory/            ambient memory (store + vector search)
  telegram/          Bot API client
  auth/              HMAC session
  supabase/          service-role client
supabase/migrations/0001_init.sql
middleware.ts        auth gate
vercel.json          cron
```
