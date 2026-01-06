/**
 * OLM Usage Examples
 *
 * This example shows how to parse OLM files exported from Outlook for Mac.
 * OLM files can contain:
 * - Emails with full threading and conversation IDs
 * - Contacts with detailed information
 * - Calendar events
 */

import {
  parseArchive,
  OLMParser,
  AccountDetector,
  PurchaseDetector,
} from '@jacobkanfer/email-archive-parser';

// =============================================================================
// Example 1: Basic OLM parsing (Browser)
// =============================================================================

async function parseOutlookExport() {
  // In a browser environment with file input
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

  fileInput?.addEventListener('change', async (event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];

    if (!file) return;

    // Check if it's an OLM file
    if (!OLMParser.isOLMFile(file)) {
      console.error('Please select an OLM file (.olm)');
      return;
    }

    console.log(`Parsing Outlook export: ${file.name}...`);

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

    // OLM files support contacts and calendar events
    if (result.contacts && result.contacts.length > 0) {
      console.log('\n📇 Contacts:');
      result.contacts.slice(0, 5).forEach((contact) => {
        console.log(`   - ${contact.name} <${contact.email}>`);
      });
    }

    if (result.calendarEvents && result.calendarEvents.length > 0) {
      console.log('\n📅 Calendar Events:');
      result.calendarEvents.slice(0, 5).forEach((event) => {
        console.log(`   - ${event.title} (${new Date(event.startDate).toLocaleDateString()})`);
      });
    }
  });
}

// =============================================================================
// Example 2: Using OLMParser directly with conversation threading
// =============================================================================

async function parseWithConversations(file: File) {
  const parser = new OLMParser();

  const result = await parser.parse(file, {
    onProgress: (p) => console.log(p.message),
  });

  // Group emails by conversation/thread ID (Outlook's threading)
  const conversations = new Map<string, typeof result.emails>();

  for (const email of result.emails) {
    if (email.threadId) {
      if (!conversations.has(email.threadId)) {
        conversations.set(email.threadId, []);
      }
      conversations.get(email.threadId)!.push(email);
    }
  }

  console.log('\n💬 Email Conversations:');
  console.log(`   Total conversations: ${conversations.size}`);

  // Find longest conversations
  const sortedConversations = [...conversations.entries()]
    .sort((a, b) => b[1].length - a[1].length);

  console.log('\n🔥 Top 5 longest conversations:');
  sortedConversations.slice(0, 5).forEach(([threadId, emails]) => {
    const subject = emails[0].subject || '(no subject)';
    const participants = new Set(emails.map((e) => e.sender));
    console.log(`   ${emails.length} emails: ${subject.substring(0, 40)}...`);
    console.log(`      Participants: ${participants.size}`);
  });

  return result;
}

// =============================================================================
// Example 3: Node.js - Parse OLM file
// =============================================================================

