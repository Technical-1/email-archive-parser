/**
 * OLM Parser - Newsletter Detector
 * @packageDocumentation
 */

import type { Email, Newsletter, NewsletterDetectionResult } from '../types';
import { stripHtml, extractDomain } from '../utils';
import { matchKnownDomain } from './domainMatch';

/**
 * Detector for newsletters and promotional emails
 * Extracts unsubscribe links when available
 *
 * @example
 * ```typescript
 * import { NewsletterDetector } from '@technical-1/email-archive-parser';
 *
 * const detector = new NewsletterDetector();
 * const result = detector.detect(email);
 *
 * if (result.isNewsletter) {
 *   console.log(`Newsletter detected, unsubscribe: ${result.unsubscribeLink}`);
 * }
 * ```
 */
export class NewsletterDetector {
  private readonly newsletterSubjectPatterns = [
    /\bnewsletter\b/i,
    /\bweekly\s+(?:digest|update|roundup|summary)\b/i,
    /\bmonthly\s+(?:digest|update|roundup|summary)\b/i,
    /\bdaily\s+(?:digest|brief|update)\b/i,
    /\b(?:this week|today)\s+(?:in|on|at)\b/i,
    /\blatest\s+(?:news|updates|articles)\b/i,
    /\bedition\s*#?\d*/i,
    /\bissue\s*#?\d*/i,
    /\bvol(?:ume)?\.?\s*\d+/i,
  ];

  private readonly promotionalSubjectPatterns = [
    /\b(?:save|get)\s+\d+%?\s*(?:off|discount)?\b/i,
    /\bup\s+to\s+\d+%\s+off\b/i,
    /\bsale\s+(?:ends?|starts?)\b/i,
    /\bflash\s+sale\b/i,
    /\blimited\s+time\b/i,
    /\bfree\s+(?:shipping|delivery|gift)\b/i,
    /\bexclusive\s+(?:offer|deal|discount|access)\b/i,
    /\bspecial\s+(?:offer|deal|discount)\b/i,
    /\bdon'?t\s+miss\s+(?:out|this)\b/i,
    /\blast\s+chance\b/i,
    /\bpromo(?:tion)?\s*code\b/i,
    /\bcoupon\s*code\b/i,
    /\bdiscount\s*code\b/i,
    /\buse\s+code\b/i,
    /\bbogo\b/i,
    /\bbuy\s+\d+\s+get\s+\d+/i,
    /\bclearance\b/i,
    /\bblack\s+friday\b/i,
    /\bcyber\s+monday\b/i,
    /\bprime\s+day\b/i,
    /\bholiday\s+(?:sale|deals|savings)\b/i,
  ];

  private readonly marketingBodyPatterns = [
    /unsubscribe/i,
    /manage\s+(?:your\s+)?(?:email\s+)?preferences/i,
    /email\s+preferences/i,
    /opt.?out/i,
    /if\s+you\s+no\s+longer\s+(?:wish|want)\s+to\s+receive/i,
    /to\s+stop\s+receiving\s+(?:these|our)\s+emails/i,
    /view\s+(?:in|as)\s+(?:a\s+)?(?:web\s+)?browser/i,
    /view\s+(?:this\s+)?(?:email\s+)?online/i,
    /having\s+trouble\s+(?:viewing|reading)/i,
    /forward\s+to\s+a\s+friend/i,
    /share\s+(?:with|this)/i,
    /copyright\s+©?\s*\d{4}/i,
    /all\s+rights\s+reserved/i,
    /privacy\s+policy/i,
    /terms\s+(?:of\s+(?:service|use)|and\s+conditions)/i,
  ];

  // Known promotional/newsletter sender domains. Entries ending in '.' are
  // subdomain markers (e.g. 'newsletter.') matched only at the START of the
  // domain so they sit on a label boundary; the rest are full domains matched
  // boundary-safely via matchKnownDomain. This avoids the old
  // `domain.includes('mail.')` bug that flagged gmail.com/hotmail.com as
  // promotional because they contain the substring "mail.".
  private readonly knownPromotionalDomains = [
    'email.amazonses.com',
    'em.ebay.com',
    'promo.',
    'marketing.',
    'newsletter.',
    'mail.',
    'news.',
    'promotions.',
    'offers.',
    'deals.',
    'updates.',
  ];

