const DATABASE_NAME = 'personal_finance_database';
const DATABASE_VERSION = 1;
const STORE_NAME = 'application_state';
const STATE_ID = 'current_user_data';

export type AppDatabaseState = Record<string, unknown>;
let writeQueue: Promise<void> = Promise.resolve();

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readAppState(): Promise<AppDatabaseState | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(STATE_ID);
    request.onsuccess = () => { database.close(); resolve(request.result || null); };
    request.onerror = () => { database.close(); reject(request.error); };
  });
}

async function commitAppState(state: AppDatabaseState): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(state, STATE_ID);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
    transaction.onabort = () => { database.close(); reject(transaction.error); };
  });
}

/** Serialize whole-state writes so an older snapshot can never finish last. */
export function writeAppState(state: AppDatabaseState): Promise<void> {
  const snapshot = structuredClone(state);
  const write = writeQueue.then(() => commitAppState(snapshot));
  writeQueue = write.catch(() => undefined);
  return write;
}