async function parseInNodeJS() {
  // Note: This won't run in browser, only in Node.js
  const { readFileSync, writeFileSync } = await import('fs');

  // Read the file as a buffer
  const buffer = readFileSync('/path/to/outlook-export.olm');

  console.log(`File size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

  // Parse the buffer
  const parser = new OLMParser();
  const result = await parser.parse(buffer, {
    onProgress: (progress) => {
      process.stdout.write(`\r${progress.message}`);
    },
  });

  console.log(`\nParsed from OLM:`);
  console.log(`   📧 Emails: ${result.emails.length}`);
  console.log(`   📇 Contacts: ${result.contacts?.length || 0}`);
  console.log(`   📅 Calendar Events: ${result.calendarEvents?.length || 0}`);

  // Save all data
  writeFileSync('outlook-emails.json', JSON.stringify(result.emails, null, 2));
  writeFileSync('outlook-contacts.json', JSON.stringify(result.contacts, null, 2));
  writeFileSync('outlook-calendar.json', JSON.stringify(result.calendarEvents, null, 2));

  console.log('\n✅ Saved to JSON files');
}

// =============================================================================
// Example 4: Extract and analyze contacts
// =============================================================================

async function analyzeContacts(file: File) {
  const parser = new OLMParser();
  const result = await parser.parse(file);

  if (!result.contacts || result.contacts.length === 0) {
    console.log('No contacts found in OLM file');
    return;
  }

  console.log(`\n📇 Contact Analysis (${result.contacts.length} contacts)\n`);

  // Group contacts by domain
  const byDomain = new Map<string, typeof result.contacts>();
  for (const contact of result.contacts) {
    const match = contact.email?.match(/@(.+)$/);
    if (match) {
      const domain = match[1].toLowerCase();
      if (!byDomain.has(domain)) {
        byDomain.set(domain, []);
      }
      byDomain.get(domain)!.push(contact);
    }
  }

  // Sort by count
  const sortedDomains = [...byDomain.entries()].sort((a, b) => b[1].length - a[1].length);

  console.log('🏢 Contacts by organization (domain):');
  sortedDomains.slice(0, 10).forEach(([domain, contacts]) => {
    console.log(`   ${domain}: ${contacts.length} contacts`);
  });

  // Find contacts with phone numbers
  const withPhone = result.contacts.filter((c) => c.phone);
  console.log(`\n📱 Contacts with phone numbers: ${withPhone.length}`);

  // Find contacts with addresses
  const withAddress = result.contacts.filter((c) => c.address);
  console.log(`📍 Contacts with addresses: ${withAddress.length}`);

  return result.contacts;
}

// =============================================================================
// Example 5: Extract and analyze calendar events
// =============================================================================

async function analyzeCalendar(file: File) {
  const parser = new OLMParser();
  const result = await parser.parse(file);

  if (!result.calendarEvents || result.calendarEvents.length === 0) {
    console.log('No calendar events found in OLM file');
    return;
  }

  console.log(`\n📅 Calendar Analysis (${result.calendarEvents.length} events)\n`);

  // Upcoming events
  const now = new Date();
  const upcoming = result.calendarEvents
    .filter((e) => new Date(e.startDate) > now)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  console.log(`📆 Upcoming events: ${upcoming.length}`);
  upcoming.slice(0, 5).forEach((event) => {
    const date = new Date(event.startDate).toLocaleDateString();
    console.log(`   - ${date}: ${event.title}`);
  });

  // Past events
  const past = result.calendarEvents
    .filter((e) => new Date(e.startDate) <= now)
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  console.log(`\n📜 Past events: ${past.length}`);
  past.slice(0, 5).forEach((event) => {
    const date = new Date(event.startDate).toLocaleDateString();
    console.log(`   - ${date}: ${event.title}`);
  });

  // Events by month
  const byMonth = new Map<string, number>();
  for (const event of result.calendarEvents) {
    const date = new Date(event.startDate);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    byMonth.set(key, (byMonth.get(key) || 0) + 1);
  }

  console.log('\n📊 Events by month:');
  [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 6)
    .forEach(([month, count]) => {
      console.log(`   ${month}: ${count} events`);
    });

  // Find recurring events (events with similar titles)
  const titleCounts = new Map<string, number>();
  for (const event of result.calendarEvents) {
    const title = event.title?.toLowerCase() || '';
    titleCounts.set(title, (titleCounts.get(title) || 0) + 1);
  }

  const recurring = [...titleCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1]);

  console.log(`\n🔄 Potentially recurring events: ${recurring.length}`);
  recurring.slice(0, 5).forEach(([title, count]) => {
    console.log(`   - "${title}" (${count} occurrences)`);
  });

  return result.calendarEvents;
}

// =============================================================================
// Example 6: OLM with detection
// =============================================================================

async function olmWithDetection(file: File) {
  // Parse OLM file
  const parser = new OLMParser();
  const result = await parser.parse(file);

  console.log(`\nAnalyzing ${result.emails.length} emails from OLM...\n`);

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

  // Cross-reference with contacts
  if (result.contacts) {
    const contactEmails = new Set(result.contacts.map((c) => c.email?.toLowerCase()));
    const fromContacts = result.emails.filter((e) => {
      const senderEmail = e.sender.match(/<([^>]+)>/)?.[1]?.toLowerCase() || e.sender.toLowerCase();
      return contactEmails.has(senderEmail);
    });
    console.log(`\n📇 Emails from known contacts: ${fromContacts.length}`);
  }

  return { accounts, purchases, contacts: result.contacts };
}

// =============================================================================
// Example 7: Full Outlook data export
// =============================================================================

async function fullOutlookExport(file: File) {
  const parser = new OLMParser();

  console.log('📤 Exporting all Outlook data...\n');

  const result = await parser.parse(file, {
    onProgress: (p) => console.log(`   ${p.message}`),
  });

  // Create a comprehensive summary
  const summary = {
    exportDate: new Date().toISOString(),
    stats: {
      totalEmails: result.emails.length,
      totalContacts: result.contacts?.length || 0,
      totalCalendarEvents: result.calendarEvents?.length || 0,
    },
    emailStats: {
      readCount: result.emails.filter((e) => e.isRead).length,
      unreadCount: result.emails.filter((e) => !e.isRead).length,
      withAttachments: result.emails.filter((e) => e.hasAttachments).length,
      uniqueSenders: new Set(result.emails.map((e) => e.sender)).size,
      uniqueRecipients: new Set(result.emails.flatMap((e) => e.recipients || [])).size,
      threadCount: new Set(result.emails.map((e) => e.threadId).filter(Boolean)).size,
    },
    dateRange: {
      oldest: result.emails.length > 0
        ? new Date(Math.min(...result.emails.map((e) => new Date(e.date).getTime()))).toISOString()
        : null,
      newest: result.emails.length > 0
        ? new Date(Math.max(...result.emails.map((e) => new Date(e.date).getTime()))).toISOString()
        : null,
    },
  };

  console.log('\n📊 Export Summary:');
  console.log(JSON.stringify(summary, null, 2));

  return {
    summary,
    emails: result.emails,
    contacts: result.contacts,
    calendarEvents: result.calendarEvents,
  };
}

// Export for use
export {
  parseOutlookExport,
  parseWithConversations,
  parseInNodeJS,
  analyzeContacts,
  analyzeCalendar,
  olmWithDetection,
  fullOutlookExport,
};