  /**
   * Detect if an email is a newsletter or promotional email
   * @param email - Email to analyze
   * @returns Detection result with unsubscribe link if found
   */
  detect(email: Email): NewsletterDetectionResult {
    const subject = email.subject || '';
    const body = email.body || '';
    const htmlBody = email.htmlBody || '';
    const sender = email.sender || '';

    let newsletterScore = 0;
    let promotionalScore = 0;

    // Check subject for newsletter patterns
    for (const pattern of this.newsletterSubjectPatterns) {
      if (pattern.test(subject)) {
        newsletterScore += 30;
        break;
      }
    }

    // Check subject for promotional patterns
    for (const pattern of this.promotionalSubjectPatterns) {
      if (pattern.test(subject)) {
        promotionalScore += 35;
        break;
      }
    }

    // Check body for marketing patterns
    const plainBody = stripHtml(body);
    let marketingPatternMatches = 0;
    for (const pattern of this.marketingBodyPatterns) {
      if (pattern.test(plainBody) || pattern.test(htmlBody)) {
        marketingPatternMatches++;
      }
    }

    if (marketingPatternMatches >= 3) {
      newsletterScore += 25;
      promotionalScore += 20;
    } else if (marketingPatternMatches >= 2) {
      newsletterScore += 15;
      promotionalScore += 10;
    }

    // Sender domain. Bare subdomain markers (mail./news./updates./...) are only
    // WEAK evidence: they corroborate marketing scores but cannot, on their own,
    // push an otherwise-transactional email over the threshold. Full known
    // promotional domains (e.g. em.ebay.com) remain strong.
    const domain = extractDomain(sender);
    const senderSignal = this.classifyPromotionalSender(domain);
    if (senderSignal === 'strong') {
      newsletterScore += 20;
      promotionalScore += 20;
    } else if (senderSignal === 'weak' && marketingPatternMatches >= 1) {
      newsletterScore += 10;
      promotionalScore += 10;
    }

    // Extract unsubscribe link
    const unsubscribeLink = this.extractUnsubscribeLink(htmlBody || body);
    if (unsubscribeLink) {
      newsletterScore += 15;
      promotionalScore += 10;
    }

    // Check for List-Unsubscribe patterns
    if (/list.?unsubscribe/i.test(htmlBody)) {
      newsletterScore += 10;
    }

    const isNewsletter = newsletterScore >= 40;
    const isPromotional = promotionalScore >= 40;
    const confidence = Math.max(newsletterScore, promotionalScore);

    return {
      isNewsletter: isNewsletter && !isPromotional,
      isPromotional,
      confidence: Math.min(confidence, 100),
      unsubscribeLink,
    };
  }

  /**
   * Classify a sender domain's promotional signal strength.
   * - 'strong': a full known promotional domain (matched boundary-safely).
   * - 'weak': only a bare subdomain marker (mail./news./...) matched at the
   *   label boundary — corroborating evidence, not decisive on its own.
   * - 'none': no marker.
   */
  private classifyPromotionalSender(domain: string): 'strong' | 'weak' | 'none' {
    const d = domain.trim().toLowerCase();
    if (!d) return 'none';

    const fullDomains: Record<string, true> = {};
    let weak = false;
    for (const entry of this.knownPromotionalDomains) {
      if (entry.endsWith('.')) {
        if (d.startsWith(entry)) weak = true;
      } else {
        fullDomains[entry] = true;
      }
    }
    if (matchKnownDomain(d, fullDomains) !== null) return 'strong';
    return weak ? 'weak' : 'none';
  }

  /**
   * Detect newsletters from a batch of emails
   * @param emails - Emails to analyze
   * @returns Array of detected newsletters (grouped by sender)
   */
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
      // Null-aware ordering (Hub 1016 part 2): emails with an unknown (null)
      // date are excluded from ordering and frequency math. emailCount still
      // reflects every detected email for this sender.
      const datedEntries = data.entries.filter((e) => e.email.date instanceof Date);
      const sortedEntries = [...datedEntries].sort(
        (a, b) => (b.email.date as Date).getTime() - (a.email.date as Date).getTime()
      );
      const latest = sortedEntries[0] ?? data.entries[0];
      const unsubscribeLinks = Array.from(data.unsubscribeLinks);
      const frequency = this.calculateFrequency(sortedEntries.map((e) => e.email));

