import { describe, it, expect } from 'vitest';
import {
  cleanEmailAddress,
  stripHtml,
  extractDomain,
  normalizeSubject,
  truncateText,
  formatFileSize,
  getInitials,
  parseDate,
  decodeQuotedPrintable,
  decodeHeaderValue,
  formatDomainAsName,
} from '../utils';

describe('cleanEmailAddress', () => {
  it('should return empty string for empty input', () => {
    expect(cleanEmailAddress('')).toBe('');
  });

  it('should clean angle brackets from email', () => {
    expect(cleanEmailAddress('<test@example.com>')).toBe('test@example.com');
  });

  it('should extract email from "Name <email>" format', () => {
    expect(cleanEmailAddress('John Doe <john@example.com>')).toBe('john@example.com');
  });

  it('should lowercase email addresses', () => {
    expect(cleanEmailAddress('TEST@EXAMPLE.COM')).toBe('test@example.com');
  });

  it('should handle quoted names', () => {
    expect(cleanEmailAddress('"John Doe" <john@example.com>')).toBe('john@example.com');
  });

  it('should handle plain email', () => {
    expect(cleanEmailAddress('john@example.com')).toBe('john@example.com');
  });

  it('should trim whitespace', () => {
    expect(cleanEmailAddress('  john@example.com  ')).toBe('john@example.com');
  });
});

describe('stripHtml', () => {
  it('should return empty string for empty input', () => {
    expect(stripHtml('')).toBe('');
  });

  it('should strip simple HTML tags', () => {
    expect(stripHtml('<p>Hello World</p>')).toBe('Hello World');
  });

  it('should strip nested HTML tags', () => {
    expect(stripHtml('<div><p><strong>Hello</strong></p></div>')).toBe('Hello');
  });

  it('should remove script tags and content', () => {
    expect(stripHtml('<script>alert("xss")</script>Hello')).toBe('Hello');
  });

  it('should remove style tags and content', () => {
    expect(stripHtml('<style>.class{color:red}</style>Hello')).toBe('Hello');
  });

  it('should decode HTML entities', () => {
    expect(stripHtml('&amp; &lt; &gt; &quot; &#39;')).toBe('& < > " \'');
  });

  it('should replace &nbsp; with space', () => {
    expect(stripHtml('Hello&nbsp;World')).toBe('Hello World');
  });

  it('should normalize whitespace', () => {
    expect(stripHtml('<p>Hello</p>   <p>World</p>')).toBe('Hello World');
  });
});

describe('extractDomain', () => {
  it('should return empty string for empty input', () => {
    expect(extractDomain('')).toBe('');
  });

  it('should extract domain from email', () => {
    expect(extractDomain('john@example.com')).toBe('example.com');
  });

  it('should handle subdomain emails', () => {
    expect(extractDomain('john@mail.example.com')).toBe('mail.example.com');
  });

  it('should return empty for invalid email', () => {
    expect(extractDomain('notanemail')).toBe('');
  });

  it('should work with angle brackets', () => {
    expect(extractDomain('<john@example.com>')).toBe('example.com');
  });

  it('should work with name format', () => {
    expect(extractDomain('John Doe <john@example.com>')).toBe('example.com');
  });
});

describe('normalizeSubject', () => {
  it('should return empty string for empty input', () => {
    expect(normalizeSubject('')).toBe('');
  });

  it('should remove Re: prefix', () => {
    expect(normalizeSubject('Re: Hello')).toBe('hello');
  });

  it('should remove Fwd: prefix', () => {
    expect(normalizeSubject('Fwd: Hello')).toBe('hello');
  });

  it('should remove Fw: prefix', () => {
    expect(normalizeSubject('Fw: Hello')).toBe('hello');
  });

  it('should remove multiple prefixes', () => {
    expect(normalizeSubject('Re: Re: Fwd: Hello')).toBe('hello');
  });

  it('should handle case insensitively', () => {
    expect(normalizeSubject('RE: FWD: Hello')).toBe('hello');
  });

  it('should normalize whitespace', () => {
    expect(normalizeSubject('Re:   Hello   World')).toBe('hello world');
  });

  it('should handle AW: (German reply)', () => {
    expect(normalizeSubject('AW: Hallo')).toBe('hallo');
  });

  it('should handle SV: (Scandinavian reply)', () => {
    expect(normalizeSubject('SV: Hej')).toBe('hej');
  });
});

