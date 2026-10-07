# WhatsApp Asset-Coordination Bot

A WhatsApp bot that lets employees coordinate **internal asset lending** (laptops,
projectors, tools) in plain natural language. An LLM interprets each message and calls
typed tools against the asset system — no commands, no menus, just conversation.

> Portfolio project. Single TypeScript deploy, clean layering, deterministic domain
> tests plus opt-in behavioural evals against a real model.

## Highlights

- **Natural-language interface** — the LLM reads intent and drives the system through
  tool-calling (8 tools), converting phrases like *"tomorrow 6pm"* into ISO ranges.
- **One unifying domain rule** — everything is a reservation `[start, end)`. Immediate
  check-out is just a reservation from *now*; check-in is an early close. A single
  no-overlap-per-asset invariant covers the whole feature set.
- **Swappable seams** — the WhatsApp channel and the LLM both sit behind interfaces
  (`Channel`, `Agent`), so the pure domain and its tests never depend on a live session
  or a specific provider.
- **Defensive tool-calling** — free models emit irregular tool calls, so parsing is
  tolerant with fallbacks.
- **Role-based access** — employees (request/view/return their own) and admins
  (create/retire assets, force returns, see everything). Unknown numbers are rejected.

## Architecture

```
WhatsApp ──▶ Channel ──▶ Handler ──▶ Agent (LLM loop) ──▶ Tools ──▶ Domain ──▶ SQLite
            (Baileys)   identity +      tool-calling       dispatch   pure       (better-
             or CLI     memory window   + defensive parse             logic       sqlite3)
```

- `src/domain/` — pure logic (`types`, `reservations`, `authz`). Zero dependencies.
- `src/db/` — SQLite schema, connection, repositories, seed.
- `src/agent/` — tool definitions + dispatch, the agent loop (injectable LLM), and the
  OpenRouter adapter.
- `src/channel/` — the `Channel` interface, a CLI demo, and the Baileys WhatsApp adapter.
- `src/app/` — conversation memory window and the request handler (identity + memory + agent).

## Tech stack

TypeScript / Node (ESM) · [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) ·
[Baileys](https://github.com/WhiskeySockets/Baileys) (unofficial WhatsApp) ·
[OpenRouter](https://openrouter.ai) via the `openai` SDK · [Vitest](https://vitest.dev).

## Getting started

```bash
pnpm install
cp .env.example .env     # add your OpenRouter API key
pnpm seed                # create and seed the SQLite database
pnpm start               # CLI demo (you are an employee)
```

Run the real WhatsApp channel (scan the QR printed in the terminal):

```bash
pnpm start whatsapp      # or: CHANNEL=whatsapp pnpm start
```

By default the CLI runs as an employee. To act as an admin:

```bash
CLI_PHONE=5490000000001 pnpm start
```

## Tests

```bash
pnpm test                # 45 deterministic tests (domain, db, tools, handler)
pnpm test:evals          # 4 behavioural evals against the real model (needs API key)
pnpm typecheck
```

The eval suite exercises intent → tool selection end to end and is skipped when no API
key is present, so the deterministic suite always runs in isolation.

## Configuration

See [`.env.example`](.env.example). The model is swappable via `OPENROUTER_MODEL`;
`OPENROUTER_TEMPERATURE` defaults to `0` for determinism in tool-calling and evals.

## Scope & notes

MVP covers the employee core (view available, reserve, view own, return) and full admin
(add/retire assets, force return, view all). Out of scope: outbound reminders and user
self-registration. Baileys is unofficial and against Meta's ToS — it is isolated behind
`Channel` on purpose and kept out of the domain and the test paths.
