/**
 * OLM Parser - MBOX Format Parser
 * @packageDocumentation
 */

import type { Email, ParseOptions, ParseResult, ParseProgress } from '../types';
import {
  cleanEmailAddress,
  normalizeSubject,
  decodeQuotedPrintable,
  decodeHeaderValue,
} from '../utils';

/**
 * Callback for streaming email processing (for large files)
 */
export type EmailBatchCallback = (emails: Omit<Email, 'id'>[], batchNumber: number) => Promise<void>;

/**
 * Parser for MBOX email archive format
 * Compatible with Gmail Takeout, Mozilla Thunderbird, and other email clients
 * 
 * Features:
 * - Streaming/chunked processing for large files
 * - MIME multipart parsing
 * - Gmail label support
 * - Multi-encoding support (quoted-printable, base64)
 *
 * @example
 * ```typescript
 * import { MBOXParser } from '@jacobkanfer/olm-parser';
 *
 * const parser = new MBOXParser();
 * const result = await parser.parse(file, {
 *   onProgress: (progress) => console.log(progress.message),
 * });
 *
 * console.log(`Parsed ${result.emails.length} emails`);
 * ```
 */
export class MBOXParser {
  private readonly CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
  private readonly BATCH_SIZE = 100; // Process 100 emails at a time

  /**
   * Parse an MBOX file
   * @param file - File object (browser) or Buffer (Node.js)
   * @param options - Parsing options
   * @returns Parsed data
   */
  async parse(
    file: File | Buffer | ArrayBuffer,
    options: ParseOptions = {}
  ): Promise<ParseResult> {
    const { onProgress } = options;

    const result: ParseResult = {
      emails: [],
      contacts: [],
      calendarEvents: [],
      stats: {
        emailCount: 0,
        contactCount: 0,
        calendarEventCount: 0,
        accountCount: 0,
        purchaseCount: 0,
        subscriptionCount: 0,
        newsletterCount: 0,
      },
    };

    // For File objects, use streaming for large files
    if (file instanceof File && file.size > 20 * 1024 * 1024) {
      const count = await this.parseStreaming(file, onProgress, async (batch) => {
        result.emails.push(...(batch as Email[]));
      });
      result.stats.emailCount = count;
      return result;
    }

    // For smaller files or Buffers, use simple parsing
    this.reportProgress(onProgress, 'extracting', 0, 'Reading MBOX file...');

    let text: string;
    if (file instanceof File) {
      text = await file.text();
    } else if (Buffer.isBuffer(file)) {
      text = file.toString('utf-8');
    } else {
      text = new TextDecoder().decode(file);
    }

    // Normalize line endings
    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalizedText.split('\n');

    let currentEmail: string[] = [];
    let totalEmails = 0;
    let processedEmails = 0;

    // Count emails first
    for (const line of lines) {
      if (this.isFromLine(line)) {
        totalEmails++;
      }
    }

    this.reportProgress(
      onProgress,
      'parsing_emails',
      10,
      `Found ${totalEmails} emails, parsing...`
    );

    // Parse emails
    for (const line of lines) {
      if (this.isFromLine(line) && currentEmail.length > 0) {
        const email = this.parseEmailFromLines(currentEmail);
        if (email) {
          result.emails.push(email as Email);
          result.stats.emailCount++;
          processedEmails++;

          if (processedEmails % 100 === 0) {
            const progress = 10 + (processedEmails / totalEmails) * 90;
            this.reportProgress(
              onProgress,
              'parsing_emails',
              progress,
              `Parsed ${processedEmails} of ${totalEmails} emails`
            );
          }
        }
        currentEmail = [];
      }

      currentEmail.push(line);
    }

    // Parse last email
    if (currentEmail.length > 0 && currentEmail.some((line) => line.trim().length > 0)) {
      const email = this.parseEmailFromLines(currentEmail);
      if (email) {
        result.emails.push(email as Email);
        result.stats.emailCount++;
      }
    }

    this.reportProgress(
      onProgress,
      'complete',
      100,
      `Parsed ${result.stats.emailCount} emails successfully`
    );

    return result;
  }

