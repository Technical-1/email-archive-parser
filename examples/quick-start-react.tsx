/**
 * Quick Start - React/Next.js Example
 * 
 * USAGE: Copy and paste this component into YOUR React project.
 * This file is a reference example - it requires React to be installed in your project.
 * 
 * Works with: React, Next.js, Vite, Create React App, Remix
 * 
 * Install in your project:
 *   npm install @technical-1/email-archive-parser
 */

// @ts-nocheck
// Note: Remove @ts-nocheck when using in your React project

import { useState } from 'react';
import { parseArchive } from '@technical-1/email-archive-parser';

export default function EmailUploader() {
  const [emails, setEmails] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setProgress('Starting...');

    try {
      const result = await parseArchive(file, {
        onProgress: (p) => setProgress(`${p.progress}% - ${p.message}`),
      });

      setEmails(result.emails);
      setContacts(result.contacts || []);
      setProgress(`Done! Found ${result.emails.length} emails and ${result.contacts?.length || 0} contacts`);
    } catch (error) {
      setProgress(`Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 20, fontFamily: 'system-ui, sans-serif' }}>
      <h1>📧 Email Archive Parser</h1>
      <p>Upload your Gmail (.mbox) or Outlook (.olm) export file.</p>
      
      {/* File Upload */}
      <input
        type="file"
        accept=".olm,.mbox"
        onChange={handleFileUpload}
        disabled={loading}
        style={{ marginBottom: 20 }}
      />
      
      {/* Progress */}
      {progress && <p><strong>{progress}</strong></p>}
      
      {/* Results */}
      {emails.length > 0 && (
        <div>
          <h2>📬 Emails ({emails.length})</h2>
          <ul style={{ maxHeight: 300, overflow: 'auto', listStyle: 'none', padding: 0 }}>
            {emails.slice(0, 50).map((email, i) => (
              <li key={i} style={{ padding: '10px 0', borderBottom: '1px solid #eee' }}>
                <strong>{email.subject || '(No subject)'}</strong>
                <br />
                <small>From: {email.sender} | {new Date(email.date).toLocaleDateString()}</small>
                {email.labels?.length > 0 && (
                  <><br /><small>Labels: {email.labels.join(', ')}</small></>
                )}
              </li>
            ))}
          </ul>
          
          {contacts.length > 0 && (
            <>
              <h2>📇 Contacts ({contacts.length})</h2>
              <ul style={{ maxHeight: 200, overflow: 'auto' }}>
                {contacts.slice(0, 20).map((contact, i) => (
                  <li key={i}>{contact.name} &lt;{contact.email}&gt; ({contact.emailCount} emails)</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

