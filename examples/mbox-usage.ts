/**
 * MBOX Usage Examples
 *
 * This example shows how to parse MBOX files, which are commonly exported from:
 * - Gmail (via Google Takeout)
 * - Thunderbird
 * - Apple Mail
 * - Other email clients
 */

import {
  parseArchive,
  MBOXParser,
  AccountDetector,
  PurchaseDetector,
} from '@jacobkanfer/email-archive-parser';

// =============================================================================
// Example 1: Basic MBOX parsing (Browser)
// =============================================================================

async function parseGmailExport() {
  // In a browser environment with file input
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

  fileInput?.addEventListener('change', async (event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];

    if (!file) return;

    // Check if it's an MBOX file
    if (!MBOXParser.isMBOXFile(file)) {
      console.error('Please select an MBOX file (.mbox)');
      return;
    }

    console.log(`Parsing Gmail export: ${file.name}...`);

    const result = await parseArchive(file, {
      onProgress: (progress) => {
        console.log(`[${progress.stage}] ${progress.progress}% - ${progress.message}`);
      },
    });

    console.log(`
Parsing Complete!
-----------------
Emails: ${result.stats.emailCount}
    `);

    // Access Gmail labels
    result.emails.forEach((email) => {
      if (email.labels && email.labels.length > 0) {
        console.log(`📧 ${email.subject}`);
        console.log(`   Labels: ${email.labels.join(', ')}`);
      }
    });
  });
}

// =============================================================================
// Example 2: Using MBOXParser directly with Gmail labels
// =============================================================================

async function parseWithGmailLabels(file: File) {
  const parser = new MBOXParser();

  const result = await parser.parse(file, {
    onProgress: (p) => console.log(p.message),
  });

  // Group emails by Gmail labels
  const labelGroups = new Map<string, typeof result.emails>();

  for (const email of result.emails) {
    if (email.labels) {
      for (const label of email.labels) {
        if (!labelGroups.has(label)) {
          labelGroups.set(label, []);
        }
        labelGroups.get(label)!.push(email);
      }
    }
  }

  console.log('\n📁 Emails by Gmail Label:');
  labelGroups.forEach((emails, label) => {
    console.log(`   ${label}: ${emails.length} emails`);
  });

  // Find starred emails
  const starred = result.emails.filter(
    (e) => e.labels?.includes('Starred') || e.labels?.includes('STARRED')
  );
  console.log(`\n⭐ Starred emails: ${starred.length}`);

  // Find important emails
  const important = result.emails.filter(
    (e) => e.labels?.includes('Important') || e.labels?.includes('IMPORTANT')
  );
  console.log(`❗ Important emails: ${important.length}`);

  // Find inbox vs archived
  const inbox = result.emails.filter((e) => e.labels?.includes('Inbox') || e.labels?.includes('INBOX'));
  const archived = result.emails.filter(
    (e) => !e.labels?.includes('Inbox') && !e.labels?.includes('INBOX')
  );
  console.log(`📥 Inbox: ${inbox.length}, 📦 Archived: ${archived.length}`);

  return result;
}

// =============================================================================
// Example 3: Node.js - Parse large MBOX file with streaming
// =============================================================================

