# Stage 26.1 — Release Gate

**Decision: GREEN**

## Decision phrase

> STAGE 26.1 decision: GREEN — password hashing moved from bcryptjs (pure JS, main
> event loop, up to 1617 ms lag at 16 concurrent sign-ins) to native bcrypt (libuv
> threadpool), with cost 12 and the bcrypt algorithm unchanged so no password security
> was weakened and no account was invalidated. Event-loop lag is now flat at 4–14 ms
> regardless of concurrency, and cross-user latency under concurrent sign-in load is
> ~1 ms. A pre-existing account-enumeration timing oracle was also closed. Full
> regression 447/447; typecheck/build/secret-scan clean.

## GREEN gates

| Gate | Status |
|---|---|
| Password security not weakened | ✅ PASS — same algorithm (bcrypt), same cost (12), same salt; cost NOT lowered |
| No event-loop starvation from authentication | ✅ PASS — lag flat 4–14 ms (was 105–1617 ms) |
| Cross-user latency improved/acceptable | ✅ PASS — unrelated healthz ~1 ms under 16–32 concurrent sign-ins |
| Auth correctness preserved | ✅ PASS — valid/wrong/nonexistent/disabled/deleted/refresh/logout/rotation all correct |
| Rate limits preserved | ✅ PASS — 429s under concurrency, limiter before hash |
| No enumeration | ✅ PASS — timing oracle closed (delta ~5 ms); uniform 401 bodies |
| No password/hash leakage | ✅ PASS — no hashes in responses/logs; secret scan clean |
| No resource leak | ✅ PASS — RSS returns to idle; native bcrypt memory overhead 0 |
| No new D/B findings | ✅ PASS — 0 D, 0 B (XFF bypass is pre-existing + infra-dependent) |
| Existing accounts accessible | ✅ PASS — legacy `$2a$` hashes verify; no forced rehash/reset |
| Full regression passes | ✅ PASS — 447/447 (44 files); typecheck + build + secret scan |

## Classification matrix

| Class | Count | Items |
|---|---|---|
| A | 0 | — |
| B | 0 | — |
| C | 0 | — |
| D | 0 | — |

## Infrastructure-dependent items (documented, not application scope)

1. **XFF rate-limit bypass** (pre-existing): with `trust proxy: 1` and the server
   directly reachable, per-request `X-Forwarded-For` spoofing defeats the IP-keyed
   auth limiter. This is a **deployment** concern: front the app with a reverse proxy
   that overwrites `X-Forwarded-For`, or disable `trust proxy` when directly exposed.
   It is not introduced by, and does not block, this stage's change.

## Why GREEN

The central acceptance criterion — "high authentication load must not compromise
security or starve unrelated users" — is met with measured evidence: event-loop lag
collapsed from up to 1617 ms to a flat 4–14 ms, and cross-user latency under sign-in
load is ~1 ms. Security is unchanged (same algorithm and cost), no account is
invalidated, and a real enumeration oracle was closed as a bonus within scope
(P6/P12 require "no enumeration").

## Evidence boundary

All figures are measured (real HTTP load against the running app, or in-process
harnesses against the real library), never estimated from source inspection. The only
untested surface is browser-based interaction (no Chromium in sandbox), consistent with
prior stages and explicitly not fabricated.
