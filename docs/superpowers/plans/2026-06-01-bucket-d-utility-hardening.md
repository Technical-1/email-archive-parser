# Bucket D — Shared Utility Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `formatFileSize` safe for terabyte-scale and out-of-range inputs, and stop `cleanEmailAddress` from leaking display-name text when no valid address is present.

**Architecture:** Two small, independent fixes in `src/utils.ts`, each with focused regression tests. No shared logic — batched only because they touch the same file and test target.

**Tech Stack:** TypeScript, Vitest, tsup.

**Project Hub tasks covered:** #783, #785 (project 48).

**Sequencing:** Land this bucket **after** Buckets A and C, since `cleanEmailAddress` is consumed heavily by the parsers and detectors and its changed return contract should be validated against their tests too.

**Test runner:** `npx vitest run <path>`.

---

### Task 1: Make formatFileSize safe for large/negative input (#783)

**Files:**
- Modify: `src/utils.ts` (`formatFileSize` at lines 103-116)
- Test: `src/__tests__/utils.test.ts` (existing `describe('formatFileSize', ...)` at lines 162-186)

- [ ] **Step 1: Add failing tests**

Append inside the existing `describe('formatFileSize', ...)` block in `src/__tests__/utils.test.ts`:

```typescript
  it('should format terabytes without an undefined unit', () => {
    expect(formatFileSize(1024 ** 4)).toBe('1 TB');
  });

  it('should format petabytes', () => {
    expect(formatFileSize(1024 ** 5)).toBe('1 PB');
  });

  it('should clamp absurdly large values to the largest unit', () => {
    const result = formatFileSize(1024 ** 7);
    expect(result).not.toContain('undefined');
    expect(result.endsWith(' PB')).toBe(true);
  });

  it('should treat negative input as 0 B', () => {
    expect(formatFileSize(-5)).toBe('0 B');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/utils.test.ts -t "formatFileSize"`
Expected: FAIL — `formatFileSize(1024 ** 4)` returns `'1 undefined'` (index 4 is out of the `['B','KB','MB','GB']` range).

- [ ] **Step 3: Write the implementation**

Replace the entire `formatFileSize` function (lines 103-116) in `src/utils.ts` with:

```typescript
/**
 * Format file size for display
 * @param bytes - Size in bytes
 * @returns Human-readable size string
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0 || !Number.isFinite(bytes)) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    sizes.length - 1
  );

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/utils.test.ts -t "formatFileSize"`
Expected: PASS — new tests plus the existing `0 B` / `500 B` / `1 KB` / `1 MB` / `1 GB` / `1.5 KB` cases.

- [ ] **Step 5: Commit**

```bash
git add src/utils.ts src/__tests__/utils.test.ts
git commit -m "fix(utils): support TB/PB and guard out-of-range formatFileSize (#783)"
```

---

### Task 2: Stop cleanEmailAddress leaking display names (#785)

**Files:**
- Modify: `src/utils.ts` (`cleanEmailAddress` at lines 11-24)
- Test: `src/__tests__/utils.test.ts` (existing `describe('cleanEmailAddress', ...)` at lines 16-44)

- [ ] **Step 1: Add failing tests**

Append inside the existing `describe('cleanEmailAddress', ...)` block in `src/__tests__/utils.test.ts`:

```typescript
  it('should not leak the display name for an address without a dotted TLD', () => {
    const result = cleanEmailAddress('Jane Roe <jane@localhost>');
    expect(result).toBe('jane@localhost');
    expect(result).not.toContain('jane roe');
  });

  it('should return empty string when there is no address at all', () => {
    expect(cleanEmailAddress('Just A Name')).toBe('');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/utils.test.ts -t "cleanEmailAddress"`
Expected: FAIL — `'Jane Roe <jane@localhost>'` currently returns `'jane roe jane@localhost'`, and `'Just A Name'` returns `'just a name'`.

- [ ] **Step 3: Write the implementation**

Replace the entire `cleanEmailAddress` function (lines 11-24) in `src/utils.ts` with:

```typescript
/**
 * Clean and normalize an email address
 * @param email - Raw email string
 * @returns Cleaned, lowercase email address, or '' when none is found
 */
export function cleanEmailAddress(email: string): string {
  if (!email) return '';

  // Remove angle brackets and extra whitespace
  const cleaned = email.replace(/[<>]/g, '').trim();

  // Preferred: a fully-qualified address with a dotted TLD
  const fqMatch = cleaned.match(
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
  );
  if (fqMatch) {
    return fqMatch[1].toLowerCase();
  }

  // Fallback: a bare "local@host" token (e.g. user@localhost), no display name
  const bareMatch = cleaned.match(/(?:^|\s)([^\s<>@]+@[^\s<>@]+)(?:\s|$)/);
  if (bareMatch) {
    return bareMatch[1].toLowerCase();
  }

  // No address found — don't leak display-name text
  return '';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/utils.test.ts -t "cleanEmailAddress"`
Expected: PASS — new tests plus all existing cases (`<test@example.com>`, `John Doe <john@example.com>`, `TEST@EXAMPLE.COM`, `"John Doe" <john@example.com>`, plain, trimmed).

- [ ] **Step 5: Commit**

```bash
git add src/utils.ts src/__tests__/utils.test.ts
git commit -m "fix(utils): return only the address from cleanEmailAddress, never the name (#785)"
```

---

### Task 3: Full-suite regression check

- [ ] **Step 1: Run the entire test suite**

Run: `npm run test:run`
Expected: PASS — confirm the parser/detector tests that depend on `cleanEmailAddress` (sender normalization, contact extraction) remain green with the stricter return contract.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: tsup emits `dist/` with no TypeScript errors.

- [ ] **Step 3: Resolve the Project Hub tasks**

Mark #783 and #785 resolved, referencing the commit hashes.

---

## Self-Review Notes

- **Spec coverage:** #783 → Task 1; #785 → Task 2.
- **Backward compatibility:** `formatFileSize` preserves every existing assertion (the `!bytes || bytes <= 0` guard keeps `0 → '0 B'`; positive small values are unaffected). `cleanEmailAddress` preserves all six existing assertions because the fully-qualified branch handles `<...>` and `Name <addr>` exactly as before; only the previously-unhandled no-dotted-TLD and no-address inputs change.
- **Downstream contract change:** `cleanEmailAddress` may now return `''` where it previously returned name text. `extractDomain` already short-circuits on `''` (returns `''`), and the parsers' sender/contact maps key on the cleaned value, so empty strings are filtered rather than polluting results — verified by the Step 1 full-suite run.
- **Type consistency:** the exported signature `cleanEmailAddress(email: string): string` and `formatFileSize(bytes: number): string` are unchanged, so `src/index.ts` re-exports and all callers compile without changes.
