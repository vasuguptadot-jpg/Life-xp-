# STAGE 27.1 — Release Gate (Final Verification)

- **Commit:** `23a198bf41b28373004ae08d1451dbcbeaab6ed7` (`23a198b`)
- **Branch:** `arena/01a05271-life-xp`
- **Ancestor (Stage 26.1):** `293cd6f`

## STAGE 27.1 FINAL DECISION: **YELLOW**

**Production Ready: CONDITIONAL** — the application code is safe and the
previously-UNVERIFIED real-browser surface is now VERIFIED, but GREEN is
withheld for three specific, documented reasons.

## What changed since Stage 27 (YELLOW → still YELLOW, but narrowed)

| Gap (Stage 27) | Stage 27.1 result |
|---|---|
| Real-browser UX (UNVERIFIED) | **VERIFIED** — Chromium 149, mobile 390×844 + desktop 1440×900, full lifecycle + real XP mutations + double-click idempotency |
| Live Groq (UNVERIFIED) | **STILL UNVERIFIED** — no `GROQ_API_KEY` |
| Reverse-proxy XFF topology | **STILL UNVERIFIED** — deployment prerequisite |
| NEW: media-serving auth gating | **B-class defect surfaced** (F-27.1-01) by real-browser error audit |

## Gate matrix

| Domain | Result | Evidence |
|---|---|---|
| Full regression | ✅ PASS | 447/447 tests, typecheck, api-server + web build, secret scan clean |
| Browser — mobile (390×844) | ✅ PASS | 18/19 checks; full lifecycle + XP + idempotency |
| Browser — desktop (1440×900) | ✅ PASS | 18/19 checks; full lifecycle + XP + idempotency |
| Browser error audit | ⚠️ 1 finding | 0 pageerror / 0 5xx / 0 non-nav requestfailed; 1× B media-401 |
| Live Groq | ⚠️ UNVERIFIED | no key (no-key 503 fallback verified) |
| Production config | ✅ PASS (app scope) | JWT/DB/health/rate-limit/logging/shutdown verified |
| Security | ✅ PASS | 447 adversarial tests + live rate-limit + timing mitigation |
| Performance | ✅ PASS | C8 signin 982ms while healthz ≤25ms (no starvation) |
| Data/XP integrity | ✅ PASS | ledger==total_xp, 0 negative/dup/orphan, likes_count exact |
| Failure/recovery | ✅ PASS | PG down → readyz 503 → restart → 200, data intact |

## Findings

- **F-27.1-01 (B)** — Object-storage media serving gated behind `requireAuth`
  (media tags can't authenticate). Not fixed in this pass (security-sensitive,
  unverifiable without the sidecar). See results JSON / audit doc for root cause.

No A-class, no D-class, no other B-class findings. All remaining C-class items
are the same deployment/infrastructure prerequisites carried from Stage 27.

## Why not GREEN

1. **F-27.1-01 (B-class)** — real-browser testing surfaced a functional defect
   in application code that the Stage 27 code-only audit could not observe. B=0
   is a hard precondition for GREEN.
2. **Live Groq UNVERIFIED** — no `GROQ_API_KEY`; a live provider call cannot be
   executed or fabricated.
3. **Reverse-proxy XFF topology UNVERIFIED** — `trust proxy=1` assumes exactly
   one trusted hop; the production topology cannot be demonstrated here.

## Remaining production prerequisites (before public launch)

1. Provision and validate a real **`GROQ_API_KEY`** (live chat + failure path).
2. Fix **F-27.1-01**: move `/objects` serving ahead of `requireAuth` and enforce
   the object ACL (public=anonymous read, private=owner/group only); verify with
   the object-storage sidecar (`PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR`).
3. Deploy behind a reverse proxy that terminates TLS and **overwrites
   `X-Forwarded-For`** (or set `trust proxy` off) — resolves F-27-01.
4. Set `CORS_ORIGINS` to the production origin allow-list.
5. Managed backups + PITR + RPO/RTO with a tested restore drill.
6. Seed quest templates out-of-band (no committed seed script).
7. Decide security headers / HSTS at the proxy (or add header middleware).
