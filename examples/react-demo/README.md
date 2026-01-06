# Email Archive Parser - React Demo

A complete React implementation demonstrating how to use `@technical-1/email-archive-parser` with IndexedDB storage for handling large files.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

## Features

- 📧 Parse OLM (Outlook) and MBOX (Gmail) files
- 💾 IndexedDB storage for unlimited file sizes
- 📱 Responsive UI with Tailwind CSS
- 🔍 Search and pagination
- 📬 Email detail view
- 👥 Contacts list
- 📅 Calendar events
- 🗑️ Clear data button

## Usage in Your Project

1. Copy the `src/` folder to your React project
2. Install the parser: `npm install @technical-1/email-archive-parser`
3. Import and use the components

```tsx
import { EmailParser } from './components/EmailParser';

function App() {
  return <EmailParser />;
}
```

## File Structure

```
src/
├── components/
│   ├── EmailParser.tsx      # Main component
│   ├── EmailList.tsx        # Email list with pagination
│   ├── EmailDetail.tsx      # Email detail view
│   ├── ContactList.tsx      # Contacts list
│   ├── CalendarList.tsx     # Calendar events
│   └── UploadZone.tsx       # Drag & drop upload
├── hooks/
│   └── useEmailDB.ts        # IndexedDB hook
├── lib/
│   └── db.ts                # IndexedDB operations
└── types/
    └── index.ts             # TypeScript types
```

