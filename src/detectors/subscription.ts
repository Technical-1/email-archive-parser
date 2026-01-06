/**
 * OLM Parser - Subscription Detector
 * @packageDocumentation
 */

import type {
  Email,
  Subscription,
  SubscriptionDetectionResult,
  SubscriptionCategory,
  SubscriptionFrequency,
} from '../types';
import { stripHtml, extractDomain, formatDomainAsName } from '../utils';

/**
 * Detector for recurring subscription/membership emails
 *
 * @example
 * ```typescript
 * import { SubscriptionDetector } from '@technical-1/email-archive-parser';
 *
 * const detector = new SubscriptionDetector();
 * const result = detector.detect(email);
 *
 * if (result.isSubscription) {
 *   console.log(`Subscription: ${result.serviceName} - $${result.amount}/${result.frequency}`);
 * }
 * ```
 */
export class SubscriptionDetector {
  private readonly knownSubscriptions: Record<
    string,
    { name: string; category: SubscriptionCategory }
  > = {
    // Streaming
    'netflix.com': { name: 'Netflix', category: 'streaming' },
    'spotify.com': { name: 'Spotify', category: 'streaming' },
    'hulu.com': { name: 'Hulu', category: 'streaming' },
    'disneyplus.com': { name: 'Disney+', category: 'streaming' },
    'hbomax.com': { name: 'HBO Max', category: 'streaming' },
    'max.com': { name: 'Max', category: 'streaming' },
    'primevideo.com': { name: 'Prime Video', category: 'streaming' },
    'youtube.com': { name: 'YouTube Premium', category: 'streaming' },
    'crunchyroll.com': { name: 'Crunchyroll', category: 'streaming' },
    'audible.com': { name: 'Audible', category: 'streaming' },
    'twitch.tv': { name: 'Twitch', category: 'streaming' },
    // Software
    'adobe.com': { name: 'Adobe Creative Cloud', category: 'software' },
    'microsoft.com': { name: 'Microsoft 365', category: 'software' },
    'dropbox.com': { name: 'Dropbox', category: 'software' },
    'notion.so': { name: 'Notion', category: 'software' },
    '1password.com': { name: '1Password', category: 'software' },
    'grammarly.com': { name: 'Grammarly', category: 'software' },
    'canva.com': { name: 'Canva Pro', category: 'software' },
    'figma.com': { name: 'Figma', category: 'software' },
    'slack.com': { name: 'Slack', category: 'software' },
    'zoom.us': { name: 'Zoom', category: 'software' },
    'github.com': { name: 'GitHub', category: 'software' },
    'nordvpn.com': { name: 'NordVPN', category: 'software' },
    'expressvpn.com': { name: 'ExpressVPN', category: 'software' },
    // News
    'nytimes.com': { name: 'New York Times', category: 'news' },
    'washingtonpost.com': { name: 'Washington Post', category: 'news' },
    'wsj.com': { name: 'Wall Street Journal', category: 'news' },
    'medium.com': { name: 'Medium', category: 'news' },
    'substack.com': { name: 'Substack', category: 'news' },
    // Fitness
    'peloton.com': { name: 'Peloton', category: 'fitness' },
    'classpass.com': { name: 'ClassPass', category: 'fitness' },
    'strava.com': { name: 'Strava', category: 'fitness' },
    'calm.com': { name: 'Calm', category: 'fitness' },
    'headspace.com': { name: 'Headspace', category: 'fitness' },
    // Other
    'amazon.com': { name: 'Amazon Prime', category: 'other' },
    'linkedin.com': { name: 'LinkedIn Premium', category: 'other' },
  };

  private readonly subjectPatterns = [
    /subscription\s+(?:confirmed?|renewed?|receipt)/i,
    /your\s+(?:monthly|yearly|annual)\s+(?:subscription|membership|plan)/i,
    /(?:subscription|membership)\s+(?:renewal|billing|payment)/i,
    /(?:thank you|thanks)\s+for\s+(?:subscribing|your subscription)/i,
    /billing\s+(?:receipt|statement|confirmation)/i,
    /payment\s+(?:confirmation|receipt)\s+for\s+(?:subscription|membership)/i,
    /auto.?renew(?:al|ed)?/i,
    /recurring\s+(?:payment|charge|billing)/i,
  ];

  private readonly bodyPatterns = [
    /subscription\s+(?:plan|type)[:\s]+/i,
    /billing\s+period[:\s]+/i,
    /next\s+(?:billing|payment)\s+date[:\s]+/i,
    /auto.?renew(?:s|al)?\s+on/i,
    /(?:monthly|annual|yearly)\s+(?:subscription|membership|plan)/i,
    /(?:subscription|membership)\s+(?:fee|price|cost)[:\s]+[$€£]/i,
    /renews?\s+(?:on|every)\s+/i,
    /recurring\s+(?:charge|payment)[:\s]+/i,
    /cancel\s+(?:anytime|subscription|membership)/i,
  ];