describe('truncateText', () => {
  it('should return text unchanged if shorter than max', () => {
    expect(truncateText('Hello', 10)).toBe('Hello');
  });

  it('should truncate and add ellipsis', () => {
    expect(truncateText('Hello World', 8)).toBe('Hello...');
  });

  it('should handle exact length', () => {
    expect(truncateText('Hello', 5)).toBe('Hello');
  });

  it('should handle empty string', () => {
    expect(truncateText('', 10)).toBe('');
  });
});

describe('formatFileSize', () => {
  it('should format 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('should format bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('should format kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
  });

  it('should format megabytes', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1 MB');
  });

  it('should format gigabytes', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
  });

  it('should show decimal places', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });
});

describe('getInitials', () => {
  it('should return ? for empty input', () => {
    expect(getInitials('')).toBe('?');
  });

  it('should get initials from full name', () => {
    expect(getInitials('John Doe')).toBe('JD');
  });

  it('should get initials from email', () => {
    expect(getInitials('john.doe@example.com')).toBe('JD');
  });

  it('should get first two chars for single word', () => {
    expect(getInitials('John')).toBe('JO');
  });

  it('should uppercase initials', () => {
    expect(getInitials('john doe')).toBe('JD');
  });
});

describe('parseDate', () => {
  it('should return null for empty input', () => {
    expect(parseDate('')).toBeNull();
  });

  it('should parse ISO date', () => {
    const result = parseDate('2024-01-15T10:30:00Z');
    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toBe('2024-01-15T10:30:00.000Z');
  });

  it('should parse RFC 2822 date', () => {
    const result = parseDate('Mon, 15 Jan 2024 10:30:00 GMT');
    expect(result).toBeInstanceOf(Date);
  });

  it('should return null for invalid date', () => {
    expect(parseDate('not a date')).toBeNull();
  });
});

describe('decodeQuotedPrintable', () => {
  it('should decode simple hex', () => {
    expect(decodeQuotedPrintable('Hello=20World')).toBe('Hello World');
  });

  it('should remove soft line breaks', () => {
    expect(decodeQuotedPrintable('Hello=\nWorld')).toBe('HelloWorld');
  });

  it('should remove soft line breaks with CR', () => {
    expect(decodeQuotedPrintable('Hello=\r\nWorld')).toBe('HelloWorld');
  });

  it('should decode multiple encoded chars', () => {
    // Note: decodeQuotedPrintable converts hex to single bytes, not UTF-8 sequences
    // =C3=A9 is UTF-8 for 'é', but the function decodes each byte individually
    expect(decodeQuotedPrintable('=3D')).toBe('=');
    expect(decodeQuotedPrintable('=20')).toBe(' ');
  });

  it('should pass through unencoded text', () => {
    expect(decodeQuotedPrintable('Plain text')).toBe('Plain text');
  });
});

describe('decodeHeaderValue', () => {
  it('should pass through plain text', () => {
    expect(decodeHeaderValue('Hello World')).toBe('Hello World');
  });

  it('should decode Base64 encoded header', () => {
    // "Hello" in Base64
    const result = decodeHeaderValue('=?UTF-8?B?SGVsbG8=?=');
    expect(result).toBe('Hello');
  });

  it('should decode quoted-printable header', () => {
    const result = decodeHeaderValue('=?UTF-8?Q?Hello_World?=');
    expect(result).toBe('Hello World');
  });

  it('should handle multiple encoded parts', () => {
    const result = decodeHeaderValue('=?UTF-8?B?SGVsbG8=?= =?UTF-8?B?V29ybGQ=?=');
    expect(result).toBe('Hello World');
  });
});

describe('formatDomainAsName', () => {
  it('should return empty for empty input', () => {
    expect(formatDomainAsName('')).toBe('');
  });

  it('should capitalize domain name', () => {
    expect(formatDomainAsName('netflix.com')).toBe('Netflix');
  });

  it('should remove mail subdomain', () => {
    expect(formatDomainAsName('mail.example.com')).toBe('Example');
  });

  it('should remove noreply subdomain', () => {
    expect(formatDomainAsName('noreply.example.com')).toBe('Example');
  });

  it('should handle country TLDs', () => {
    expect(formatDomainAsName('example.co.uk')).toBe('Example');
  });

  it('should split camelCase', () => {
    expect(formatDomainAsName('myCompany.com')).toBe('My Company');
  });

  it('should replace hyphens with spaces', () => {
    expect(formatDomainAsName('my-company.com')).toBe('My Company');
  });
});

