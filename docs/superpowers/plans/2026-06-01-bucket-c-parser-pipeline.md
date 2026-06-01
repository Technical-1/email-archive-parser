# Bucket C — Parser Pipeline Robustness & Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the ingestion pipeline robust: auto-detect MBOX from raw buffers, stop MBOX prose lines from splitting messages (and honor mboxrd `>From` escaping), assign stable `id`s to parsed emails, and remove the OLM double-parse.

**Architecture:** `parseArchive` sniffs magic bytes when the input is not a `File`. `MBOXParser.isFromLine` requires the real envelope shape and `parseEmailFromLines` unescapes `>From`. Both parsers assign sequential `id`s to every email before returning. OLM's DOM XML parsers return on parse success rather than gating on a non-empty result.

**Tech Stack:** TypeScript, Vitest (`environment: 'node'`, so `DOMParser` is undefined in tests unless stubbed), JSZip, tsup.

**Project Hub tasks covered:** #779, #780, #781, #784 (project 48).

**Recommended order:** 781 → 780 → 779 → 784. Build the failing tests first each time; the MBOX boundary change (780) is the riskiest, so land it with regression tests already in place.

**Test runner:** `npx vitest run <path>`.

---

### Task 1: Auto-detect MBOX from Buffer/ArrayBuffer in parseArchive (#781)

**Files:**
- Modify: `src/index.ts` (format determination at lines 121-142; add private helpers below `createParsers`)
- Test: `src/__tests__/index.test.ts` (already imports `parseArchive`, `vi`, `JSZip`)

- [ ] **Step 1: Write the failing test**

Append a new `describe` block at the end of `src/__tests__/index.test.ts`:

```typescript
describe('parseArchive format detection', () => {
  it('parses an MBOX Buffer without a filename', async () => {
    const mbox = [
      'From alice@example.com Mon Jan  1 00:00:00 2024',
      'From: Alice <alice@example.com>',
      'To: bob@example.com',
      'Subject: Hello',
      'Date: Mon, 01 Jan 2024 00:00:00 +0000',
      '',
      'Hi Bob',
      '',
    ].join('\n');

    const result = await parseArchive(Buffer.from(mbox, 'utf-8'));

    expect(result.emails).toHaveLength(1);
    expect(result.emails[0].sender).toBe('alice@example.com');
    expect(result.emails[0].subject).toBe('Hello');
  });

  it('still parses an OLM ArrayBuffer (ZIP) by default', async () => {
    const zip = new JSZip();
    zip.file(
      'com.microsoft.__Messages/message_1.xml',
      '<email><OPFMessageCopySubject>Hi</OPFMessageCopySubject>' +
        '<OPFMessageCopyBody>Body</OPFMessageCopyBody></email>'
    );
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });

    const result = await parseArchive(buffer);
    expect(result.emails.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/index.test.ts -t "format detection"`
Expected: FAIL — the MBOX Buffer is routed to `OLMParser`, which throws `Failed to parse OLM file: ...` from `JSZip.loadAsync`.

- [ ] **Step 3: Write the implementation**

In `src/index.ts`, replace the format-determination and parser-selection block (lines 121-142, from `// Determine file type` through the `if (isOLM ...) { ... } else { ... }`) with:

```typescript
  // Determine which parser to use.
  let useMbox = false;

  if (file instanceof File) {
    const name = file.name.toLowerCase();
    useMbox = name.endsWith('.mbox') || name.endsWith('.mbx');
  } else {
    // No filename available — sniff the leading bytes.
    const head = getFirstBytes(file, 5);
    if (looksLikeMbox(head) && !looksLikeZip(head)) {
      useMbox = true;
    }
    // Otherwise default to OLM (ZIP container).
  }

  // Use appropriate parser
  let result: ParseResult;

  if (useMbox) {
    const parser = new MBOXParser();
    result = await parser.parse(file, options);
  } else {
    const parser = new OLMParser();
    result = await parser.parse(file, options);
  }
```

