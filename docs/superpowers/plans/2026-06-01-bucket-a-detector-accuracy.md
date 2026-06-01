# Bucket A — Detector Matching & Scoring Accuracy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the account, subscription, and newsletter detectors classify senders accurately and efficiently.

**Architecture:** Replace the per-detector ad-hoc domain matching with one anchored `matchKnownDomain` helper (kills false-positive substring matches), normalize subscription amounts to a true monthly figure, and stop the newsletter batch from running detection twice per sender.

**Tech Stack:** TypeScript, Vitest (`describe`/`it`/`expect`, `globals: true`), tsup build.

**Project Hub tasks covered:** #774, #775, #778, #782 (project 48).

**Test runner:** `npx vitest run <path>` (single run, no watch).

---

### Task 1: Shared anchored domain matcher

**Files:**
- Create: `src/detectors/domainMatch.ts`
- Test: `src/__tests__/detectors/domainMatch.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/detectors/domainMatch.test.ts
import { describe, it, expect } from 'vitest';
import { matchKnownDomain } from '../../detectors/domainMatch';

const registry = {
  'x.com': 'X',
  'box.com': 'Box',
  'max.com': 'Max',
  'amazon.com': 'Amazon',
};

describe('matchKnownDomain', () => {
  it('returns null for empty domain', () => {
    expect(matchKnownDomain('', registry)).toBeNull();
  });

  it('matches an exact domain', () => {
    expect(matchKnownDomain('x.com', registry)).toBe('X');
  });

  it('matches a subdomain via suffix', () => {
    expect(matchKnownDomain('mail.amazon.com', registry)).toBe('Amazon');
  });

  it('does NOT match unrelated domains that merely contain a base name', () => {
    expect(matchKnownDomain('fedex.com', registry)).toBeNull();
    expect(matchKnownDomain('dropbox.com', registry)).toBeNull();
    expect(matchKnownDomain('mailmax.com', registry)).toBeNull();
    expect(matchKnownDomain('amazonaws.com', registry)).toBeNull();
  });

  it('does not treat the registry domain as a substring needle', () => {
    expect(matchKnownDomain('notamazon.com', registry)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/detectors/domainMatch.test.ts`
Expected: FAIL — `Failed to resolve import "../../detectors/domainMatch"`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/detectors/domainMatch.ts
/**
 * OLM Parser - Anchored domain matching helper
 * @packageDocumentation
 */

/**
 * Look up a domain in a registry keyed by registrable domain.
 * Matches only on exact equality or a true subdomain suffix
 * (`domain === key` or `domain.endsWith('.' + key)`), never on a
 * bare substring. This avoids false positives such as `fedex.com`
 * matching `x.com` or `amazonaws.com` matching `amazon.com`.
 *
 * @param domain - The lowercased sender domain to look up
 * @param registry - Map of known registrable domains to values
 * @returns The matched value, or null if no anchored match exists
 */
