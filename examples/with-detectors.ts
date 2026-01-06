/**
 * Detection Example
 *
 * This example shows how to use the detection features to identify
 * accounts, purchases, subscriptions, and newsletters.
 */

import {
  parseArchive,
  AccountDetector,
  PurchaseDetector,
  SubscriptionDetector,
  NewsletterDetector,
  createParsers,
} from '@jacobkanfer/email-archive-parser';

// =============================================================================
// Example 1: Parse with all detectors enabled
// =============================================================================

async function parseWithAllDetectors(file: File) {
  const result = await parseArchive(file, {
    onProgress: (p) => console.log(p.message),
    detectAccounts: true,
    detectPurchases: true,
    detectSubscriptions: true,
    detectNewsletters: true,
  });

  console.log('\n=== Detection Results ===\n');

  // Accounts
  console.log(`📱 Accounts Found: ${result.accounts?.length || 0}`);
  result.accounts?.slice(0, 5).forEach((account) => {
    console.log(`   - ${account.serviceName} (${account.serviceType})`);
  });

  // Purchases
  console.log(`\n🛒 Purchases Found: ${result.purchases?.length || 0}`);
  const totalSpent = result.purchases?.reduce((sum, p) => sum + p.amount, 0) || 0;
  console.log(`   Total spent: $${totalSpent.toFixed(2)}`);
  result.purchases?.slice(0, 5).forEach((purchase) => {
    console.log(
      `   - ${purchase.merchant}: $${purchase.amount} (${purchase.purchaseDate.toLocaleDateString()})`
    );
  });

  // Subscriptions
  console.log(`\n🔄 Subscriptions Found: ${result.subscriptions?.length || 0}`);
  const monthlyTotal =
    result.subscriptions?.reduce((sum, s) => sum + s.monthlyAmount, 0) || 0;
  console.log(`   Monthly cost: $${monthlyTotal.toFixed(2)}`);
  result.subscriptions?.forEach((sub) => {
    console.log(`   - ${sub.serviceName}: $${sub.monthlyAmount}/${sub.frequency}`);
  });

  // Newsletters
  console.log(`\n📰 Newsletters Found: ${result.newsletters?.length || 0}`);
  result.newsletters?.slice(0, 5).forEach((nl) => {
    const hasUnsub = nl.unsubscribeLink ? '✓' : '✗';
    console.log(`   - ${nl.senderName} (${nl.emailCount} emails) [Unsubscribe: ${hasUnsub}]`);
  });

  return result;
}

// =============================================================================
// Example 2: Using individual detectors
// =============================================================================

async function useIndividualDetectors(file: File) {
  // First, parse without detection
  const result = await parseArchive(file);
  const emails = result.emails;

  console.log(`\nAnalyzing ${emails.length} emails...\n`);

  // Account Detection
  const accountDetector = new AccountDetector();
  console.log('🔍 Detecting accounts...');

  for (const email of emails.slice(0, 10)) {
    const detection = accountDetector.detect(email);
    if (detection.type === 'account') {
      console.log(
        `   Found: ${detection.data?.serviceName} (confidence: ${detection.confidence}%)`
      );
    }
  }

  // Batch detection is more efficient
  const allAccounts = accountDetector.detectBatch(emails);
  console.log(`\n   Total unique accounts: ${allAccounts.length}`);

  // Purchase Detection
  const purchaseDetector = new PurchaseDetector();
  console.log('\n🔍 Detecting purchases...');

  for (const email of emails.slice(0, 10)) {
    const detection = purchaseDetector.detect(email);
    if (detection.type === 'purchase') {
      console.log(
        `   Found: $${detection.data?.amount} from ${detection.data?.merchant}`
      );
    }
  }

  // Get all purchases
  const allPurchases = purchaseDetector.detectBatch(emails);
  console.log(`\n   Total purchases: ${allPurchases.length}`);

  // Subscription Detection
  const subscriptionDetector = new SubscriptionDetector();
  console.log('\n🔍 Detecting subscriptions...');

  const allSubscriptions = subscriptionDetector.detectBatch(emails);
  allSubscriptions.forEach((sub) => {
    console.log(`   - ${sub.serviceName}: ${sub.emailIds.length} related emails`);
  });

  // Newsletter Detection
  const newsletterDetector = new NewsletterDetector();
  console.log('\n🔍 Detecting newsletters...');

  const allNewsletters = newsletterDetector.detectBatch(emails);
  const withUnsubscribe = allNewsletters.filter((nl) => nl.unsubscribeLink);
  console.log(`   Found ${allNewsletters.length} newsletters`);
  console.log(`   ${withUnsubscribe.length} have unsubscribe links`);
}

// =============================================================================
// Example 3: Custom analysis
// =============================================================================

async function customAnalysis(file: File) {
  const result = await parseArchive(file, {
    detectAccounts: true,
    detectPurchases: true,
  });

  // Analyze spending by category
  if (result.purchases) {
    const byCategory = new Map<string, { count: number; total: number }>();

    for (const purchase of result.purchases) {
      if (!byCategory.has(purchase.category)) {
        byCategory.set(purchase.category, { count: 0, total: 0 });
      }
      const cat = byCategory.get(purchase.category)!;
      cat.count++;
      cat.total += purchase.amount;
    }

    console.log('\n💰 Spending by Category:');
    byCategory.forEach((data, category) => {
      console.log(`   ${category}: $${data.total.toFixed(2)} (${data.count} purchases)`);
    });
  }

  // Analyze accounts by type
  if (result.accounts) {
    const byType = new Map<string, number>();

    for (const account of result.accounts) {
      const current = byType.get(account.serviceType) || 0;
      byType.set(account.serviceType, current + 1);
    }

    console.log('\n📱 Accounts by Type:');
    byType.forEach((count, type) => {
      console.log(`   ${type}: ${count}`);
    });
  }

  // Find potential security concerns (old accounts)
  if (result.accounts) {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const oldAccounts = result.accounts.filter(
      (a) => new Date(a.signupDate) < twoYearsAgo
    );

    console.log(`\n⚠️  Old accounts (>2 years): ${oldAccounts.length}`);
    oldAccounts.slice(0, 5).forEach((account) => {
      console.log(
        `   - ${account.serviceName} (since ${account.signupDate.toLocaleDateString()})`
      );
    });
  }
}

// =============================================================================
// Example 4: Using createParsers helper
// =============================================================================

async function usingCreateParsers() {
  const { olm, mbox, detectors } = createParsers();

  // Use specific parser
  const olmResult = await olm.parse({} as File);

  // Use specific detectors
  const accounts = detectors.account.detectBatch(olmResult.emails);
  const purchases = detectors.purchase.detectBatch(olmResult.emails);

  // Get known services
  const knownAccounts = detectors.account.getKnownServices();
  console.log(`We track ${knownAccounts.length} known account services`);

  const knownMerchants = detectors.purchase.getKnownMerchants();
  console.log(`We track ${knownMerchants.length} known merchants`);

  const knownSubscriptions = detectors.subscription.getKnownServices();
  console.log(`We track ${knownSubscriptions.length} known subscription services`);
}

// Export for use
export {
  parseWithAllDetectors,
  useIndividualDetectors,
  customAnalysis,
  usingCreateParsers,
};

