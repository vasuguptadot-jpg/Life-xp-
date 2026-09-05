// Deterministic parsing of pagination query parameters.
//
// Pagination params arrive as untrusted query strings. `Number("abc")` is NaN
// and `Number("-1")` is -1; passing either to a SQL `LIMIT`/`OFFSET` clause
// makes PostgreSQL throw ("LIMIT must not be negative" / "invalid input syntax
// for type integer"), which surfaces as an HTTP 500. Sanitize at the boundary
// instead: non-finite values fall back to a default, and results are clamped to
// a safe non-negative integer range before ever reaching SQL.

export function parseLimit(raw: unknown, def: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(Math.floor(n), 0), max);
}

export function parseOffset(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