export function matchKnownDomain<T>(
  domain: string,
  registry: Record<string, T>
): T | null {
  if (!domain) return null;

  if (Object.prototype.hasOwnProperty.call(registry, domain)) {
    return registry[domain];
  }

  for (const [knownDomain, value] of Object.entries(registry)) {
    if (domain === knownDomain || domain.endsWith('.' + knownDomain)) {
      return value;
    }
  }

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/detectors/domainMatch.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/detectors/domainMatch.ts src/__tests__/detectors/domainMatch.test.ts
git commit -m "feat(detectors): add anchored matchKnownDomain helper"
```

---

### Task 2: Fix account detector false-positive matching (#774)

**Files:**
- Modify: `src/detectors/account.ts` (imports near line 6; `findKnownService` at lines 320-339)
- Test: `src/__tests__/detectors/account.test.ts`

- [ ] **Step 1: Write the failing test**

Append inside the top-level `describe('AccountDetector', ...)` block in `src/__tests__/detectors/account.test.ts` (the file already defines a `createEmail` helper):

```typescript
  describe('domain matching', () => {
    it('does not classify fedex.com as X (x.com substring)', () => {
      const detector = new AccountDetector();
      const email = createEmail({
        subject: 'Welcome to your account',
        sender: 'noreply@fedex.com',
        body: 'Thanks for signing up! Please verify your email address.',
      });

      const result = detector.detect(email);
      expect(result.data?.serviceName).not.toBe('X');
    });

    it('does not classify dropbox.com as Box', () => {
      const detector = new AccountDetector();
      const email = createEmail({
        subject: 'Welcome to Dropbox!',
        sender: 'no-reply@dropbox.com',
        body: 'Thanks for signing up.',
      });

      const result = detector.detect(email);
      expect(result.data?.serviceName).toBe('Dropbox');
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/detectors/account.test.ts -t "domain matching"`
Expected: FAIL — `fedex.com` currently resolves to `X` via the substring loop.

- [ ] **Step 3: Write minimal implementation**

Add the import at the top of `src/detectors/account.ts` (alongside the existing `import` lines):

```typescript
import { matchKnownDomain } from './domainMatch';
```

Replace the entire `findKnownService` method (lines 320-339) with:

```typescript
  private findKnownService(domain: string): { name: string; type: ServiceType } | null {
    return matchKnownDomain(domain, this.knownServices);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/detectors/account.test.ts`
Expected: PASS (existing tests + the two new ones).

- [ ] **Step 5: Commit**

```bash
git add src/detectors/account.ts src/__tests__/detectors/account.test.ts
git commit -m "fix(detectors): anchor account domain matching to stop false positives (#774)"
```

---

### Task 3: Fix subscription detector substring matching (#775)

**Files:**
- Modify: `src/detectors/subscription.ts` (imports at lines 6-13; `findKnownSubscription` at lines 219-233)
- Test: `src/__tests__/detectors/subscription.test.ts`

- [ ] **Step 1: Write the failing test**

Append a new `describe` block inside the top-level subscription describe in `src/__tests__/detectors/subscription.test.ts` (reuse the file's existing `createEmail` helper):

```typescript
  describe('domain matching', () => {
    it('does not classify mailmax.com as Max', () => {
      const detector = new SubscriptionDetector();
      const email = createEmail({
        subject: 'Your monthly subscription renewal',
        sender: 'billing@mailmax.com',
        body: 'Your subscription has renewed. Next billing date: 2024-02-01. Recurring charge: $9.99',
      });

      const result = detector.detect(email);
      expect(result.serviceName).not.toBe('Max');
    });

    it('does not classify amazonaws.com as Amazon Prime', () => {
      const detector = new SubscriptionDetector();
      const email = createEmail({
        subject: 'Your monthly subscription receipt',
        sender: 'billing@amazonaws.com',
        body: 'Recurring payment: $5.00. Auto-renews on the 1st. Next billing date: soon.',
      });

      const result = detector.detect(email);
      expect(result.serviceName).not.toBe('Amazon Prime');
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/detectors/subscription.test.ts -t "domain matching"`
Expected: FAIL — `mailmax.com` resolves to `Max`, `amazonaws.com` resolves to `Amazon Prime`.

- [ ] **Step 3: Write minimal implementation**

Add the import at the top of `src/detectors/subscription.ts`:

```typescript
import { matchKnownDomain } from './domainMatch';
```

Replace the entire `findKnownSubscription` method (lines 219-233) with:

```typescript
  private findKnownSubscription(
    domain: string
  ): { name: string; category: SubscriptionCategory } | null {
    return matchKnownDomain(domain, this.knownSubscriptions);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/detectors/subscription.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/detectors/subscription.ts src/__tests__/detectors/subscription.test.ts
git commit -m "fix(detectors): anchor subscription domain matching (#775)"
```

---

### Task 4: Normalize subscription monthlyAmount (#778)

**Files:**
- Modify: `src/detectors/subscription.ts` (`detectBatch` at lines 181-217; add a module-private helper above the class)
- Test: `src/__tests__/detectors/subscription.test.ts`

- [ ] **Step 1: Write the failing test**

Append a new `describe` block in `src/__tests__/detectors/subscription.test.ts`:

```typescript
  describe('monthlyAmount normalization', () => {
    it('normalizes a yearly amount to monthly', () => {
      const detector = new SubscriptionDetector();
      const email = createEmail({
        id: 1,
        subject: 'Your annual subscription renewal',
        sender: 'billing@nytimes.com',
        body: 'Your yearly subscription has renewed for $120.00 per year. Auto-renews annually.',
      });

      const [sub] = detector.detectBatch([email]);
      expect(sub).toBeDefined();
      expect(sub.frequency).toBe('yearly');
      // $120/year -> $10/month
      expect(sub.monthlyAmount).toBeCloseTo(10, 2);
    });

    it('leaves a monthly amount unchanged', () => {
      const detector = new SubscriptionDetector();
      const email = createEmail({
        id: 2,
        subject: 'Your monthly subscription receipt',
        sender: 'billing@spotify.com',
        body: 'Your monthly subscription has renewed for $9.99 per month.',
      });

      const [sub] = detector.detectBatch([email]);
      expect(sub).toBeDefined();
      expect(sub.monthlyAmount).toBeCloseTo(9.99, 2);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/detectors/subscription.test.ts -t "monthlyAmount normalization"`
Expected: FAIL — yearly case yields `monthlyAmount` of 120 instead of 10.

- [ ] **Step 3: Write minimal implementation**

Add this module-private helper just above the `export class SubscriptionDetector {` line in `src/detectors/subscription.ts`:

```typescript
/**
 * Convert a billed amount to an equivalent monthly figure so subscriptions
 * with different billing frequencies can be compared on the same basis.
 */
function normalizeToMonthly(
  amount: number,
  frequency: SubscriptionFrequency
): number {
  let monthly: number;
  switch (frequency) {
    case 'yearly':
      monthly = amount / 12;
      break;
    case 'weekly':
      monthly = (amount * 52) / 12;
      break;
    case 'monthly':
    default:
      monthly = amount;
      break;
  }
  return Math.round(monthly * 100) / 100;
}
```

In `detectBatch`, replace the `monthlyAmount` line in the `subscriptionMap.set(...)` object (currently line 192) with:

```typescript
            monthlyAmount: normalizeToMonthly(
              result.amount || 0,
              result.frequency || 'monthly'
            ),
```

Then in the `else` branch where an existing subscription is updated (currently lines 205-210), replace:

```typescript
            if (result.amount && result.amount > 0) {
              existing.monthlyAmount = result.amount;
            }
            if (result.frequency) {
              existing.frequency = result.frequency;
            }
```

with:

```typescript
            if (result.frequency) {
              existing.frequency = result.frequency;
            }
            if (result.amount && result.amount > 0) {
              existing.monthlyAmount = normalizeToMonthly(
                result.amount,
                result.frequency || existing.frequency
              );
            }
```

(Order matters: update `frequency` first so the amount is normalized against the latest frequency.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/detectors/subscription.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/detectors/subscription.ts src/__tests__/detectors/subscription.test.ts
git commit -m "fix(detectors): normalize subscription monthlyAmount by frequency (#778)"
```

---

### Task 5: Stop newsletter detectBatch double-detecting (#782)

**Files:**
- Modify: `src/detectors/newsletter.ts` (`detectBatch` at lines 169-215)
- Test: `src/__tests__/detectors/newsletter.test.ts`

- [ ] **Step 1: Write the failing test**

Append a new `describe` block in `src/__tests__/detectors/newsletter.test.ts` (reuse the file's existing `createEmail` helper):

```typescript
  describe('detectBatch efficiency', () => {
    it('runs detect() at most once per email', () => {
      const detector = new NewsletterDetector();
      const detectSpy = vi.spyOn(detector, 'detect');

      const emails = [
        createEmail({
          id: 1,
          sender: 'news@promo.example.com',
          subject: 'Weekly digest',
          body: 'unsubscribe here. manage your email preferences. view in browser.',
          date: new Date('2024-01-01'),
        }),
        createEmail({
          id: 2,
          sender: 'news@promo.example.com',
          subject: 'Weekly digest',
          body: 'unsubscribe here. manage your email preferences. view in browser.',
          date: new Date('2024-01-08'),
        }),
      ];

      detector.detectBatch(emails);
      expect(detectSpy).toHaveBeenCalledTimes(emails.length);
    });
  });
```

Ensure `vi` is imported at the top of the test file. If the first import line is `import { describe, it, expect } from 'vitest';`, change it to:

```typescript
import { describe, it, expect, vi } from 'vitest';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/detectors/newsletter.test.ts -t "detectBatch efficiency"`
Expected: FAIL — `detect` is called 3 times (2 in the loop + 1 re-detect of the latest email).

- [ ] **Step 3: Write minimal implementation**

Replace the body of `detectBatch` (lines 169-215) in `src/detectors/newsletter.ts` with:

```typescript
  detectBatch(emails: Email[]): Newsletter[] {
    const senderMap = new Map<
      string,
      {
        entries: { email: Email; result: NewsletterDetectionResult }[];
        unsubscribeLinks: Set<string>;
      }
    >();

    for (const email of emails) {
      const result = this.detect(email);
      if (result.isNewsletter || result.isPromotional) {
        const sender = email.sender;

        if (!senderMap.has(sender)) {
          senderMap.set(sender, { entries: [], unsubscribeLinks: new Set() });
        }

        const data = senderMap.get(sender)!;
        data.entries.push({ email, result });

        if (result.unsubscribeLink) {
          data.unsubscribeLinks.add(result.unsubscribeLink);
        }
      }
    }

    const newsletters: Newsletter[] = [];

    senderMap.forEach((data, sender) => {
      const sortedEntries = data.entries.sort(
        (a, b) => new Date(b.email.date).getTime() - new Date(a.email.date).getTime()
      );

      const latest = sortedEntries[0];
      const unsubscribeLinks = Array.from(data.unsubscribeLinks);
      const frequency = this.calculateFrequency(sortedEntries.map((e) => e.email));

      newsletters.push({
        senderEmail: sender,
        senderName: latest.email.senderName || this.extractNameFromEmail(sender),
        emailCount: data.entries.length,
        lastEmailDate: new Date(latest.email.date),
        frequency,
        unsubscribeLink: unsubscribeLinks[0],
        isPromotional: latest.result.isPromotional,
      });
    });

    return newsletters;
  }
```

(`NewsletterDetectionResult` is already imported at line 6 of `newsletter.ts`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/detectors/newsletter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/detectors/newsletter.ts src/__tests__/detectors/newsletter.test.ts
git commit -m "perf(detectors): cache newsletter detection result per email (#782)"
```

---

### Task 6: Full-suite regression check

- [ ] **Step 1: Run the entire test suite**

Run: `npm run test:run`
Expected: PASS — all detector, parser, and util tests green.

- [ ] **Step 2: Build to confirm types compile**

Run: `npm run build`
Expected: tsup emits `dist/` with no TypeScript errors.

- [ ] **Step 3: Resolve the Project Hub tasks**

Mark #774, #775, #778, #782 resolved (via `hub_resolve_task` or the board), referencing the commit hashes.

---

## Self-Review Notes

- **Spec coverage:** #774 → Task 2; #775 → Task 3; #778 → Task 4; #782 → Task 5. Shared helper (Task 1) underpins 774/775.
- **Type consistency:** `matchKnownDomain<T>` is used with `{name,type}` (account) and `{name,category}` (subscription) value types — generic `T` covers both. `normalizeToMonthly` takes `SubscriptionFrequency` (already imported in subscription.ts). `NewsletterDetectionResult` already imported in newsletter.ts.
- **Note:** `purchase.ts` `findKnownMerchant` is already anchored (no substring loop) so it is intentionally left unchanged; optionally refactor it to call `matchKnownDomain` later for DRY, but that is out of scope here.