      newsletters.push({
        senderEmail: sender,
        senderName: latest.email.senderName || this.extractNameFromEmail(sender),
        emailCount: data.entries.length,
        lastEmailDate: (sortedEntries[0]?.email.date as Date) ?? null,
        frequency,
        unsubscribeLink: unsubscribeLinks[0],
        isPromotional: latest.result.isPromotional,
      });
    });

    return newsletters;
  }

  /**
   * Extract unsubscribe link from email HTML
   * @param html - Email HTML content
   * @returns Unsubscribe URL if found
   */
  extractUnsubscribeLink(html: string): string | undefined {
    if (!html) return undefined;

    const patterns = [
      /<a[^>]*href=["']([^"']*unsubscribe[^"']*)["'][^>]*>/i,
      /<a[^>]*href=["']([^"']*opt.?out[^"']*)["'][^>]*>/i,
      /<a[^>]*href=["']([^"']*email.?preferences[^"']*)["'][^>]*>/i,
      /<a[^>]*href=["']([^"']*manage.?preferences[^"']*)["'][^>]*>/i,
      /<a[^>]*href=["']([^"']+)["'][^>]*>\s*unsubscribe\s*<\/a>/i,
      /<a[^>]*href=["']([^"']+)["'][^>]*>[^<]*unsubscribe[^<]*<\/a>/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const link = match[1];
        if (link.startsWith('http://') || link.startsWith('https://')) {
          return link;
        }
      }
    }

    // Look for plain text URLs
    const urlPattern = /https?:\/\/[^\s<>"]+(?:unsubscribe|opt.?out|preferences)[^\s<>"]*/i;
    const urlMatch = html.match(urlPattern);
    if (urlMatch) {
      return urlMatch[0];
    }

    return undefined;
  }

  /**
   * Categorize email type
   * @param email - Email to categorize
   * @returns Category: 'newsletter', 'promotional', or 'regular'
   */
  categorize(email: Email): 'newsletter' | 'promotional' | 'regular' {
    const result = this.detect(email);

    if (result.isPromotional) {
      return 'promotional';
    }
    if (result.isNewsletter) {
      return 'newsletter';
    }
    return 'regular';
  }

  /**
   * Calculate sending frequency based on email dates
   * @param emails - Sorted emails (newest first)
   * @returns Estimated frequency
   */
  private calculateFrequency(emails: Email[]): 'daily' | 'weekly' | 'monthly' | 'irregular' {
    // Null-aware frequency (Hub 1016 part 2): emails with an unknown (null)
    // date are excluded from the average-interval math entirely rather than
    // being treated as epoch 0.
    const dates = emails
      .map((e) => e.date)
      .filter((d): d is Date => d instanceof Date)
      .map((d) => d.getTime());

    if (dates.length < 2) {
      return 'irregular';
    }

    let totalDays = 0;
    for (let i = 0; i < dates.length - 1; i++) {
      totalDays += (dates[i] - dates[i + 1]) / (1000 * 60 * 60 * 24);
    }
    const avgDays = totalDays / (dates.length - 1);

    if (avgDays <= 2) return 'daily';
    if (avgDays <= 10) return 'weekly';
    if (avgDays <= 45) return 'monthly';
    return 'irregular';
  }

  /**
   * Extract a readable name from an email address
   * @param email - Email address
   * @returns Extracted name
   */
  private extractNameFromEmail(email: string): string {
    const [localPart, domain] = email.split('@');
    
    // Known service mappings for common newsletter senders
    const knownSenders: Record<string, string> = {
      'nytimes.com': 'New York Times',
      'newyorktimes.com': 'New York Times',
      'washingtonpost.com': 'Washington Post',
      'wsj.com': 'Wall Street Journal',
      'amazon.com': 'Amazon',
      'netflix.com': 'Netflix',
      'spotify.com': 'Spotify',
      'linkedin.com': 'LinkedIn',
      'twitter.com': 'Twitter',
      'facebook.com': 'Facebook',
      'instagram.com': 'Instagram',
      'medium.com': 'Medium',
      'substack.com': 'Substack',
      'mailchimp.com': 'Mailchimp',
      'hubspot.com': 'HubSpot',
      'salesforce.com': 'Salesforce',
    };
    
    // Check if domain matches known service
    if (domain) {
      const domainLower = domain.toLowerCase();
      for (const [key, name] of Object.entries(knownSenders)) {
        if (domainLower.includes(key)) {
          return name;
        }
      }
      
      // Get main domain part
      const domainParts = domain.split('.');
      let mainPart: string;
      
      // Handle domains like mail.example.com or newsletter.example.com
      if (domainParts.length >= 2) {
        // Get the second-to-last part (e.g., 'example' from 'mail.example.com')
        const potentialName = domainParts[domainParts.length - 2];
        const genericSubdomains = ['mail', 'email', 'noreply', 'no-reply', 'newsletter', 'news', 'info', 'marketing', 'mailer', 'e', 'beta'];
        
        if (genericSubdomains.includes(domainParts[0].toLowerCase()) && domainParts.length >= 3) {
          // Get the domain name instead of the subdomain
          mainPart = domainParts[domainParts.length - 2];
        } else {
          mainPart = potentialName;
        }
      } else {
        mainPart = domainParts[0];
      }
      
      // Format the name nicely
      if (mainPart && mainPart.length >= 2) {
        // Handle compound names like "seaworldparks" -> "Seaworld Parks"
        const formatted = mainPart
          .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase
          .replace(/[-_]/g, ' ')  // separators
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
        
        return formatted;
      }
    }
    
    // Fall back to local part as last resort
    if (localPart) {
      const cleaned = localPart
        .replace(/[._-]/g, ' ')
        .replace(/\d+/g, '')
        .trim();
      
      if (cleaned.length > 0) {
        return cleaned
          .split(' ')
          .filter(word => word.length > 0)
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
      }
    }
    
    return 'Unknown';
  }
}

