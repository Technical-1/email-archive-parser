/**
 * OLM Parser - Newsletter Detector
 * @packageDocumentation
 */

import type { Email, Newsletter, NewsletterDetectionResult } from '../types';
import { stripHtml, extractDomain } from '../utils';

/**
 * Detector for newsletters and promotional emails
 * Extracts unsubscribe links when available
 *
 * @example
 * ```typescript
 * import { NewsletterDetector } from '@jacobkanfer/olm-parser';
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
    /\bdiscount\s*code\b/i,
    /\buse\s+code\b/i,
    /\bblack\s+friday\b/i,
    /\bcyber\s+monday\b/i,
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
    /forward\s+to\s+a\s+friend/i,
    /copyright\s+©?\s*\d{4}/i,
    /all\s+rights\s+reserved/i,
    /privacy\s+policy/i,
  ];

  private readonly knownPromotionalPrefixes = [
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

    // Check sender domain
    const domain = extractDomain(sender);
    for (const prefix of this.knownPromotionalPrefixes) {
      if (domain.includes(prefix)) {
        newsletterScore += 20;
        promotionalScore += 20;
        break;
      }
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
   * Detect newsletters from a batch of emails
   * @param emails - Emails to analyze
   * @returns Array of detected newsletters (grouped by sender)
   */
  detectBatch(emails: Email[]): Newsletter[] {
    const senderMap = new Map<string, { emails: Email[]; unsubscribeLinks: Set<string> }>();

    for (const email of emails) {
      const result = this.detect(email);
      if (result.isNewsletter || result.isPromotional) {
        const sender = email.sender;

        if (!senderMap.has(sender)) {
          senderMap.set(sender, { emails: [], unsubscribeLinks: new Set() });
        }

        const data = senderMap.get(sender)!;
        data.emails.push(email);

        if (result.unsubscribeLink) {
          data.unsubscribeLinks.add(result.unsubscribeLink);
        }
      }
    }

    const newsletters: Newsletter[] = [];

    senderMap.forEach((data, sender) => {
      const sortedEmails = data.emails.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      const latestEmail = sortedEmails[0];
      const unsubscribeLinks = Array.from(data.unsubscribeLinks);

      // Calculate frequency based on email dates
      const frequency = this.calculateFrequency(sortedEmails);

      newsletters.push({
        senderEmail: sender,
        senderName: latestEmail.senderName || this.extractNameFromEmail(sender),
        emailCount: data.emails.length,
        lastEmailDate: new Date(latestEmail.date),
        frequency,
        unsubscribeLink: unsubscribeLinks[0],
        isPromotional: this.detect(latestEmail).isPromotional,
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
    if (emails.length < 2) {
      return 'irregular';
    }

    // Calculate average days between emails
    const dates = emails.map(e => new Date(e.date).getTime());
    let totalDays = 0;
    
    for (let i = 0; i < dates.length - 1; i++) {
      const daysDiff = (dates[i] - dates[i + 1]) / (1000 * 60 * 60 * 24);
      totalDays += daysDiff;
    }
    
    const avgDays = totalDays / (dates.length - 1);

    if (avgDays <= 2) {
      return 'daily';
    } else if (avgDays <= 10) {
      return 'weekly';
    } else if (avgDays <= 45) {
      return 'monthly';
    }
    
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

