/**
 * OLM Parser - Purchase Detector
 * @packageDocumentation
 */

import type { Email, Purchase, PurchaseDetectionResult, PurchaseCategory } from '../types';
import { stripHtml, extractDomain } from '../utils';

/**
 * Detector for purchase/order confirmation emails
 * Supports multiple currencies and extracts order details
 *
 * @example
 * ```typescript
 * import { PurchaseDetector } from '@jacobkanfer/email-archive-parser';
 *
 * const detector = new PurchaseDetector();
 * const result = detector.detect(email);
 *
 * if (result.type === 'purchase') {
 *   console.log(`Purchase: $${result.data?.amount} from ${result.data?.merchant}`);
 * }
 * ```
 */
export class PurchaseDetector {
  private readonly strongSubjectPatterns = [
    /^(?:your )?order (?:confirmation|receipt|#)/i,
    /^(?:your )?(?:purchase|payment) (?:confirmation|receipt)/i,
    /^receipt (?:for|from)/i,
    /^invoice (?:for|from|#)/i,
    /^thank you for your (?:order|purchase)/i,
    /^order #?\w+ (?:confirmed|shipped|delivered)/i,
    /^your .{2,30} order/i,
    /^shipping confirmation/i,
    /^payment received/i,
    /^transaction receipt/i,
  ];

  private readonly strongBodyPatterns = [
    /order\s+(?:total|summary)[:\s]+[$€£¥₹₩]\s*[\d,]+[.,]?\d*/i,
    /(?:amount|total)\s+(?:charged|paid)[:\s]+[$€£¥₹₩]\s*[\d,]+[.,]?\d*/i,
    /you (?:have )?(?:paid|purchased|ordered)/i,
    /thank you for your (?:order|purchase) (?:of|from)/i,
    /your order has been (?:confirmed|placed|received)/i,
    /payment of [$€£¥₹₩]\s*[\d,]+[.,]?\d*/i,
    /transaction amount[:\s]+[$€£¥₹₩]\s*[\d,]+[.,]?\d*/i,
    /order #\s*[A-Z0-9-]{5,}/i,
    /order number[:\s]+[A-Z0-9-]{5,}/i,
  ];

  private readonly antiPatterns = [
    /save \$\d+/i,
    /up to \d+% off/i,
    /free shipping/i,
    /sale ends/i,
    /limited time/i,
    /discount code/i,
    /promo code/i,
    /shop now/i,
    /buy now/i,
    /subscribe/i,
    /unsubscribe/i,
    /view in browser/i,
  ];

  private readonly knownMerchants: Record<string, string> = {
    'amazon.com': 'Amazon',
    'ebay.com': 'eBay',
    'etsy.com': 'Etsy',
    'paypal.com': 'PayPal',
    'stripe.com': 'Stripe',
    'apple.com': 'Apple',
    'google.com': 'Google',
    'microsoft.com': 'Microsoft',
    'netflix.com': 'Netflix',
    'spotify.com': 'Spotify',
    'uber.com': 'Uber',
    'ubereats.com': 'Uber Eats',
    'doordash.com': 'DoorDash',
    'grubhub.com': 'Grubhub',
    'walmart.com': 'Walmart',
    'target.com': 'Target',
    'bestbuy.com': 'Best Buy',
    'costco.com': 'Costco',
    'airbnb.com': 'Airbnb',
    'booking.com': 'Booking.com',
    'expedia.com': 'Expedia',
    'lyft.com': 'Lyft',
    'instacart.com': 'Instacart',
    'ticketmaster.com': 'Ticketmaster',
    'steampowered.com': 'Steam',
    'epicgames.com': 'Epic Games',
  };

  private readonly merchantCategories: Record<string, PurchaseCategory> = {
    amazon: 'ecommerce',
    ebay: 'ecommerce',
    etsy: 'ecommerce',
    walmart: 'ecommerce',
    target: 'ecommerce',
    'best buy': 'technology',
    newegg: 'technology',
    apple: 'technology',
    microsoft: 'technology',
    paypal: 'payment',
    stripe: 'payment',
    netflix: 'entertainment',
    spotify: 'entertainment',
    steam: 'entertainment',
    doordash: 'food',
    grubhub: 'food',
    'uber eats': 'food',
    instacart: 'food',
    uber: 'transportation',
    lyft: 'transportation',
    airbnb: 'travel',
    expedia: 'travel',
  };

  /**
   * Detect if an email is a purchase/order confirmation
   * @param email - Email to analyze
   * @returns Detection result with purchase details
   */
  detect(email: Email): PurchaseDetectionResult {
    const subject = email.subject || '';
    const body = stripHtml(email.body || '');
    const sender = email.sender || '';

    // Check for anti-patterns (promotional emails)
    const combinedText = `${subject} ${body}`;
    let antiPatternMatches = 0;
    for (const pattern of this.antiPatterns) {
      if (pattern.test(combinedText)) {
        antiPatternMatches++;
      }
    }
    if (antiPatternMatches >= 3) {
      return { type: 'none', confidence: 0 };
    }

    let confidence = 0;
    let amount = 0;
    let currency = 'USD';
    let merchant = '';
    let orderNumber = '';

    // Check known merchants
    const domain = extractDomain(sender);
    const knownMerchant = this.findKnownMerchant(domain);
    if (knownMerchant) {
      merchant = knownMerchant;
      confidence += 30;
    }

    // Check subject patterns
    for (const pattern of this.strongSubjectPatterns) {
      if (pattern.test(subject)) {
        confidence += 35;
        break;
      }
    }

    // Check body patterns
    for (const pattern of this.strongBodyPatterns) {
      if (pattern.test(body)) {
        confidence += 25;
        break;
      }
    }

    // Extract amount if confident
    if (confidence >= 30) {
      const extracted = this.extractAmount(body);
      amount = extracted.amount;
      currency = extracted.currency;

      if (amount > 0 && amount < 10000) {
        confidence += 20;
      } else if (amount >= 10000) {
        confidence += 10;
      }

      orderNumber = this.extractOrderNumber(body);
      if (orderNumber && this.isValidOrderNumber(orderNumber)) {
        confidence += 15;
      }

      if (!merchant) {
        merchant = this.formatDomainAsMerchant(domain);
      }
    }

    if (confidence >= 70 && amount > 0 && merchant) {
      return {
        type: 'purchase',
        confidence,
        data: {
          merchant,
          amount,
          currency,
          orderNumber: this.isValidOrderNumber(orderNumber) ? orderNumber : undefined,
        },
      };
    }

    return { type: 'none', confidence: 0 };
  }

  /**
   * Detect purchases from a batch of emails
   * @param emails - Emails to analyze
   * @returns Array of detected purchases
   */
  detectBatch(emails: Email[]): Purchase[] {
    const purchases: Purchase[] = [];

    for (const email of emails) {
      const result = this.detect(email);
      if (result.type === 'purchase' && result.data?.amount) {
        purchases.push({
          emailId: email.id,
          merchant: result.data.merchant || 'Unknown',
          amount: result.data.amount,
          currency: result.data.currency || 'USD',
          purchaseDate: email.date,
          orderNumber: result.data.orderNumber,
          items: [],
          category: this.getCategory(result.data.merchant || ''),
        });
      }
    }

    return purchases;
  }

  private extractAmount(text: string): { amount: number; currency: string } {
    const contextPatterns = [
      { currency: 'USD', pattern: /(?:order\s+)?total[:\s]+\$\s*([\d,]+\.\d{2})/i },
      { currency: 'USD', pattern: /(?:amount|total)\s+(?:charged|paid|due)[:\s]+\$\s*([\d,]+\.\d{2})/i },
      { currency: 'EUR', pattern: /(?:order\s+)?total[:\s]+€\s*([\d\s,]+[.,]\d{2})/i },
      { currency: 'GBP', pattern: /(?:order\s+)?total[:\s]+£\s*([\d,]+\.\d{2})/i },
      { currency: 'JPY', pattern: /(?:order\s+)?total[:\s]+¥\s*([\d,]+)/i },
    ];

    for (const { currency, pattern } of contextPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const amount = this.parseAmount(match[1], currency);
        if (amount > 0) {
          return { amount, currency };
        }
      }
    }

    // Fallback
    const currencyMatches = [
      { currency: 'EUR', regex: /€\s*([\d\s,]+[.,]\d{2})/g },
      { currency: 'GBP', regex: /£\s*([\d,]+\.\d{2})/g },
      { currency: 'USD', regex: /\$\s*([\d,]+\.\d{2})/g },
    ];

    for (const { currency, regex } of currencyMatches) {
      const allAmounts = [...text.matchAll(regex)];
      if (allAmounts.length >= 1 && allAmounts.length <= 5) {
        const amounts = allAmounts
          .map((m) => this.parseAmount(m[1], currency))
          .filter((a) => a > 0 && a < 500000);

        if (amounts.length > 0) {
          return { amount: Math.max(...amounts), currency };
        }
      }
    }

    return { amount: 0, currency: 'USD' };
  }

  private parseAmount(amountStr: string, currency: string): number {
    let cleaned = amountStr.replace(/\s/g, '');

    if (currency === 'EUR') {
      if (/,\d{2}$/.test(cleaned)) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
      }
    }

    cleaned = cleaned.replace(/[']/g, '').replace(/,(?=\d{3})/g, '');

    const amount = parseFloat(cleaned);
    return isNaN(amount) ? 0 : amount;
  }

  private extractOrderNumber(text: string): string {
    const patterns = [
      /order\s*(?:#|number|no\.?)[:\s]*([A-Z0-9][A-Z0-9-]{4,20})/i,
      /confirmation\s*(?:#|number|no\.?)[:\s]*([A-Z0-9][A-Z0-9-]{4,20})/i,
      /(?:order|reference)\s+(?:id|#)[:\s]*([A-Z0-9][A-Z0-9-]{4,20})/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const orderNum = match[1].trim();
        if (this.isValidOrderNumber(orderNum)) {
          return orderNum;
        }
      }
    }

    return '';
  }

  private isValidOrderNumber(orderNum: string): boolean {
    if (!orderNum || orderNum.length < 5 || orderNum.length > 30) {
      return false;
    }
    if (!/^[A-Z0-9]/i.test(orderNum)) {
      return false;
    }
    if (!/^[A-Z0-9-]+$/i.test(orderNum)) {
      return false;
    }
    const cssPatterns = ['-collapse', '-color', '-width', '-height', '-size'];
    for (const pattern of cssPatterns) {
      if (orderNum.toLowerCase().includes(pattern)) {
        return false;
      }
    }
    return true;
  }

  private findKnownMerchant(domain: string): string | null {
    if (this.knownMerchants[domain]) {
      return this.knownMerchants[domain];
    }

    for (const [merchantDomain, name] of Object.entries(this.knownMerchants)) {
      if (domain === merchantDomain || domain.endsWith('.' + merchantDomain)) {
        return name;
      }
    }

    return null;
  }

  private formatDomainAsMerchant(domain: string): string {
    if (!domain) return '';

    const parts = domain.split('.');
    if (parts.length < 2) return '';

    let mainPart = parts.length > 2 ? parts[parts.length - 2] : parts[0];

    const skipWords = ['mail', 'email', 'noreply', 'orders', 'receipts', 'billing'];
    if (skipWords.includes(mainPart.toLowerCase()) && parts.length > 2) {
      mainPart = parts[parts.length - 2];
    }

    return mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
  }

  /**
   * Get the category for a merchant
   * @param merchant - Merchant name
   * @returns Purchase category
   */
  getCategory(merchant: string): PurchaseCategory {
    const lowerMerchant = merchant.toLowerCase();

    for (const [key, category] of Object.entries(this.merchantCategories)) {
      if (lowerMerchant.includes(key.toLowerCase())) {
        return category;
      }
    }

    return 'other';
  }

  /**
   * Get all known merchants
   * @returns List of known merchant domains with names
   */
  getKnownMerchants(): { domain: string; name: string }[] {
    return Object.entries(this.knownMerchants).map(([domain, name]) => ({
      domain,
      name,
    }));
  }
}

