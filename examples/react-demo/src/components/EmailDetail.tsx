/**
 * EmailDetail - Full email view with HTML rendering
 */

import { useMemo } from 'react';
import { DBEmail } from '../lib/db';

interface EmailDetailProps {
  email: DBEmail;
  onBack: () => void;
}

/**
 * Basic HTML sanitization - removes script tags and event handlers
 * For production, use a library like DOMPurify
 */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

export function EmailDetail({ email, onBack }: EmailDetailProps) {
  // Determine if we should render HTML
  const hasHtmlContent = useMemo(() => {
    // Use HTML view if htmlBody exists and contains HTML tags
    if (email.htmlBody && email.htmlBody.includes('<')) {
      return true;
    }
    // Also use HTML view if body contains HTML tags (some parsers put HTML in body)
    if (email.body && email.body.includes('<html') || email.body?.includes('<body')) {
      return true;
    }
    return false;
  }, [email.htmlBody, email.body]);

  // Get the best content to display
  const displayContent = useMemo(() => {
    // Prefer htmlBody for HTML rendering
    if (hasHtmlContent) {
      return email.htmlBody || email.body || '';
    }
    // For plain text, prefer body
    return email.body || '';
  }, [email.body, email.htmlBody, hasHtmlContent]);

  // Create iframe srcDoc for safe HTML rendering
  const iframeSrcDoc = useMemo(() => {
    if (!hasHtmlContent || !displayContent) return '';
    
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              font-size: 14px;
              line-height: 1.6;
              color: #1e293b;
              padding: 16px;
              margin: 0;
              background: #f8fafc;
            }
            img { max-width: 100%; height: auto; }
            a { color: #2563eb; }
            table { max-width: 100%; }
            pre { white-space: pre-wrap; word-wrap: break-word; }
          </style>
        </head>
        <body>${sanitizeHtml(displayContent)}</body>
      </html>
    `;
  }, [displayContent, hasHtmlContent]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          ← Back to list
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          {email.subject || '(No Subject)'}
        </h1>

        <div className="flex gap-6 text-sm text-gray-600 mb-4 flex-wrap">
          <span>
            <strong>From:</strong> {email.senderName ? `${email.senderName} ` : ''}&lt;{email.sender}&gt;
          </span>
          <span>
            <strong>Date:</strong> {new Date(email.date).toLocaleString()}
          </span>
        </div>

        {email.labels && email.labels.length > 0 && (
          <div className="flex gap-1 mb-6 flex-wrap">
            {email.labels.map((label, i) => (
              <span
                key={i}
                className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded uppercase"
              >
                {label}
              </span>
            ))}
          </div>
        )}

        {/* Email Body - render HTML in iframe or plain text */}
        {hasHtmlContent ? (
          <iframe
            srcDoc={iframeSrcDoc}
            className="w-full border border-gray-200 rounded-lg bg-white"
            style={{ minHeight: '400px', height: '60vh' }}
            title="Email content"
            sandbox="allow-same-origin"
          />
        ) : (
          <div className="bg-gray-50 rounded-lg p-5 whitespace-pre-wrap text-sm leading-relaxed max-h-[500px] overflow-y-auto">
            {displayContent || '(No content)'}
          </div>
        )}
      </div>
    </div>
  );
}

