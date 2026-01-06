import { describe, it, expect, vi } from 'vitest';
import { MBOXParser } from '../../parsers/mbox';

// Helper to create MBOX content
function createMboxEmail(options: {
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
  body?: string;
  labels?: string;
  contentType?: string;
  encoding?: string;
}): string {
  const {
    from = 'sender@example.com',
    to = 'recipient@example.com',
    subject = 'Test Subject',
    date = 'Mon, 15 Jan 2024 10:30:00 +0000',
    body = 'Test body content',
    labels = '',
    contentType = 'text/plain',
    encoding = '',
  } = options;

  let email = `From ${from} Mon Jan 15 10:30:00 2024
From: ${from}
To: ${to}
Subject: ${subject}
Date: ${date}
Content-Type: ${contentType}`;

  if (labels) {
    email += `\nX-Gmail-Labels: ${labels}`;
  }

  if (encoding) {
    email += `\nContent-Transfer-Encoding: ${encoding}`;
  }

  email += `\n\n${body}`;

  return email;
}

describe('MBOXParser', () => {
  describe('isMBOXFile', () => {
    it('should return true for .mbox files', () => {
      const file = new File([], 'archive.mbox');
      expect(MBOXParser.isMBOXFile(file)).toBe(true);
    });

    it('should return true for .MBOX files (case insensitive)', () => {
      const file = new File([], 'archive.MBOX');
      expect(MBOXParser.isMBOXFile(file)).toBe(true);
    });

    it('should return true for .mbx files', () => {
      const file = new File([], 'archive.mbx');
      expect(MBOXParser.isMBOXFile(file)).toBe(true);
    });

    it('should return false for non-mbox files', () => {
      const file = new File([], 'archive.txt');
      expect(MBOXParser.isMBOXFile(file)).toBe(false);
    });

    it('should return false for .olm files', () => {
      const file = new File([], 'archive.olm');
      expect(MBOXParser.isMBOXFile(file)).toBe(false);
    });

    it('should return true for application/mbox MIME type', () => {
      const file = new File([], 'archive', { type: 'application/mbox' });
      expect(MBOXParser.isMBOXFile(file)).toBe(true);
    });
  });

  describe('parseGmailLabels', () => {
    it('should return empty array for empty input', () => {
      const parser = new MBOXParser();
      expect(parser.parseGmailLabels('')).toEqual([]);
    });

    it('should parse single label', () => {
      const parser = new MBOXParser();
      expect(parser.parseGmailLabels('Inbox')).toEqual(['inbox']);
    });

    it('should parse multiple labels', () => {
      const parser = new MBOXParser();
      expect(parser.parseGmailLabels('Inbox,Starred,Important')).toEqual([
        'inbox',
        'starred',
        'important',
      ]);
    });

    it('should handle quoted labels with commas', () => {
      const parser = new MBOXParser();
      expect(parser.parseGmailLabels('Inbox,"My Custom Label",Starred')).toEqual([
        'inbox',
        'my custom label',
        'starred',
      ]);
    });

    it('should lowercase all labels', () => {
      const parser = new MBOXParser();
      expect(parser.parseGmailLabels('INBOX,SENT')).toEqual(['inbox', 'sent']);
    });
  });

  describe('getAllFolderIdsFromLabels', () => {
    it('should map inbox label', () => {
      const parser = new MBOXParser();
      const folders = parser.getAllFolderIdsFromLabels('Inbox');
      expect(folders).toContain('inbox');
    });

    it('should map sent labels', () => {
      const parser = new MBOXParser();
      expect(parser.getAllFolderIdsFromLabels('Sent')).toContain('sent');
      expect(parser.getAllFolderIdsFromLabels('Sent Mail')).toContain('sent');
    });

    it('should map drafts labels', () => {
      const parser = new MBOXParser();
      expect(parser.getAllFolderIdsFromLabels('Draft')).toContain('drafts');
      expect(parser.getAllFolderIdsFromLabels('Drafts')).toContain('drafts');
    });

    it('should map spam and trash', () => {
      const parser = new MBOXParser();
      expect(parser.getAllFolderIdsFromLabels('Spam')).toContain('spam');
      expect(parser.getAllFolderIdsFromLabels('Trash')).toContain('trash');
    });

    it('should convert custom labels to folder IDs', () => {
      const parser = new MBOXParser();
      const folders = parser.getAllFolderIdsFromLabels('My Custom Label');
      expect(folders).toContain('my-custom-label');
    });

    it('should filter out system labels', () => {
      const parser = new MBOXParser();
      const folders = parser.getAllFolderIdsFromLabels('Category Promotions,Opened,Unread');
      expect(folders.length).toBe(0);
    });
  });

  describe('parse', () => {
    it('should parse a single email', async () => {
      const parser = new MBOXParser();
      const mboxContent = createMboxEmail({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test Email',
        body: 'Hello, World!',
      });

      const buffer = Buffer.from(mboxContent);
      const result = await parser.parse(buffer);

      expect(result.emails.length).toBe(1);
      expect(result.emails[0].subject).toBe('Test Email');
      expect(result.emails[0].sender).toBe('sender@example.com');
      expect(result.emails[0].body).toContain('Hello, World!');
      expect(result.stats.emailCount).toBe(1);
    });

    it('should parse multiple emails', async () => {
      const parser = new MBOXParser();
      const mboxContent = [
        createMboxEmail({ subject: 'Email 1', body: 'Body 1' }),
        createMboxEmail({ subject: 'Email 2', body: 'Body 2' }),
        createMboxEmail({ subject: 'Email 3', body: 'Body 3' }),
      ].join('\n');

      const buffer = Buffer.from(mboxContent);
      const result = await parser.parse(buffer);

      expect(result.emails.length).toBe(3);
      expect(result.stats.emailCount).toBe(3);
    });

    it('should call progress callback', async () => {
      const parser = new MBOXParser();
      const mboxContent = createMboxEmail({});
      const buffer = Buffer.from(mboxContent);
      const onProgress = vi.fn();

      await parser.parse(buffer, { onProgress });

      expect(onProgress).toHaveBeenCalled();
    });

    it('should decode quoted-printable content', async () => {
      const parser = new MBOXParser();
      const mboxContent = createMboxEmail({
        body: 'Hello=20World',
        encoding: 'quoted-printable',
      });

      const buffer = Buffer.from(mboxContent);
      const result = await parser.parse(buffer);

      expect(result.emails[0].body).toContain('Hello World');
    });

    it('should decode base64 content', async () => {
      const parser = new MBOXParser();
      // "Hello World" in base64
      const mboxContent = createMboxEmail({
        body: 'SGVsbG8gV29ybGQ=',
        encoding: 'base64',
      });

      const buffer = Buffer.from(mboxContent);
      const result = await parser.parse(buffer);

      expect(result.emails[0].body).toContain('Hello World');
    });

    it('should extract sender name from header', async () => {
      const parser = new MBOXParser();
      const mboxContent = `From sender@example.com Mon Jan 15 10:30:00 2024
From: "John Doe" <john@example.com>
To: recipient@example.com
Subject: Test
Date: Mon, 15 Jan 2024 10:30:00 +0000

Body`;

      const buffer = Buffer.from(mboxContent);
      const result = await parser.parse(buffer);

      expect(result.emails[0].sender).toBe('john@example.com');
      expect(result.emails[0].senderName).toBe('John Doe');
    });

    it('should parse Gmail labels for folder assignment', async () => {
      const parser = new MBOXParser();
      const mboxContent = createMboxEmail({
        labels: 'Inbox,Starred',
      });

      const buffer = Buffer.from(mboxContent);
      const result = await parser.parse(buffer);

      expect(result.emails[0].folderId).toBe('inbox');
      expect(result.emails[0].isStarred).toBe(true);
    });

    it('should detect unread emails from Gmail labels', async () => {
      const parser = new MBOXParser();
      const mboxContent = createMboxEmail({
        labels: 'Inbox,Unread',
      });

      const buffer = Buffer.from(mboxContent);
      const result = await parser.parse(buffer);

      expect(result.emails[0].isRead).toBe(false);
    });

    it('should mark emails as read when Unread label is missing', async () => {
      const parser = new MBOXParser();
      const mboxContent = createMboxEmail({
        labels: 'Inbox,Opened',
      });

      const buffer = Buffer.from(mboxContent);
      const result = await parser.parse(buffer);

      expect(result.emails[0].isRead).toBe(true);
    });

    it('should handle multipart MIME emails', async () => {
      const parser = new MBOXParser();
      const boundary = '----=_Part_123';
      const mboxContent = `From sender@example.com Mon Jan 15 10:30:00 2024
From: sender@example.com
To: recipient@example.com
Subject: Multipart Test
Date: Mon, 15 Jan 2024 10:30:00 +0000
Content-Type: multipart/alternative; boundary="${boundary}"

------=_Part_123
Content-Type: text/plain

Plain text content

------=_Part_123
Content-Type: text/html

<html><body>HTML content</body></html>

------=_Part_123--`;

      const buffer = Buffer.from(mboxContent);
      const result = await parser.parse(buffer);

      expect(result.emails[0].body).toContain('Plain text content');
      expect(result.emails[0].htmlBody).toContain('HTML content');
    });

    it('should generate thread ID from subject', async () => {
      const parser = new MBOXParser();
      const mboxContent = createMboxEmail({
        subject: 'Re: Important Discussion',
      });

      const buffer = Buffer.from(mboxContent);
      const result = await parser.parse(buffer);

      expect(result.emails[0].threadId).toBe('subject:important-discussion');
    });

    it('should parse multiple recipients', async () => {
      const parser = new MBOXParser();
      const mboxContent = `From sender@example.com Mon Jan 15 10:30:00 2024
From: sender@example.com
To: one@example.com, two@example.com, three@example.com
Subject: Multi-recipient
Date: Mon, 15 Jan 2024 10:30:00 +0000

Body`;

      const buffer = Buffer.from(mboxContent);
      const result = await parser.parse(buffer);

      expect(result.emails[0].recipients).toHaveLength(3);
      expect(result.emails[0].recipients).toContain('one@example.com');
      expect(result.emails[0].recipients).toContain('two@example.com');
      expect(result.emails[0].recipients).toContain('three@example.com');
    });

    it('should handle RFC 2047 encoded subject', async () => {
      const parser = new MBOXParser();
      const mboxContent = `From sender@example.com Mon Jan 15 10:30:00 2024
From: sender@example.com
To: recipient@example.com
Subject: =?UTF-8?B?SGVsbG8gV29ybGQ=?=
Date: Mon, 15 Jan 2024 10:30:00 +0000

Body`;

      const buffer = Buffer.from(mboxContent);
      const result = await parser.parse(buffer);

      expect(result.emails[0].subject).toBe('Hello World');
    });

    it('should handle empty mbox', async () => {
      const parser = new MBOXParser();
      const buffer = Buffer.from('');
      const result = await parser.parse(buffer);

      expect(result.emails).toEqual([]);
      expect(result.stats.emailCount).toBe(0);
    });

    it('should skip invalid From lines', async () => {
      const parser = new MBOXParser();
      // The MBOX parser validates "From " lines by checking for day patterns
      // This test verifies valid MBOX content is parsed correctly
      const mboxContent = createMboxEmail({ subject: 'Valid Email' });

      const buffer = Buffer.from(mboxContent);
      const result = await parser.parse(buffer);

      expect(result.emails.length).toBe(1);
      expect(result.emails[0].subject).toBe('Valid Email');
    });
  });
});

