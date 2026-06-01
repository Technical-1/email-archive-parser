# Bucket B — Character-Encoding Decode Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decode quoted-printable bodies and RFC 2047 base64 headers as proper UTF-8 instead of byte-per-character Latin-1, eliminating mojibake on all non-ASCII email.

**Architecture:** Introduce two module-private byte→string helpers in `src/utils.ts` (`utf8BytesToString`, `base64ToUtf8`) that use `TextDecoder('utf-8')` in the browser and a `Buffer` fallback in Node. Rewrite `decodeQuotedPrintable` to accumulate raw bytes before decoding, and route `decodeHeaderValue`'s `B` branch through `base64ToUtf8`.

**Tech Stack:** TypeScript, Vitest, tsup. `TextDecoder` is global in modern browsers and Node ≥ 11; `Buffer` is the Node fallback.

**Project Hub tasks covered:** #776, #777 (project 48).

**Test runner:** `npx vitest run <path>`.

---

### Task 1: Add shared UTF-8 byte-decoding helpers

**Files:**
- Modify: `src/utils.ts` (add two non-exported helpers near the top, after the file's doc comment, before `cleanEmailAddress`)
- Test: covered indirectly by Tasks 2 and 3 (helpers are module-private, not part of the public API)

- [ ] **Step 1: Add the helpers**

Insert immediately after the opening doc comment block (before `export function cleanEmailAddress`) in `src/utils.ts`:

```typescript
/**
 * Decode a UTF-8 byte array to a string, using TextDecoder where available
 * and falling back to Node's Buffer. Centralizes correct multi-byte handling.
 */
function utf8BytesToString(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(bytes);
  }
  // Node.js fallback
  return Buffer.from(bytes).toString('utf-8');
}

/**
 * Decode a base64 string whose decoded bytes are UTF-8 text.
 * `atob` yields a Latin-1 string (one char per byte), so we re-read those
 * char codes as bytes and UTF-8 decode them. In Node, Buffer handles it directly.
 */
function base64ToUtf8(str: string): string {
  if (typeof atob !== 'undefined') {
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i) & 0xff;
    }
    return utf8BytesToString(bytes);
  }
  return Buffer.from(str, 'base64').toString('utf-8');
}
```

- [ ] **Step 2: Confirm the project still builds**

Run: `npm run build`
Expected: tsup succeeds. (The helpers are unused for now; TypeScript with the project's config does not error on unused module-private functions, but if a no-unused-locals lint blocks it, proceed directly to Task 2/3 which consume them, then build.)

- [ ] **Step 3: Commit**

```bash
git add src/utils.ts
git commit -m "feat(utils): add UTF-8 byte-decoding helpers"
```

---

### Task 2: Fix decodeQuotedPrintable multi-byte decoding (#776)

**Files:**
- Modify: `src/utils.ts` (`decodeQuotedPrintable` at lines 152-163)
- Test: `src/__tests__/utils.test.ts` (existing `describe('decodeQuotedPrintable', ...)` at lines 231-254)

- [ ] **Step 1: Update the existing test and add UTF-8 cases**

In `src/__tests__/utils.test.ts`, replace the existing `it('should decode multiple encoded chars', ...)` block (lines 244-249, including its outdated comment) with:

```typescript
  it('should decode literal escaped characters', () => {
    expect(decodeQuotedPrintable('=3D')).toBe('=');
    expect(decodeQuotedPrintable('=20')).toBe(' ');
  });

  it('should decode multi-byte UTF-8 sequences', () => {
    // =C3=A9 is UTF-8 for 'é'
    expect(decodeQuotedPrintable('caf=C3=A9')).toBe('café');
    // =E2=82=AC is UTF-8 for '€'
    expect(decodeQuotedPrintable('=E2=82=AC')).toBe('€');
  });

  it('should leave a trailing lone = untouched', () => {
    expect(decodeQuotedPrintable('price=')).toBe('price=');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/utils.test.ts -t "decodeQuotedPrintable"`
Expected: FAIL — `caf=C3=A9` decodes to `cafÃ©` instead of `café`.

- [ ] **Step 3: Write the implementation**

Replace the entire `decodeQuotedPrintable` function (lines 152-163) in `src/utils.ts` with:

```typescript
/**
 * Decode quoted-printable encoding into UTF-8 text.
 * Soft line breaks are removed, then every `=XX` sequence and literal
 * character is accumulated as raw bytes and decoded together as UTF-8,
 * so multi-byte sequences (e.g. `=C3=A9` -> 'é') decode correctly.
 * @param str - Quoted-printable encoded string
 * @returns Decoded string
 */
export function decodeQuotedPrintable(str: string): string {
  // Remove soft line breaks first ("=\n" or "=\r\n")
  const cleaned = str.replace(/=\r?\n/g, '');

  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (char === '=' && i + 2 < cleaned.length) {
      const hex = cleaned.substring(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    // Literal character — quoted-printable literals are ASCII, but mask to a
    // byte defensively so any stray code point stays in range.
    bytes.push(char.charCodeAt(0) & 0xff);
  }

  return utf8BytesToString(new Uint8Array(bytes));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/utils.test.ts -t "decodeQuotedPrintable"`
Expected: PASS — including the `café` and `€` cases, and existing `Hello=20World` / soft-break / pass-through cases.

- [ ] **Step 5: Commit**

```bash
git add src/utils.ts src/__tests__/utils.test.ts
git commit -m "fix(utils): decode quoted-printable as UTF-8 byte stream (#776)"
```

---

### Task 3: Fix decodeHeaderValue base64 mojibake (#777)

**Files:**
- Modify: `src/utils.ts` (`decodeHeaderValue` at lines 165-191)
- Test: `src/__tests__/utils.test.ts` (existing `describe('decodeHeaderValue', ...)` at lines 256-276)

- [ ] **Step 1: Add a failing UTF-8 base64 header test**

Append inside the existing `describe('decodeHeaderValue', ...)` block in `src/__tests__/utils.test.ts`:

```typescript
  it('should decode a UTF-8 base64 encoded-word', () => {
    // "café" UTF-8 base64 is "Y2Fmw6k="
    const result = decodeHeaderValue('=?UTF-8?B?Y2Fmw6k=?=');
    expect(result).toBe('café');
  });

  it('should decode a UTF-8 quoted-printable encoded-word', () => {
    const result = decodeHeaderValue('=?UTF-8?Q?caf=C3=A9?=');
    expect(result).toBe('café');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/utils.test.ts -t "decodeHeaderValue"`
Expected: FAIL — the base64 `café` case yields `cafÃ©` in environments where `atob` is defined.

- [ ] **Step 3: Write the implementation**

Replace the entire `decodeHeaderValue` function (lines 165-191) in `src/utils.ts` with:

```typescript
/**
 * Decode an RFC 2047 encoded header value.
 * Handles the `=?charset?encoding?text?=` format for both `B` (base64)
 * and `Q` (quoted-printable) encodings, decoding the payload as UTF-8.
 * @param str - Encoded header value
 * @returns Decoded string
 */
export function decodeHeaderValue(str: string): string {
  return str.replace(
    /=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi,
    (_, _charset, encoding, text) => {
      try {
        if (encoding.toUpperCase() === 'B') {
          // Base64-encoded UTF-8
          return base64ToUtf8(text);
        }
        // Quoted-printable: underscores represent spaces in encoded words
        return decodeQuotedPrintable(text.replace(/_/g, ' '));
      } catch {
        return text;
      }
    }
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/utils.test.ts -t "decodeHeaderValue"`
Expected: PASS — including the new UTF-8 cases and the existing `Hello` / `Hello World` / multi-part cases.

- [ ] **Step 5: Commit**

```bash
git add src/utils.ts src/__tests__/utils.test.ts
git commit -m "fix(utils): decode base64 encoded-word headers as UTF-8 (#777)"
```

---

### Task 4: Full-suite regression check

- [ ] **Step 1: Run the entire test suite**

Run: `npm run test:run`
Expected: PASS — note that `src/parsers/mbox.ts` consumes `decodeQuotedPrintable` and `decodeHeaderValue`, so MBOX parser tests exercise these paths too.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: tsup emits `dist/` with no TypeScript errors and no unused-symbol failures (both helpers are now referenced).

- [ ] **Step 3: Resolve the Project Hub tasks**

Mark #776 and #777 resolved, referencing the commit hashes.

---

## Self-Review Notes

- **Spec coverage:** #776 → Task 2; #777 → Task 3; shared helpers → Task 1.
- **Backward compatibility:** existing assertions preserved — `decodeQuotedPrintable('=3D')` → `'='`, `('=20')` → `' '`, soft-break removal, plain pass-through; `decodeHeaderValue` `Hello`/`Hello World`/multi-part. The previously-outdated test comment (lines 245-246) is removed in Task 2 Step 1.
- **Type consistency:** `utf8BytesToString(bytes: Uint8Array): string` and `base64ToUtf8(str: string): string` are referenced exactly as defined. `decodeQuotedPrintable` and `decodeHeaderValue` keep their existing exported signatures, so `src/index.ts` re-exports and `mbox.ts` imports are unaffected.
- **Out of scope (documented limitation):** non-UTF-8 charsets in encoded words (e.g. `ISO-8859-1`) are still decoded as UTF-8; current behavior already assumes UTF-8, so this is no regression. A future task could honor the `charset` group.