  /**
   * Parse an MBOX file with streaming batch processing
   * More memory efficient for large files
   * @param file - File to parse
   * @param onProgress - Progress callback
   * @param onBatch - Callback for each batch of parsed emails
   * @returns Total number of emails parsed
   */
  async parseStreaming(
    file: File,
    onProgress?: (progress: ParseProgress) => void,
    onBatch?: EmailBatchCallback
  ): Promise<number> {
    const fileSize = file.size;
    let offset = 0;
    let leftover = '';
    let totalEmailsParsed = 0;
    let currentBatch: Omit<Email, 'id'>[] = [];
    let batchNumber = 0;

    this.reportProgress(
      onProgress,
      'extracting',
      0,
      `Processing ${(fileSize / 1024 / 1024).toFixed(1)}MB file...`
    );

    while (offset < fileSize) {
      const chunkEnd = Math.min(offset + this.CHUNK_SIZE, fileSize);
      const chunk = file.slice(offset, chunkEnd);

      let chunkText: string;
      try {
        chunkText = await chunk.text();
      } catch (e) {
        console.error('Error reading chunk:', e);
        break;
      }

      const textToProcess = leftover + chunkText;
      const lastFromIndex = this.findLastFromLine(textToProcess);

      let processableText: string;
      if (lastFromIndex > 0 && chunkEnd < fileSize) {
        processableText = textToProcess.substring(0, lastFromIndex);
        leftover = textToProcess.substring(lastFromIndex);
      } else {
        processableText = textToProcess;
        leftover = '';
      }

      // Parse emails from this chunk
      const chunkEmails = this.parseEmailsFromText(processableText);

      for (const email of chunkEmails) {
        currentBatch.push(email);

        if (currentBatch.length >= this.BATCH_SIZE) {
          if (onBatch) {
            await onBatch(currentBatch, batchNumber);
          }
          totalEmailsParsed += currentBatch.length;
          batchNumber++;
          currentBatch = [];

          // Yield to UI
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      offset = chunkEnd;
      const progress = Math.round((offset / fileSize) * 95);
      this.reportProgress(
        onProgress,
        'parsing_emails',
        progress,
        `Parsed ${totalEmailsParsed + currentBatch.length} emails (${Math.round((offset / fileSize) * 100)}% read)...`
      );

      // Yield to prevent UI blocking
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // Process remaining text
    if (leftover.trim()) {
      const finalEmails = this.parseEmailsFromText(leftover);
      for (const email of finalEmails) {
        currentBatch.push(email);
      }
    }

    // Process final batch
    if (currentBatch.length > 0 && onBatch) {
      await onBatch(currentBatch, batchNumber);
      totalEmailsParsed += currentBatch.length;
    }

    this.reportProgress(
      onProgress,
      'complete',
      100,
      `Parsed ${totalEmailsParsed} emails successfully`
    );

    return totalEmailsParsed;
  }

  private reportProgress(
    callback: ((progress: ParseProgress) => void) | undefined,
    stage: ParseProgress['stage'],
    progress: number,
    message: string
  ): void {
    callback?.({ stage, progress, message });
  }

  /**
   * Check if a line is a valid MBOX "From " line
   */
  private isFromLine(line: string): boolean {
    if (!line.startsWith('From ')) return false;
    // Validate with day pattern (e.g., "From user@example.com Mon Jan 01 00:00:00 2024")
    const dayPattern = /(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/;
    return dayPattern.test(line);
  }

  /**
   * Find the index of the last "From " line in text
   */
  private findLastFromLine(text: string): number {
    let lastIndex = -1;
    let searchStart = text.length - 1;

    while (searchStart > 0) {
      let idx = text.lastIndexOf('\nFrom ', searchStart);

      if (idx === -1) break;

      const lineStart = idx + 1;
      let lineEnd = text.indexOf('\n', lineStart);
      if (lineEnd === -1) lineEnd = text.length;
      const line = text.substring(lineStart, lineEnd);

      if (this.isFromLine(line)) {
        lastIndex = lineStart;
        break;
      }
      searchStart = idx - 1;
    }

    // Check if text starts with "From "
    if (lastIndex === -1 && text.startsWith('From ')) {
      let lineEnd = text.indexOf('\n');
      if (lineEnd === -1) lineEnd = text.length;
      const line = text.substring(0, lineEnd);
      if (this.isFromLine(line)) {
        lastIndex = 0;
      }
    }

    return lastIndex;
  }

  /**
   * Parse multiple emails from a text block
   */
  private parseEmailsFromText(text: string): Omit<Email, 'id'>[] {
    const emails: Omit<Email, 'id'>[] = [];
    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalizedText.split('\n');
    let currentEmail: string[] = [];

    for (const line of lines) {
      if (this.isFromLine(line) && currentEmail.length > 0) {
        const email = this.parseEmailFromLines(currentEmail);
        if (email) {
          emails.push(email);
        }
        currentEmail = [];
      }
      currentEmail.push(line);
    }

    // Parse last email in chunk
    if (currentEmail.length > 0 && currentEmail.some((line) => line.trim().length > 0)) {
      const email = this.parseEmailFromLines(currentEmail);
      if (email) {
        emails.push(email);
      }
    }

    return emails;
  }

  /**
   * Parse a single email from raw lines
   */
  private parseEmailFromLines(lines: string[]): Omit<Email, 'id'> | null {
    try {
      if (lines.length < 2) return null;

      const headers: Record<string, string> = {};
      let bodyStartIndex = 0;
      let inHeaders = true;

      // Parse headers (skip the "From " line)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];

        if (line.trim() === '') {
          bodyStartIndex = i + 1;
          inHeaders = false;
          break;
        }

        if (inHeaders) {
          if (line.match(/^\s+/) && Object.keys(headers).length > 0) {
            const lastKey = Object.keys(headers).pop()!;
            headers[lastKey] += ' ' + line.trim();
          } else {
            const match = line.match(/^([^:]+):\s*(.*)$/);
            if (match) {
              const key = match[1].toLowerCase();
              headers[key] = match[2];
            }
          }
        }
      }

      if (inHeaders) {
        bodyStartIndex = lines.length;
      }

      // Extract body content
      const bodyLines = lines.slice(bodyStartIndex);
      const rawBody = bodyLines.join('\n');

      // Parse body based on content type
      const contentType = headers['content-type'] || 'text/plain';
      let body = '';
      let htmlBody: string | undefined;

      if (contentType.includes('multipart/')) {
        // Extract boundary from content-type
        const boundaryMatch = contentType.match(/boundary=["']?([^"';\s]+)["']?/i);
        if (boundaryMatch) {
          const boundary = boundaryMatch[1];
          const parts = this.parseMimeParts(rawBody, boundary);
          body = parts.text || '';
          htmlBody = parts.html;
        } else {
          body = rawBody;
        }
      } else {
        // Single part email
        body = rawBody;
        const encoding = headers['content-transfer-encoding']?.toLowerCase();
        if (encoding === 'quoted-printable') {
          body = decodeQuotedPrintable(body);
        } else if (encoding === 'base64') {
          body = this.decodeBase64(body.replace(/\s/g, ''));
        }

        if (contentType.includes('text/html')) {
          htmlBody = body;
        }
      }

      const dateStr = headers['date'] || '';
      const date = this.parseDate(dateStr);

      const from = headers['from'] || '';
      const { email: sender, name: senderName } = this.parseEmailAddress(from);

      const to = headers['to'] || '';
      const recipients = this.parseRecipients(to);

      const subject = decodeHeaderValue(headers['subject'] || '(No Subject)');

      // Extract thread ID (with Gmail support)
      let threadId =
        headers['x-gm-thrid'] ||
        headers['thread-topic'] ||
        headers['references']?.split(/\s+/)[0] ||
        headers['in-reply-to'];

      if (!threadId) {
        const normalizedSubj = normalizeSubject(subject);
        if (normalizedSubj) {
          threadId = `subject:${normalizedSubj.toLowerCase().replace(/\s+/g, '-')}`;
        }
      }

      // Parse Gmail labels for folder assignment
      const gmailLabels = headers['x-gmail-labels'] || '';
      const folderId = this.mapGmailLabelsToFolder(gmailLabels);
      const isRead = !gmailLabels.toLowerCase().includes('unread');
      const isStarred = gmailLabels.toLowerCase().includes('starred');

      if (!sender && !subject) {
        return null;
      }

      return {
        subject,
        sender: cleanEmailAddress(sender),
        senderName: senderName || undefined,
        recipients,
        date: date || new Date(),
        body: body.trim() || (htmlBody ? this.stripHtml(htmlBody) : ''),
        htmlBody,
        attachments: [],
        size: Math.min(lines.join('\n').length, 100000), // Cap size calculation
        isRead,
        isStarred,
        folderId,
        threadId,
      };
    } catch (error) {
      console.warn('Failed to parse email:', error);
      return null;
    }
  }

  /**
   * Parse Gmail labels and return the primary folder ID
   */
  private mapGmailLabelsToFolder(labels: string): string {
    const labelList = this.parseGmailLabels(labels);

    // Priority order for folder assignment
    if (labelList.includes('inbox')) return 'inbox';
    if (labelList.includes('sent') || labelList.includes('sent mail')) return 'sent';
    if (labelList.includes('draft') || labelList.includes('drafts')) return 'drafts';
    if (labelList.includes('spam')) return 'spam';
    if (labelList.includes('trash')) return 'trash';

    // Check for custom labels (not category/system labels)
    const customLabels = labelList.filter(
      (l) =>
        !l.startsWith('category ') &&
        !['opened', 'unread', 'starred', 'important', 'all mail'].includes(l)
    );

    if (customLabels.length > 0) {
      return this.labelToFolderId(customLabels[0]);
    }

    return 'archive';
  }

  /**
   * Parse the X-Gmail-Labels header into an array of label names
   */
  parseGmailLabels(labelsHeader: string): string[] {
    if (!labelsHeader) return [];

    const labels: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of labelsHeader) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        if (current.trim()) {
          labels.push(current.trim().toLowerCase());
        }
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      labels.push(current.trim().toLowerCase());
    }

    return labels;
  }

  /**
   * Convert a label name to a valid folder ID
   */
  private labelToFolderId(label: string): string {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
  }

  /**
   * Get all unique folder IDs from a labels header
   */
  getAllFolderIdsFromLabels(labelsHeader: string): string[] {
    const labels = this.parseGmailLabels(labelsHeader);
    const folderIds = new Set<string>();

    if (labels.includes('inbox')) folderIds.add('inbox');
    if (labels.includes('sent') || labels.includes('sent mail')) folderIds.add('sent');
    if (labels.includes('draft') || labels.includes('drafts')) folderIds.add('drafts');
    if (labels.includes('spam')) folderIds.add('spam');
    if (labels.includes('trash')) folderIds.add('trash');

    for (const label of labels) {
      if (
        !label.startsWith('category ') &&
        ![
          'opened',
          'unread',
          'starred',
          'important',
          'all mail',
          'inbox',
          'sent',
          'sent mail',
          'draft',
          'drafts',
          'spam',
          'trash',
        ].includes(label)
      ) {
        folderIds.add(this.labelToFolderId(label));
      }
    }

    return Array.from(folderIds);
  }

  /**
   * Parse MIME multipart content and extract text/html parts
   */
  private parseMimeParts(body: string, boundary: string): { text?: string; html?: string } {
    const result: { text?: string; html?: string } = {};

    const boundaryMarker = '--' + boundary;
    const parts = body.split(boundaryMarker);

    for (const part of parts) {
      if (!part.trim() || part.trim() === '--') continue;

      const headerEndIndex = part.indexOf('\n\n');
      if (headerEndIndex === -1) continue;

      const partHeaders = part.substring(0, headerEndIndex);
      let partContent = part.substring(headerEndIndex + 2);

      const contentTypeMatch = partHeaders.match(/content-type:\s*([^;\n]+)/i);
      const encodingMatch = partHeaders.match(/content-transfer-encoding:\s*(\S+)/i);

      if (!contentTypeMatch) continue;

      const partContentType = contentTypeMatch[1].toLowerCase().trim();
      const partEncoding = encodingMatch?.[1]?.toLowerCase() || '7bit';

      // Handle nested multipart
      if (partContentType.includes('multipart/')) {
        const nestedBoundaryMatch = partHeaders.match(/boundary=["']?([^"';\s\n]+)["']?/i);
        if (nestedBoundaryMatch) {
          const nestedResult = this.parseMimeParts(partContent, nestedBoundaryMatch[1]);
          if (nestedResult.text && !result.text) result.text = nestedResult.text;
          if (nestedResult.html && !result.html) result.html = nestedResult.html;
        }
        continue;
      }

      // Decode content
      partContent = partContent.trim();
      if (partEncoding === 'base64') {
        partContent = this.decodeBase64(partContent.replace(/\s/g, ''));
      } else if (partEncoding === 'quoted-printable') {
        partContent = decodeQuotedPrintable(partContent);
      }

      // Store based on content type
      if (partContentType.includes('text/plain') && !result.text) {
        result.text = partContent;
      } else if (partContentType.includes('text/html') && !result.html) {
        result.html = partContent;
      }
    }

    return result;
  }

  /**
   * Decode base64 with UTF-8 support
   */
  private decodeBase64(str: string): string {
    try {
      if (typeof atob !== 'undefined') {
        // Browser: use TextDecoder for proper UTF-8
        const binaryStr = atob(str);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        return new TextDecoder('utf-8').decode(bytes);
      } else {
        // Node.js
        return Buffer.from(str, 'base64').toString('utf-8');
      }
    } catch {
      // Fallback
      try {
        if (typeof atob !== 'undefined') {
          return atob(str);
        }
        return Buffer.from(str, 'base64').toString('utf-8');
      } catch {
        return str;
      }
    }
  }

  /**
   * Strip HTML tags to create plain text
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  private parseEmailAddress(str: string): { email: string; name?: string } {
    const trimmed = decodeHeaderValue(str.trim());

    const angleMatch = trimmed.match(/^(?:"?(.+?)"?\s*)?<([^>]+)>$/);
    if (angleMatch) {
      return {
        name: angleMatch[1]?.trim() || undefined,
        email: angleMatch[2]?.trim(),
      };
    }

    const emailMatch = trimmed.match(/^([^\s@]+@[^\s@]+\.[^\s@]+)$/);
    if (emailMatch) {
      return { email: emailMatch[1] };
    }

    return { email: trimmed };
  }

  private parseRecipients(str: string): string[] {
    if (!str) return [];

    return str
      .split(/[,;]/)
      .map((r) => {
        const { email } = this.parseEmailAddress(r.trim());
        return cleanEmailAddress(email);
      })
      .filter(Boolean);
  }

  private parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;

    try {
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  }

  /**
   * Check if a file is an MBOX archive
   * @param file - File to check
   * @returns True if the file appears to be an MBOX archive
   */
  static isMBOXFile(file: File): boolean {
    const name = file.name.toLowerCase();
    return (
      name.endsWith('.mbox') ||
      name.endsWith('.mbx') ||
      file.type === 'application/mbox'
    );
  }
}