  /**
   * Detect if an email is a subscription-related email
   * @param email - Email to analyze
   * @returns Detection result with subscription details
   */
  detect(email: Email): SubscriptionDetectionResult {
    const subject = email.subject || '';
    const body = stripHtml(email.body || '');
    const sender = email.sender || '';
    const domain = extractDomain(sender);

    let isSubscription = false;
    let serviceName: string | undefined;
    let category: SubscriptionCategory | undefined;
    let amount: number | undefined;
    let currency: string | undefined;
    let frequency: SubscriptionFrequency | undefined;

    // Check known subscription services
    const knownService = this.findKnownSubscription(domain);
    if (knownService) {
      serviceName = knownService.name;
      category = knownService.category;
    }

    // Check subject patterns
    for (const pattern of this.subjectPatterns) {
      if (pattern.test(subject)) {
        isSubscription = true;
        break;
      }
    }

    // Check body patterns
    if (!isSubscription) {
      let bodyMatches = 0;
      for (const pattern of this.bodyPatterns) {
        if (pattern.test(body)) {
          bodyMatches++;
        }
      }
      if (bodyMatches >= 2) {
        isSubscription = true;
      }
    }

    if (isSubscription) {
      const extracted = this.extractAmount(body);
      amount = extracted.amount;
      currency = extracted.currency;
      frequency = this.detectFrequency(body);

      if (!serviceName) {
        serviceName = this.extractServiceName(subject, body);
      }

      if (!serviceName || serviceName.length < 3) {
        if (email.senderName && email.senderName.length > 2) {
          serviceName = email.senderName;
        } else {
          serviceName = formatDomainAsName(domain);
        }
      }
    }

    return {
      isSubscription,
      serviceName,
      category: category || 'other',
      amount,
      currency,
      frequency,
    };
  }

  /**
   * Detect subscriptions from a batch of emails
   * @param emails - Emails to analyze
   * @returns Array of detected subscriptions (grouped by service)
   */
  detectBatch(emails: Email[]): Subscription[] {
    const subscriptionMap = new Map<string, Subscription>();

    for (const email of emails) {
      const result = this.detect(email);
      if (result.isSubscription && result.serviceName) {
        const key = result.serviceName.toLowerCase();

        if (!subscriptionMap.has(key)) {
          subscriptionMap.set(key, {
            serviceName: result.serviceName,
            monthlyAmount: result.amount || 0,
            currency: result.currency || 'USD',
            frequency: result.frequency || 'monthly',
            lastRenewalDate: email.date,
            emailIds: [email.id!],
            isActive: true,
            category: result.category || 'other',
          });
        } else {
          const existing = subscriptionMap.get(key)!;
          existing.emailIds.push(email.id!);
          if (email.date > existing.lastRenewalDate) {
            existing.lastRenewalDate = email.date;
            if (result.amount && result.amount > 0) {
              existing.monthlyAmount = result.amount;
            }
            if (result.frequency) {
              existing.frequency = result.frequency;
            }
          }
        }
      }
    }

    return Array.from(subscriptionMap.values());
  }

  private findKnownSubscription(
    domain: string
  ): { name: string; category: SubscriptionCategory } | null {
    if (this.knownSubscriptions[domain]) {
      return this.knownSubscriptions[domain];
    }

    for (const [subDomain, info] of Object.entries(this.knownSubscriptions)) {
      if (domain.endsWith('.' + subDomain) || domain.includes(subDomain.split('.')[0])) {
        return info;
      }
    }

    return null;
  }

  private extractAmount(text: string): { amount?: number; currency: string } {
    const currencyPatterns = [
      { symbol: 'USD', pattern: /\$\s*([\d,]+\.\d{2})/i },
      { symbol: 'EUR', pattern: /€\s*([\d,]+[.,]\d{2})/i },
      { symbol: 'GBP', pattern: /£\s*([\d,]+\.\d{2})/i },
    ];

    for (const currencyInfo of currencyPatterns) {
      const match = text.match(currencyInfo.pattern);
      if (match) {
        const amount = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(amount) && amount > 0) {
          return { amount, currency: currencyInfo.symbol };
        }
      }
    }

    return { currency: 'USD' };
  }

  private detectFrequency(text: string): SubscriptionFrequency | undefined {
    if (/(?:yearly|annual|annually|per year|\/year)/i.test(text)) {
      return 'yearly';
    }
    if (/(?:weekly|per week|\/week)/i.test(text)) {
      return 'weekly';
    }
    if (/(?:monthly|per month|\/month|each month)/i.test(text)) {
      return 'monthly';
    }
    return 'monthly';
  }

  private extractServiceName(subject: string, body: string): string | undefined {
    // Try to extract from subject
    const subjectPatterns = [
      /(?:your\s+)?([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)?)\s+subscription/i,
      /subscription\s+(?:to|for)\s+([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)?)/i,
      /welcome\s+to\s+([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)?)/i,
      /([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)?)\s+(?:membership|premium|pro|plus)/i,
    ];

    for (const pattern of subjectPatterns) {
      const match = subject.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        // Validate it's a reasonable service name
        if (name.length >= 2 && name.length <= 30 && this.isValidServiceName(name)) {
          return name;
        }
      }
    }

    // Try to extract from body
    const bodyPatterns = [
      /(?:subscribing to|subscription to)\s+([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)?)/i,
      /thank you for (?:joining|subscribing to)\s+([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)?)/i,
    ];

    for (const pattern of bodyPatterns) {
      const match = body.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        if (name.length >= 2 && name.length <= 30 && this.isValidServiceName(name)) {
          return name;
        }
      }
    }

    return undefined;
  }

  /**
   * Check if a string is a valid service name (not generic words)
   */
  private isValidServiceName(name: string): boolean {
    const invalidWords = [
      'your', 'the', 'this', 'that', 'our', 'monthly', 'annual', 'yearly',
      'weekly', 'subscription', 'membership', 'billing', 'payment', 'account',
      'email', 'newsletter', 'update', 'notification', 'com', 'org', 'net',
      'edu', 'gov', 'mail', 'info', 'noreply', 'reply'
    ];
    return !invalidWords.includes(name.toLowerCase());
  }

  /**
   * Get all known subscription services
   * @returns List of known subscription domains with names and categories
   */
  getKnownServices(): { domain: string; name: string; category: SubscriptionCategory }[] {
    return Object.entries(this.knownSubscriptions).map(([domain, info]) => ({
      domain,
      ...info,
    }));
  }
}