Then add these module-private helpers at the very bottom of `src/index.ts` (after the `createParsers` function):

```typescript
/**
 * Read the first `n` bytes of a Buffer or ArrayBuffer for format sniffing.
 */
function getFirstBytes(file: Buffer | ArrayBuffer, n: number): Uint8Array {
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(file)) {
    return Uint8Array.from(file.subarray(0, n));
  }
  if (file instanceof ArrayBuffer) {
    return new Uint8Array(file.slice(0, n));
  }
  if (ArrayBuffer.isView(file)) {
    const view = file as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, Math.min(n, view.byteLength));
  }
  return new Uint8Array(0);
}

/** ZIP local-file-header magic: 50 4B 03 04 ("PK\x03\x04") — OLM is a ZIP. */
function looksLikeZip(bytes: Uint8Array): boolean {
  return (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

/** MBOX files begin with the ASCII bytes for "From " (46 72 6f 6d 20). */
function looksLikeMbox(bytes: Uint8Array): boolean {
  return (
    bytes[0] === 0x46 &&
    bytes[1] === 0x72 &&
    bytes[2] === 0x6f &&
    bytes[3] === 0x6d &&
    bytes[4] === 0x20
  );
}
```

(`getFirstBytes`'s parameter type is `Buffer | ArrayBuffer`; the `ArrayBuffer.isView` branch is a defensive runtime fallback and uses a cast.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/index.test.ts`
Expected: PASS — both new tests plus the existing OLM tests.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/__tests__/index.test.ts
git commit -m "fix(index): sniff magic bytes to route MBOX buffers to MBOXParser (#781)"
```

---

### Task 2: Tighten MBOX From-line detection + mboxrd unescape (#780)

**Files:**
- Modify: `src/parsers/mbox.ts` (`isFromLine` at lines 586-591; body extraction in `parseEmailFromLines` at lines 700-702)
- Test: `src/__tests__/parsers/mbox.test.ts` (has a `createMboxEmail` helper)

- [ ] **Step 1: Write the failing tests**

Append a new `describe` block at the end of `src/__tests__/parsers/mbox.test.ts`:

```typescript
describe('MBOX message boundaries', () => {
  it('does not split on a body line that merely starts with "From "', async () => {
    const parser = new MBOXParser();
    const mbox = [
      'From alice@example.com Mon Jan  1 00:00:00 2024',
      'From: Alice <alice@example.com>',
      'Subject: Plans',
      'Date: Mon, 01 Jan 2024 00:00:00 +0000',
      '',
      'Hello,',
      'From Bob, see you Friday at noon.',
      'Bye',
      '',
    ].join('\n');

    const result = await parser.parse(Buffer.from(mbox, 'utf-8'));

    expect(result.emails).toHaveLength(1);
    expect(result.emails[0].body).toContain('see you Friday');
  });

  it('unescapes mboxrd ">From" lines in the body', async () => {
    const parser = new MBOXParser();
    const mbox = [
      'From alice@example.com Mon Jan  1 00:00:00 2024',
      'From: Alice <alice@example.com>',
      'Subject: Quote',
      'Date: Mon, 01 Jan 2024 00:00:00 +0000',
      '',
      '>From the desk of Alice',
      'Regards',
      '',
    ].join('\n');

    const result = await parser.parse(Buffer.from(mbox, 'utf-8'));

    expect(result.emails).toHaveLength(1);
    expect(result.emails[0].body).toContain('From the desk of Alice');
    expect(result.emails[0].body).not.toContain('>From the desk');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/parsers/mbox.test.ts -t "message boundaries"`
Expected: FAIL — the prose case truncates the first email's body before "From Bob…", and the mboxrd case keeps the leading `>`.

- [ ] **Step 3: Tighten isFromLine**

Replace the entire `isFromLine` method (lines 586-591) in `src/parsers/mbox.ts` with:

```typescript
  /**
   * Check if a line is a valid MBOX "From " separator line.
   * A real separator is "From <sender> <Day Mon DD HH:MM:SS YYYY>", so we
   * require a non-space sender token immediately followed by a 3-letter
   * weekday token. This prevents prose lines such as
   * "From Bob, see you Friday" from being treated as message boundaries.
   */
  private isFromLine(line: string): boolean {
    return /^From \S+ (?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) /.test(line);
  }
```

- [ ] **Step 4: Add mboxrd unescaping**

In `parseEmailFromLines`, replace the body extraction (lines 700-702):

```typescript
      // Extract body content
      const bodyLines = lines.slice(bodyStartIndex);
      const rawBody = bodyLines.join('\n');
```

with:

```typescript
      // Extract body content, unescaping mboxrd ">From " lines (strip one '>').
      const bodyLines = lines
        .slice(bodyStartIndex)
        .map((line) => (/^>+From /.test(line) ? line.slice(1) : line));
      const rawBody = bodyLines.join('\n');
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/parsers/mbox.test.ts`
Expected: PASS — both new tests and all existing MBOX tests (their `From ` lines like `From sender@example.com Mon Jan 15 10:30:00 2024` already match the tightened regex).

- [ ] **Step 6: Commit**

```bash
git add src/parsers/mbox.ts src/__tests__/parsers/mbox.test.ts
git commit -m "fix(mbox): require envelope shape for From-lines and unescape >From bodies (#780)"
```

---

### Task 3: Assign sequential ids to parsed emails (#779)

**Files:**
- Modify: `src/parsers/mbox.ts` (add private `assignEmailIds`; call before each `return result` in `parse` and `parseFile`)
- Modify: `src/parsers/olm.ts` (add private `assignEmailIds`; call before `return result` in `parse`)
- Test: `src/__tests__/parsers/mbox.test.ts`, `src/__tests__/parsers/olm.test.ts`

- [ ] **Step 1: Write the failing test (MBOX)**

Append to `src/__tests__/parsers/mbox.test.ts`:

```typescript
describe('MBOX email ids', () => {
  it('assigns sequential ids to parsed emails', async () => {
    const parser = new MBOXParser();
    const mbox = [
      'From a@example.com Mon Jan  1 00:00:00 2024',
      'From: A <a@example.com>',
      'Subject: One',
      'Date: Mon, 01 Jan 2024 00:00:00 +0000',
      '',
      'first',
      'From b@example.com Tue Jan  2 00:00:00 2024',
      'From: B <b@example.com>',
      'Subject: Two',
      'Date: Tue, 02 Jan 2024 00:00:00 +0000',
      '',
      'second',
      '',
    ].join('\n');

    const result = await parser.parse(Buffer.from(mbox, 'utf-8'));

    expect(result.emails).toHaveLength(2);
    expect(result.emails[0].id).toBe(0);
    expect(result.emails[1].id).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/parsers/mbox.test.ts -t "email ids"`
Expected: FAIL — `result.emails[0].id` is `undefined`.

- [ ] **Step 3: Implement in MBOXParser**

Add this private method to `MBOXParser` in `src/parsers/mbox.ts` (place it just below the `reportProgress` method around line 581):

```typescript
  /**
   * Assign a stable sequential id to every parsed email so that detection
   * results (Account.signupEmailId, Purchase.emailId, Subscription.emailIds)
   * can reference their source email.
   */
  private assignEmailIds(result: ParseResult): void {
    result.emails.forEach((email, index) => {
      email.id = index;
    });
  }
```

Now call it before every `return result;` in `parse` and `parseFile`. There are four sites:

1. In `parse`, the streaming branch — after `result.stats.emailCount = count;` (around line 98) and before `return result;`, insert:

```typescript
      this.assignEmailIds(result);
```

2. In `parse`, the large-buffer branch — after `result.stats.emailCount = count;` (around line 110) and before `return result;`, insert:

```typescript
      this.assignEmailIds(result);
```

3. In `parse`, the normal path — immediately before the final `this.reportProgress(onProgress, 'complete', 100, ...)` / `return result;` (around line 196), insert:

```typescript
    this.assignEmailIds(result);
```

4. In `parseFile`, after `result.stats.emailCount = totalEmailsParsed;` (around line 311) and before the final `reportProgress`/`return result;`, insert:

```typescript
    this.assignEmailIds(result);
```

- [ ] **Step 4: Run MBOX test to verify it passes**

Run: `npx vitest run src/__tests__/parsers/mbox.test.ts -t "email ids"`
Expected: PASS.

- [ ] **Step 5: Write the failing test (OLM)**

Append to `src/__tests__/parsers/olm.test.ts` (this file builds OLM zips with JSZip; mirror its existing setup — import `JSZip` and `OLMParser` as the file already does):

```typescript
describe('OLM email ids', () => {
  it('assigns sequential ids to parsed emails', async () => {
    const zip = new JSZip();
    zip.file(
      'com.microsoft.__Messages/message_1.xml',
      '<email><OPFMessageCopySubject>One</OPFMessageCopySubject>' +
        '<OPFMessageCopyBody>first</OPFMessageCopyBody></email>'
    );
    zip.file(
      'com.microsoft.__Messages/message_2.xml',
      '<email><OPFMessageCopySubject>Two</OPFMessageCopySubject>' +
        '<OPFMessageCopyBody>second</OPFMessageCopyBody></email>'
    );
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    const parser = new OLMParser();
    const result = await parser.parse(buffer);

    expect(result.emails.length).toBe(2);
    const ids = result.emails.map((e) => e.id).sort((a, b) => (a! - b!));
    expect(ids).toEqual([0, 1]);
  });
});
```

(If `olm.test.ts` does not yet import `JSZip`, add `import JSZip from 'jszip';` at the top.)

- [ ] **Step 6: Run OLM test to verify it fails**

Run: `npx vitest run src/__tests__/parsers/olm.test.ts -t "email ids"`
Expected: FAIL — ids are `undefined`.

- [ ] **Step 7: Implement in OLMParser**

Add this private method to `OLMParser` in `src/parsers/olm.ts` (place it just below the `reportProgress` method around line 276):

```typescript
  /**
   * Assign a stable sequential id to every parsed email so detection results
   * can reference their source email.
   */
  private assignEmailIds(result: ParseResult): void {
    result.emails.forEach((email, index) => {
      email.id = index;
    });
  }
```

In `parse`, immediately before the final `this.reportProgress(onProgress, 'complete', 100, 'Processing complete!');` / `return result;` (around line 234), insert:

```typescript
      this.assignEmailIds(result);
```

- [ ] **Step 8: Run OLM test to verify it passes**

Run: `npx vitest run src/__tests__/parsers/olm.test.ts -t "email ids"`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/parsers/mbox.ts src/parsers/olm.ts src/__tests__/parsers/mbox.test.ts src/__tests__/parsers/olm.test.ts
git commit -m "fix(parsers): assign sequential ids to parsed emails (#779)"
```

---

### Task 4: Remove OLM redundant manual re-parse (#784)

**Files:**
- Modify: `src/parsers/olm.ts` (`parseContactsXML` at lines 439-505; `parseCalendarXML` at lines 549-629)
- Test: `src/__tests__/parsers/olm.test.ts`

> Note: Vitest runs with `environment: 'node'`, so `DOMParser` is normally undefined and these DOM branches never execute in production tests. The test below stubs a minimal `globalThis.DOMParser` to exercise the success path and asserts the manual fallback is **not** called when DOM parsing succeeds with zero elements.

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/parsers/olm.test.ts`:

```typescript
describe('OLM DOM parse does not double-parse', () => {
  it('does not fall back to manual parsing when DOM succeeds with zero contacts', () => {
    class FakeDoc {
      querySelector() {
        return null; // no <parsererror>
      }
      querySelectorAll() {
        return [] as unknown[]; // valid document, zero <contact> elements
      }
    }
    class FakeDOMParser {
      parseFromString() {
        return new FakeDoc();
      }
    }

    const original = (globalThis as any).DOMParser;
    (globalThis as any).DOMParser = FakeDOMParser as any;
    const manualSpy = vi.spyOn(OLMParser.prototype as any, 'parseContactsManually');

    try {
      const parser = new OLMParser();
      const contacts = (parser as any).parseContactsXML('<contacts></contacts>');
      expect(contacts).toEqual([]);
      expect(manualSpy).not.toHaveBeenCalled();
    } finally {
      manualSpy.mockRestore();
      (globalThis as any).DOMParser = original;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/parsers/olm.test.ts -t "double-parse"`
Expected: FAIL — current code only returns DOM results when `contacts.length > 0`, so the empty result falls through and `parseContactsManually` is called once.

- [ ] **Step 3: Rewrite parseContactsXML**

Replace the entire `parseContactsXML` method (lines 439-505) in `src/parsers/olm.ts` with:

```typescript
  private parseContactsXML(xmlContent: string): Omit<Contact, 'id'>[] {
    if (typeof DOMParser !== 'undefined') {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlContent, 'text/xml');

        if (!doc.querySelector('parsererror')) {
          const contacts: Omit<Contact, 'id'>[] = [];
          const contactElements = doc.querySelectorAll('contact');

          contactElements.forEach((contactElement) => {
            const getTextContent = (selectors: string[]): string => {
              for (const selector of selectors) {
                const element = contactElement.querySelector(selector);
                if (element?.textContent) {
                  return element.textContent.trim();
                }
              }
              return '';
            };

            const displayName = getTextContent([
              'OPFContactCopyDisplayName',
              'displayName',
              'name',
            ]);
            const firstName = getTextContent(['OPFContactCopyFirstName', 'firstName']);
            const lastName = getTextContent(['OPFContactCopyLastName', 'lastName']);
            const phone = getTextContent(['OPFContactCopyPhoneNumbers', 'phone']);

            let email = '';
            const emailList = contactElement.querySelector(
              'OPFContactCopyEmailAddressList, OPFContactCopyDefaultEmailAddress'
            );
            if (emailList) {
              const emailAddr = emailList.querySelector('contactEmailAddress');
              if (emailAddr) {
                email = emailAddr.getAttribute('OPFContactEmailAddressAddress') || '';
              }
            }

            const name =
              displayName ||
              `${firstName} ${lastName}`.trim() ||
              email.split('@')[0] ||
              'Unknown';

            if (email || name !== 'Unknown') {
              contacts.push({
                name,
                email: cleanEmailAddress(email),
                phone: phone || undefined,
                emailCount: 0,
                lastEmailDate: new Date(),
              });
            }
          });

          // DOM parse succeeded — return its result even if empty.
          return contacts;
        }
      } catch {
        // Fall through to manual parsing
      }
    }

    // Manual parsing for Node.js or as fallback
    return this.parseContactsManually(xmlContent);
  }
```

- [ ] **Step 4: Rewrite parseCalendarXML**

Replace the entire `parseCalendarXML` method (lines 549-629) in `src/parsers/olm.ts` with:

```typescript
  private parseCalendarXML(xmlContent: string): Omit<CalendarEvent, 'id'>[] {
    if (typeof DOMParser !== 'undefined') {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlContent, 'text/xml');

        if (!doc.querySelector('parsererror')) {
          const events: Omit<CalendarEvent, 'id'>[] = [];
          const appointmentElements = doc.querySelectorAll('appointment');

          appointmentElements.forEach((appointmentElement) => {
            const getTextContent = (selectors: string[]): string => {
              for (const selector of selectors) {
                const element = appointmentElement.querySelector(selector);
                if (element?.textContent) {
                  return element.textContent.trim();
                }
              }
              return '';
            };

            const title = getTextContent([
              'OPFCalendarEventCopySummary',
              'OPFCalendarEventCopySubject',
              'summary',
              'title',
            ]);
            const startDateStr = getTextContent([
              'OPFCalendarEventCopyStartTime',
              'startTime',
            ]);
            const endDateStr = getTextContent([
              'OPFCalendarEventCopyEndTime',
              'endTime',
            ]);
            const location = getTextContent([
              'OPFCalendarEventCopyLocation',
              'location',
            ]);
            const description = getTextContent([
              'OPFCalendarEventCopyBody',
              'OPFCalendarEventCopyDescription',
              'description',
            ]);
            const organizer = getTextContent([
              'OPFCalendarEventCopyOrganizer',
              'organizer',
            ]);
            const isAllDayStr = getTextContent([
              'OPFCalendarEventGetIsAllDayEvent',
              'isAllDay',
            ]);

            if (!title) return;

            const startDate = startDateStr ? new Date(startDateStr) : new Date();
            const endDate = endDateStr
              ? new Date(endDateStr)
              : new Date(startDate.getTime() + 3600000);

            events.push({
              title,
              startDate: isNaN(startDate.getTime()) ? new Date() : startDate,
              endDate: isNaN(endDate.getTime()) ? new Date() : endDate,
              location: location || undefined,
              attendees: organizer ? [organizer] : [],
              description: description || undefined,
              isAllDay: isAllDayStr === '1' || isAllDayStr?.toLowerCase() === 'true',
              reminder: false,
            });
          });

          // DOM parse succeeded — return its result even if empty.
          return events;
        }
      } catch {
        // Fall through to manual parsing
      }
    }

    // Manual parsing for Node.js or as fallback
    return this.parseCalendarManually(xmlContent);
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/__tests__/parsers/olm.test.ts -t "double-parse"`
Expected: PASS — manual fallback is not invoked when DOM parsing succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/parsers/olm.ts src/__tests__/parsers/olm.test.ts
git commit -m "perf(olm): return DOM XML parse on success instead of re-parsing manually (#784)"
```

---

### Task 5: Full-suite regression check

- [ ] **Step 1: Run the entire test suite**

Run: `npm run test:run`
Expected: PASS — all parser, detector (now with real `id`s), and index tests green.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: tsup emits `dist/` with no TypeScript errors.

- [ ] **Step 3: Resolve the Project Hub tasks**

Mark #779, #780, #781, #784 resolved, referencing the commit hashes.

---

## Self-Review Notes

- **Spec coverage:** #781 → Task 1; #780 → Task 2; #779 → Task 3; #784 → Task 4.
- **Type consistency:** `assignEmailIds(result: ParseResult): void` is defined and called identically in both parsers. `getFirstBytes`/`looksLikeZip`/`looksLikeMbox` are defined once in `index.ts` and referenced in the routing block. The `parse`/`parseFile` public signatures are unchanged.
- **Risk note (Task 2):** `isFromLine` governs message boundaries; the tightened regex still matches every `From ` line used by the existing fixtures (`From sender@example.com Mon Jan 15 …`) and Thunderbird's `From - <date>` form (sender token `-`). `findLastFromLine` calls `isFromLine`, so it inherits the fix automatically.
- **Coverage note (Task 3):** `id` assignment covers the standard entry points `parse()` and `parseFile()`. The low-level streaming APIs (`parseStreaming`, `parseLargeBuffer`) invoked directly with a custom `onBatch` remain the caller's responsibility — documented, not silently capped.
- **Environment note (Task 4):** the DOM branches only run when `DOMParser` is defined (browsers); the Node test stubs it to assert the no-double-parse behavior.
