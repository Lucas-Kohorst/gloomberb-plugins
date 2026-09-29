# Kalshi broker + OpticOdds board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only Kalshi broker plugin and an OpticOdds sports odds pane to gloomberb-plugins.

**Architecture:** Two independent packages under `plugins/`. Kalshi follows `plugins/broker-public`. OpticOdds follows OFAC/Weather (pane + `createConnection`). They do not import each other. OpticOdds keys come from BYOK via `ctx.getApiKey("optic-odds")`. Kalshi keys live on the broker instance.

**Tech Stack:** TypeScript, Bun test, Gloomberb public plugin APIs (`gloomberb/types/*`, `gloomberb/plugins`, `gloomberb/ui`, `gloomberb/components`, `gloomberb/react`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-18-kalshi-broker-optic-odds-design.md`
- No trading, no Optic prediction-market/SSE endpoints, no CI calls to live APIs
- Never log PEM, Kalshi key id, signatures, or OpticOdds API keys
- OpticOdds auth header is `X-Api-Key` only — never `?key=`
- Connection id for Kalshi broker is `kalshi-broker` (not `kalshi`)
- Targets: `cli`, `tui`, `desktop`
- Do not commit; do not edit files outside the assigned plugin directory
- Copy `package.json` / `tsconfig.json` from `plugins/broker-public` or `plugins/ofac-sanctions`
- TDD: failing tests first for normalize/auth/client seams
- Do not use `as` type assertions on API payloads; parse with typeof / Number / helpers

---

### Task 1: broker-kalshi

**Files:** create only under `plugins/broker-kalshi/`

**Interfaces:** see spec. Produce `kalshiBroker` + default plugin export.

- [ ] Tests then implementation for auth message, normalize, pagination client, plugin wiring

### Task 2: optic-odds

**Files:** create only under `plugins/optic-odds/`

**Interfaces:** see spec. Produce pane `ODDS` + BYOK register + connection.

- [ ] Tests then implementation for header builder, row normalize, book basket, pane
