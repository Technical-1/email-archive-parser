/**
 * IndexedDB utilities for email storage
 * Handles unlimited file sizes by storing data in browser database
 */

const DB_NAME = 'EmailParserDB';
const DB_VERSION = 1;

let db: IDBDatabase | null = null;

export interface DBEmail {
  id?: number;
  subject: string;
  sender: string;
  senderName?: string;
  date: Date;
  body: string;
  htmlBody?: string;
  labels?: string[];
  isRead?: boolean;
  recipients?: string[];
}

export interface DBContact {
  id?: number;
  name: string;
  email: string;
  emailCount: number;
  lastEmailDate: Date;
}

export interface DBCalendarEvent {
  id?: number;
  title: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  isAllDay?: boolean;
}

export async function openDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Emails store
      if (!database.objectStoreNames.contains('emails')) {
        const store = database.createObjectStore('emails', { keyPath: 'id', autoIncrement: true });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('sender', 'sender', { unique: false });
      }

      // Contacts store
      if (!database.objectStoreNames.contains('contacts')) {
        const store = database.createObjectStore('contacts', { keyPath: 'id', autoIncrement: true });
        store.createIndex('email', 'email', { unique: false });
        store.createIndex('emailCount', 'emailCount', { unique: false });
      }

      // Calendar store
      if (!database.objectStoreNames.contains('calendar')) {
        const store = database.createObjectStore('calendar', { keyPath: 'id', autoIncrement: true });
        store.createIndex('startDate', 'startDate', { unique: false });
      }

      // Stats store
      if (!database.objectStoreNames.contains('stats')) {
        database.createObjectStore('stats', { keyPath: 'key' });
      }
    };
  });
}

export async function clearAllData(): Promise<void> {
  const database = await openDB();
  const stores = ['emails', 'contacts', 'calendar', 'stats'];

  for (const storeName of stores) {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export async function addItems<T>(storeName: string, items: T[]): Promise<number> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);

    let count = 0;
    for (const item of items) {
      store.add(item);
      count++;
    }

    tx.oncomplete = () => resolve(count);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCount(storeName: string): Promise<number> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getPage<T>(
  storeName: string,
  page: number,
  perPage: number,
  sortIndex?: string,
  sortOrder: 'asc' | 'desc' = 'desc'
): Promise<T[]> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const items: T[] = [];

    let cursor: IDBRequest<IDBCursorWithValue | null>;

    if (sortIndex && store.indexNames.contains(sortIndex)) {
      const index = store.index(sortIndex);
      cursor = index.openCursor(null, sortOrder === 'asc' ? 'next' : 'prev');
    } else {
      cursor = store.openCursor(null, 'prev');
    }

    let skipped = 0;
    const skip = (page - 1) * perPage;

    cursor.onsuccess = (event) => {
      const result = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (result) {
        if (skipped < skip) {
          skipped++;
          result.continue();
        } else if (items.length < perPage) {
          items.push(result.value);
          result.continue();
        } else {
          resolve(items);
        }
      } else {
        resolve(items);
      }
    };
    cursor.onerror = () => reject(cursor.error);
  });
}

export async function getItem<T>(storeName: string, id: number): Promise<T | undefined> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function searchItems<T>(storeName: string, query: string, limit = 100): Promise<T[]> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const items: T[] = [];
    const q = query.toLowerCase();

    const cursor = store.openCursor();
    cursor.onsuccess = (event) => {
      const result = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (result && items.length < limit) {
        const item = result.value;
        const searchable = JSON.stringify(item).toLowerCase();
        if (searchable.includes(q)) {
          items.push(item);
        }
        result.continue();
      } else {
        resolve(items);
      }
    };
    cursor.onerror = () => reject(cursor.error);
  });
}

export async function saveStat(key: string, value: number): Promise<void> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction('stats', 'readwrite');
    const store = tx.objectStore('stats');
    store.put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getStat(key: string): Promise<number> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction('stats', 'readonly');
    const store = tx.objectStore('stats');
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result?.value || 0);
    request.onerror = () => reject(request.error);
  });
}

