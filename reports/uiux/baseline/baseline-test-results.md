# Baseline Test Results

**Date**: November 6, 2026  
**Auditor**: Antigravity (Auditor Role)  
**Execution Environment**: Local Dev Server (`http://localhost:3001`), Vitest v5.0.5, Next.js v16.4.3 Turbopack

---

## 1. Automated Test Suite Results

```
 RUN  v5.0.5 /home/ctum/Documents/Projects/personal-os

 ✓ src/tests/time.test.ts (8 tests)
 ✓ src/tests/migrations.test.ts (4 tests)
 ✓ src/tests/productivity.test.ts (7 tests)
 ✓ src/tests/hardening.test.ts (3 tests)
 ✓ src/tests/customization-and-ai.test.ts (8 tests)
 ✓ src/tests/finance.test.ts (7 tests)

 Test Files  6 passed (6)
      Tests  37 passed (37)
   Start at  00:19:28
   Duration  370ms
```

- **Pass Rate**: 100% (37 passed out of 37)
- **Zero Regressions**: Finance balance calculation, CSV duplicate checking, formula evaluator, AI governance diff generation, timezone normalization, and database migrations pass completely.

---

## 2. Static Typing & Production Compilation

### 2.1 TypeScript Compilation (`npx tsc --noEmit`)
- **Status**: Clean (Exit code 0)
- **Type Errors**: 0

### 2.2 Production Next.js Build (`next build`)
- **Status**: Succeeded (Exit code 0)
- **Output Routes**: 53 routes total (Static Prerendered: 29, Dynamic Server-Rendered: 24)
- **Compilation Speed**: 2.7s (Turbopack)

---

## 3. Browser Runtime & Console Diagnostic

- **Live Endpoint**: `http://localhost:3001`
- **HTTP Status**: 200 OK across all tested routes (`/`, `/productivity/tasks`, `/finance`, `/finance/transactions`, `/overview/metrics`)
- **Fatal Runtime Errors**: 0
- **Console Warnings Observed**:
  - `Warning: Extra attributes from the server: class, style` on initial hydration due to theme class detection. (To be resolved during Phase 4 redesign).
- **Navigation Response**: Sub-100ms client route transitions via Next.js router.
