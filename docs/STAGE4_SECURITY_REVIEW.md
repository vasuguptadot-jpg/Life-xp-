# Stage 4 — Focused Security Review

Scope (per Stage 4): the SSE `?token=` authentication path and the
`GET /api/social/objects/*` path handling. Nothing was changed unless it was
conclusively vulnerable; otherwise the finding is documented here.

## 1. SSE authentication (`GET /api/messages/conversations/:id/events`)

**Mechanism.** `EventSource` cannot set request headers, so the client is meant
to pass the JWT as `?token=`. The handler (`routes/messages.ts`) falls back to
`verifyToken(tokenFromQuery)` only when `req.user` is unset, then re-checks
conversation membership after authentication.

**Findings (documented, not fixed):**

1. **Token-in-URL leakage (anti-pattern).** JWTs in the query string can leak via
   access/proxy logs, browser history, and `Referer` headers. This is a real but
   general weakness inherent to the EventSource-without-headers workaround, not a
   concrete, exploitable bug in this code. It is mitigated by short token expiry
   (`1d`) and the post-auth membership re-check. **No change** — a redesign is out
   of scope.

2. **The `?token=` fallback is effectively unreachable.** `routes/messages.ts`
   applies `router.use(requireAuth)` at the top of the router, and `requireAuth`
   (in `lib/auth.ts`) rejects any request without an `Authorization: Bearer …`
   header with `401` *before* the events handler runs. Therefore the
   `tokenFromQuery && !req.user` branch can never execute for a headerless
   `EventSource` client. This is a **functional** observation (pure-EventSource
   clients would receive `401`), **not** a security vulnerability. It was left
   unchanged because altering it would change authentication behaviour, which is
   explicitly out of scope.

**Verdict:** no conclusive vulnerability introduced; membership is enforced after
auth. Documented only.

## 2. Object serving (`GET /api/social/objects/*`)

**Mechanism.** `routes/social.ts` mounts `router.use("/objects", …)` and passes
`req.path` to `ObjectStorageService.getObjectEntityFile()`, which reconstructs a
GCS object reference from the server-configured private directory plus the
request path, then streams the object back.

**Findings:**

1. **No path traversal.** `getObjectEntityFile` (in `lib/objectStorage.ts`)
   derives the bucket name exclusively from the server-side `PRIVATE_OBJECT_DIR`
   (`parseObjectPath` always takes `pathParts[1]` of the configured dir), never
   from the request. The request only contributes the object-name suffix, and
   Google Cloud Storage object names are opaque strings — `..`, `%2e%2e`, and `/`
   segments are treated literally by `bucket.file(name)`, not as filesystem
   traversal. There is no way to escape the configured bucket. **Safe.**

2. **Missing per-object authorization (potential IDOR).** The objects handler
   authenticates the user (router-level `requireAuth`) but does **not** check the
   object's ACL before serving it. The ACL machinery exists
   (`canAccessObjectEntity` / `canAccessObject` / `getObjectAclPolicy`) but is
   never called; `downloadObject` reads the ACL policy only to choose the
   `Cache-Control` header (public vs private). In principle any authenticated
   user who knows an object path can fetch that object. In practice object paths
   embed a random UUID (`/objects/uploads/<uuid>.<ext>`), so they are
   unguessable. This is a **real weakness** but was **not fixed**: enforcing the
   ACL today would break serving, because `canAccessObject` returns `false` for
   objects without an ACL policy, and uploads (`uploadBufferAsEntity`) currently
   write no policy. Closing this requires an end-to-end change (set policy at
   upload, enforce at serve) that amounts to an authz redesign — out of scope.

3. **Object-serving prefix mismatch (functional, not security).** The client
   requests `/api/social/objects/uploads/<id>` and the router strips `/objects`,
   so the handler receives `req.path === "/uploads/<id>"`.
   `getObjectEntityFile()` requires the input to start with `/objects/`, so it
   throws `ObjectNotFoundError` and the endpoint returns `404`. This is a
   pre-existing functional discrepancy, **not** a security issue (it fails
   closed), and was left unchanged to avoid behaviour changes.

**Verdict:** path handling is not exploitable for traversal; the two residual
findings (missing ACL enforcement, prefix mismatch) are documented, not changed.

## Conclusion

No change was made to production authentication or object-serving behaviour.
Both scoped areas were reviewed; no conclusively exploitable vulnerability that
could be fixed without a behaviour/design change was identified.
