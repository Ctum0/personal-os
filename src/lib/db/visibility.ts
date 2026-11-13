/**
 * Repository-level record visibility policy.
 *
 * Records are HIDDEN from operational views when they carry the explicit
 * classification `status = 'quarantined'`. Visibility is NEVER derived from id
 * substrings (the old `id NOT LIKE '%test%'` convention only matched test
 * fixtures by accident of naming and would leak real records whose id merely
 * contains "test").
 *
 * Test fixtures and any other non-operational record must be explicitly
 * classified as quarantined at creation time, then:
 *  - they are excluded from Today / Tasks / Inbox / Calendar / Search /
 *    Analytics / AI tool context and the planner context;
 *  - they remain recoverable administratively:
 *      GET /api/tasks?includeQuarantined=1  (read)
 *      PUT /api/tasks { id, status: <valid status> }  (reclassify)
 */

export const QUARANTINED_STATUS = 'quarantined';

/**
 * SQL fragment to AND into any `tasks` query so that only operationally
 * visible tasks are returned.
 *
 * `alias` is REQUIRED and must be the alias (or bare table name) that the
 * surrounding query actually uses for `tasks`. A default of `t` silently
 * produced `no such column: t.status` on every unaliased query — the failure
 * mode is a 500 at runtime, so the compiler is asked to prevent it instead.
 */
export function taskVisibleClause(alias: string): string {
  return `(${alias}.status != '${QUARANTINED_STATUS}')`;
}

/** JS-side predicate for post-query filtering. */
export function isOperationallyVisibleTask(row: {
  status?: string;
  is_deleted?: number;
}): boolean {
  if (row.is_deleted === 1) return false;
  return row.status !== QUARANTINED_STATUS;
}
