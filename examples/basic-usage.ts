/**
 * Basic Usage Example
 *
 * This example shows how to parse email archives (OLM and MBOX) and extract emails.
 * 
 * Supported formats:
 * - OLM: Outlook for Mac exports
 * - MBOX: Gmail Takeout, Thunderbird, Apple Mail, and other email clients
 */

import { parseArchive, OLMParser, MBOXParser } from '@technical-1/email-archive-parser';

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
  const { readFileSync, writeFileSync } = await import('fs');

  // Example with OLM file
  const olmBuffer = readFileSync('/path/to/archive.olm');
  const olmParser = new OLMParser();
  const olmResult = await olmParser.parse(olmBuffer, {
    onProgress: (progress) => {
      process.stdout.write(`\r[OLM] ${progress.message}`);
    },
  });
  console.log(`\nParsed ${olmResult.emails.length} emails from OLM`);

  // Example with MBOX file (Gmail Takeout, Thunderbird, etc.)
  const mboxBuffer = readFileSync('/path/to/gmail-export.mbox');
  const mboxParser = new MBOXParser();
  const mboxResult = await mboxParser.parse(mboxBuffer, {
    onProgress: (progress) => {
      process.stdout.write(`\r[MBOX] ${progress.message}`);
    },
  });
  console.log(`\nParsed ${mboxResult.emails.length} emails from MBOX`);

  // MBOX files from Gmail include labels
  const gmailLabels = new Set<string>();
  mboxResult.emails.forEach((email) => {
    email.labels?.forEach((label) => gmailLabels.add(label));
  });
  console.log(`Found ${gmailLabels.size} unique Gmail labels`);

  // Save emails to JSON
  writeFileSync('olm-emails.json', JSON.stringify(olmResult.emails, null, 2));
  writeFileSync('mbox-emails.json', JSON.stringify(mboxResult.emails, null, 2));
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

