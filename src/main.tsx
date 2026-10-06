import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { getDb } from './db/database';

// Initialize the SQLite database (restored from IndexedDB when present).
void getDb().catch((error: unknown) => {
  console.error('[cahier] Failed to initialize database.', error);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
