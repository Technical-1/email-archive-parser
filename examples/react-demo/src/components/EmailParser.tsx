/**
 * EmailParser - Main component for parsing and displaying email archives
 * 
 * Usage:
 * ```tsx
 * import { EmailParser } from './components/EmailParser';
 * 
 * function App() {
 *   return <EmailParser />;
 * }
 * ```
 */

import React, { useState, useCallback } from 'react';
import { useEmailDB } from '../hooks/useEmailDB';
import { UploadZone } from './UploadZone';
import { EmailList } from './EmailList';
import { EmailDetail } from './EmailDetail';
import { ContactList } from './ContactList';
import { CalendarList } from './CalendarList';
import { DBEmail } from '../lib/db';

type Tab = 'emails' | 'contacts' | 'calendar';

export function EmailParser() {
  const {
    stats,
    isLoading,
    isParsing,
    progress,
    error,
    parseFile,
    clearData,
    getEmails,
    getEmail,
    getContacts,
    getCalendarEvents,
  } = useEmailDB();

  const [activeTab, setActiveTab] = useState<Tab>('emails');
  const [selectedEmail, setSelectedEmail] = useState<DBEmail | null>(null);
  
  // Persist page state for each tab
  const [emailPage, setEmailPage] = useState(1);
  const [contactPage, setContactPage] = useState(1);
  const [calendarPage, setCalendarPage] = useState(1);

  const handleFileSelect = useCallback(async (file: File) => {
    await parseFile(file);
  }, [parseFile]);

  const handleEmailSelect = useCallback(async (id: number) => {
    const email = await getEmail(id);
    if (email) {
      setSelectedEmail(email);
    }
  }, [getEmail]);

  const handleBackToList = useCallback(() => {
    setSelectedEmail(null);
  }, []);

  const handleClearData = useCallback(async () => {
    if (window.confirm('Are you sure you want to delete all data? This cannot be undone.')) {
      await clearData();
      setSelectedEmail(null);
    }
  }, [clearData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  const hasData = stats.emailCount > 0 || stats.contactCount > 0;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-5">
          <h1 className="text-2xl font-bold text-gray-900">📧 Email Parser</h1>
        </div>

        <nav className="flex-1 px-3">
          <button
            onClick={() => { setActiveTab('emails'); setSelectedEmail(null); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors ${
              activeTab === 'emails' 
                ? 'bg-blue-600 text-white' 
                : 'hover:bg-gray-100 text-gray-700'
            }`}
          >
            <span>📬</span>
            <span>Emails</span>
            <span className={`ml-auto text-sm px-2 py-0.5 rounded-full ${
              activeTab === 'emails' ? 'bg-white/20' : 'bg-blue-100 text-blue-600'
            }`}>
              {stats.emailCount.toLocaleString()}
            </span>
          </button>

          <button
            onClick={() => { setActiveTab('contacts'); setSelectedEmail(null); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors ${
              activeTab === 'contacts' 
                ? 'bg-blue-600 text-white' 
                : 'hover:bg-gray-100 text-gray-700'
            }`}
          >
            <span>👥</span>
            <span>Contacts</span>
            <span className={`ml-auto text-sm px-2 py-0.5 rounded-full ${
              activeTab === 'contacts' ? 'bg-white/20' : 'bg-blue-100 text-blue-600'
            }`}>
              {stats.contactCount.toLocaleString()}
            </span>
          </button>

          <button
            onClick={() => { setActiveTab('calendar'); setSelectedEmail(null); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors ${
              activeTab === 'calendar' 
                ? 'bg-blue-600 text-white' 
                : 'hover:bg-gray-100 text-gray-700'
            }`}
          >
            <span>📅</span>
            <span>Calendar</span>
            <span className={`ml-auto text-sm px-2 py-0.5 rounded-full ${
              activeTab === 'calendar' ? 'bg-white/20' : 'bg-blue-100 text-blue-600'
            }`}>
              {stats.calendarCount.toLocaleString()}
            </span>
          </button>
        </nav>

        {hasData && (
          <div className="p-4 border-t border-gray-200">
            <button
              onClick={handleClearData}
              className="w-full px-4 py-2 text-sm text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            >
              🗑️ Clear All Data
            </button>
            <p className="text-xs text-gray-400 text-center mt-2">
              Data stored locally in IndexedDB
            </p>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Error Display */}
        {error && (
          <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex-shrink-0">
            {error}
          </div>
        )}

        {/* Upload Zone or Progress */}
        {!hasData && !isParsing && (
          <div className="flex-1 p-6">
            <UploadZone onFileSelect={handleFileSelect} />
          </div>
        )}

        {isParsing && progress && (
          <div className="p-6">
            <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-blue-600 h-full transition-all duration-300"
                style={{ width: `${progress.progress}%` }}
              />
            </div>
            <p className="text-center text-gray-600 mt-2">{progress.message}</p>
          </div>
        )}

        {/* Stats - Sticky Top */}
        {hasData && (
          <div className="grid grid-cols-4 gap-4 p-4 bg-gray-50 border-b border-gray-200 flex-shrink-0">
            <div className="bg-white p-4 rounded-xl border border-gray-200 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.emailCount.toLocaleString()}</div>
              <div className="text-xs text-gray-500">Emails</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.contactCount.toLocaleString()}</div>
              <div className="text-xs text-gray-500">Contacts</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.calendarCount.toLocaleString()}</div>
              <div className="text-xs text-gray-500">Events</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.labelCount.toLocaleString()}</div>
              <div className="text-xs text-gray-500">Labels</div>
            </div>
          </div>
        )}

        {/* Content Panel - Fills remaining space */}
        {hasData && (
          <div className="flex-1 bg-white overflow-hidden flex flex-col min-h-0">
            {selectedEmail ? (
              <EmailDetail email={selectedEmail} onBack={handleBackToList} />
            ) : activeTab === 'emails' ? (
              <EmailList 
                getEmails={getEmails} 
                totalCount={stats.emailCount}
                onEmailSelect={handleEmailSelect}
                page={emailPage}
                onPageChange={setEmailPage}
              />
            ) : activeTab === 'contacts' ? (
              <ContactList 
                getContacts={getContacts}
                totalCount={stats.contactCount}
                page={contactPage}
                onPageChange={setContactPage}
              />
            ) : (
              <CalendarList 
                getEvents={getCalendarEvents}
                totalCount={stats.calendarCount}
                page={calendarPage}
                onPageChange={setCalendarPage}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