async function parseInNodeJS() {
  // Note: This won't run in browser, only in Node.js
  const { readFileSync } = await import('fs');

  // Read the file as a buffer
  const buffer = readFileSync('/path/to/gmail-export.mbox');

  console.log(`File size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

  // Parse the buffer
  const parser = new MBOXParser();
  const result = await parser.parse(buffer, {
    onProgress: (progress) => {
      process.stdout.write(`\r${progress.message}`);
    },
  });

  console.log(`\nParsed ${result.emails.length} emails`);

  // Save emails to JSON
  const { writeFileSync } = await import('fs');
  writeFileSync('gmail-emails.json', JSON.stringify(result.emails, null, 2));

  // Create a summary by sender domain
  const senderDomains = new Map<string, number>();
  for (const email of result.emails) {
    const match = email.sender.match(/@([^>]+)/);
    if (match) {
      const domain = match[1].toLowerCase();
      senderDomains.set(domain, (senderDomains.get(domain) || 0) + 1);
    }
  }

  // Sort by count
  const sorted = [...senderDomains.entries()].sort((a, b) => b[1] - a[1]);

  console.log('\n📊 Top 10 sender domains:');
  sorted.slice(0, 10).forEach(([domain, count]) => {
    console.log(`   ${domain}: ${count} emails`);
  });
}

// =============================================================================
// Example 4: Streaming MBOX parsing for very large files
// =============================================================================

async function streamLargeMBOX(file: File) {
  const parser = new MBOXParser();

  // For very large files, you can process in chunks
  // The parser handles this internally, but you can monitor progress
  let lastProgress = 0;

  const result = await parser.parse(file, {
    onProgress: (progress) => {
      // Only log every 10% to avoid console spam
      if (progress.progress - lastProgress >= 10) {
        console.log(`Progress: ${progress.progress}% - ${progress.message}`);
        lastProgress = progress.progress;
      }
    },
  });

  console.log(`\n✅ Completed! Parsed ${result.emails.length} emails`);

  return result;
}

// =============================================================================
// Example 5: Gmail Takeout specific analysis
// =============================================================================

async function analyzeGmailTakeout(file: File) {
  const parser = new MBOXParser();
  const result = await parser.parse(file);

  console.log('\n📧 Gmail Takeout Analysis\n');

  // Analyze email threading
  const threads = new Map<string, typeof result.emails>();
  for (const email of result.emails) {
    if (email.threadId) {
      if (!threads.has(email.threadId)) {
        threads.set(email.threadId, []);
      }
      threads.get(email.threadId)!.push(email);
    }
  }

  const longThreads = [...threads.entries()]
    .filter(([, emails]) => emails.length > 5)
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`📬 Total threads: ${threads.size}`);
  console.log(`💬 Long threads (>5 emails): ${longThreads.length}`);

  if (longThreads.length > 0) {
    console.log('\n🔥 Top 5 longest threads:');
    longThreads.slice(0, 5).forEach(([, emails]) => {
      const subject = emails[0].subject || '(no subject)';
      console.log(`   ${emails.length} emails: ${subject.substring(0, 50)}...`);
    });
  }

  // Analyze read vs unread
  const unread = result.emails.filter((e) => !e.isRead);
  console.log(`\n📖 Read: ${result.emails.length - unread.length}`);
  console.log(`📬 Unread: ${unread.length}`);

  // Analyze by date
  const byYear = new Map<number, number>();
  for (const email of result.emails) {
    const year = new Date(email.date).getFullYear();
    byYear.set(year, (byYear.get(year) || 0) + 1);
  }

  console.log('\n📅 Emails by year:');
  [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .forEach(([year, count]) => {
      console.log(`   ${year}: ${count} emails`);
    });

  return result;
}

// =============================================================================
// Example 6: MBOX with detection
// =============================================================================

async function mboxWithDetection(file: File) {
  // Parse MBOX file
  const parser = new MBOXParser();
  const result = await parser.parse(file);

  console.log(`\nAnalyzing ${result.emails.length} emails from MBOX...\n`);

  // Detect accounts
  const accountDetector = new AccountDetector();
  const accounts = accountDetector.detectBatch(result.emails);

  console.log(`📱 Found ${accounts.length} account signups:`);
  accounts.slice(0, 10).forEach((account) => {
    console.log(`   - ${account.serviceName} (${account.serviceType})`);
  });

  // Detect purchases
  const purchaseDetector = new PurchaseDetector();
  const purchases = purchaseDetector.detectBatch(result.emails);

  const totalSpent = purchases.reduce((sum, p) => sum + p.amount, 0);
  console.log(`\n🛒 Found ${purchases.length} purchases totaling $${totalSpent.toFixed(2)}:`);
  purchases.slice(0, 10).forEach((purchase) => {
    console.log(`   - ${purchase.merchant}: $${purchase.amount}`);
  });

  return { accounts, purchases };
}

// =============================================================================
// Example 7: Compare multiple MBOX exports
// =============================================================================

async function compareMBOXFiles(files: File[]) {
  const parser = new MBOXParser();
  const results: Array<{ name: string; count: number; emails: any[] }> = [];

  for (const file of files) {
    if (MBOXParser.isMBOXFile(file)) {
      const result = await parser.parse(file);
      results.push({
        name: file.name,
        count: result.emails.length,
        emails: result.emails,
      });
    }
  }

  console.log('\n📊 MBOX Comparison:\n');
  results.forEach((r) => {
    console.log(`${r.name}: ${r.count} emails`);
  });

  // Find duplicate emails across files
  const allMessageIds = new Set<string>();
  const duplicates: string[] = [];

  for (const result of results) {
    for (const email of result.emails) {
      if (email.messageId) {
        if (allMessageIds.has(email.messageId)) {
          duplicates.push(email.messageId);
        } else {
          allMessageIds.add(email.messageId);
        }
      }
    }
  }

  console.log(`\n🔁 Duplicate emails found: ${duplicates.length}`);
  console.log(`📧 Total unique emails: ${allMessageIds.size}`);

  return results;
}

// Export for use
export {
  parseGmailExport,
  parseWithGmailLabels,
  parseInNodeJS,
  streamLargeMBOX,
  analyzeGmailTakeout,
  mboxWithDetection,
  compareMBOXFiles,
};

