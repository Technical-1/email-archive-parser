/**
 * Basic Usage Example
 *
 * This example shows how to parse an OLM file and extract emails.
 */

import { parseArchive, OLMParser, MBOXParser } from '@jacobkanfer/olm-parser';

// =============================================================================
// Example 1: Using the convenience function (recommended)
// =============================================================================

async function parseWithConvenienceFunction() {
  // In a browser environment with file input
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

  fileInput?.addEventListener('change', async (event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];

    if (!file) return;

    console.log(`Parsing ${file.name}...`);

    const result = await parseArchive(file, {
      onProgress: (progress) => {
        console.log(`[${progress.stage}] ${progress.progress}% - ${progress.message}`);
      },
    });

    console.log(`
Parsing Complete!
-----------------
Emails: ${result.stats.emailCount}
Contacts: ${result.stats.contactCount}
Calendar Events: ${result.stats.calendarEventCount}
    `);

    // Access the emails
    result.emails.forEach((email, index) => {
      console.log(`${index + 1}. ${email.subject} - from ${email.sender}`);
    });
  });
}

// =============================================================================
// Example 2: Using individual parsers
// =============================================================================

async function parseWithIndividualParsers() {
  // OLM Parser
  const olmParser = new OLMParser();

  // Check file type before parsing
  const file = {} as File; // Your file here

  if (OLMParser.isOLMFile(file)) {
    const result = await olmParser.parse(file, {
      onProgress: (p) => console.log(p.message),
    });
    console.log(`Parsed ${result.emails.length} emails from OLM`);
  }

  // MBOX Parser
  const mboxParser = new MBOXParser();

  if (MBOXParser.isMBOXFile(file)) {
    const result = await mboxParser.parse(file, {
      onProgress: (p) => console.log(p.message),
    });
    console.log(`Parsed ${result.emails.length} emails from MBOX`);
  }
}

// =============================================================================
// Example 3: Node.js usage with file buffer
// =============================================================================

async function parseInNodeJS() {
  // Note: This won't run in browser, only in Node.js
  const { readFileSync } = await import('fs');

  // Read the file as a buffer
  const buffer = readFileSync('/path/to/archive.olm');

  // Parse the buffer
  const parser = new OLMParser();
  const result = await parser.parse(buffer, {
    onProgress: (progress) => {
      process.stdout.write(`\r${progress.message}`);
    },
  });

  console.log(`\nParsed ${result.emails.length} emails`);

  // Save emails to JSON
  const { writeFileSync } = await import('fs');
  writeFileSync('emails.json', JSON.stringify(result.emails, null, 2));
}

// =============================================================================
// Example 4: Filtering and searching emails
// =============================================================================

async function filterEmails() {
  const result = await parseArchive({} as File);

  // Filter emails by sender
  const amazonEmails = result.emails.filter((email) =>
    email.sender.includes('amazon.com')
  );
  console.log(`Found ${amazonEmails.length} emails from Amazon`);

  // Filter emails by date range
  const startDate = new Date('2024-01-01');
  const endDate = new Date('2024-12-31');

  const emailsIn2024 = result.emails.filter((email) => {
    const date = new Date(email.date);
    return date >= startDate && date <= endDate;
  });
  console.log(`Found ${emailsIn2024.length} emails from 2024`);

  // Search by subject
  const searchTerm = 'order confirmation';
  const matchingEmails = result.emails.filter((email) =>
    email.subject.toLowerCase().includes(searchTerm.toLowerCase())
  );
  console.log(`Found ${matchingEmails.length} emails matching "${searchTerm}"`);

  // Get unique senders
  const uniqueSenders = [...new Set(result.emails.map((e) => e.sender))];
  console.log(`Found ${uniqueSenders.length} unique senders`);

  // Group emails by thread
  const threads = new Map<string, typeof result.emails>();
  for (const email of result.emails) {
    if (email.threadId) {
      if (!threads.has(email.threadId)) {
        threads.set(email.threadId, []);
      }
      threads.get(email.threadId)!.push(email);
    }
  }
  console.log(`Found ${threads.size} email threads`);
}

// Run examples
parseWithConvenienceFunction();

