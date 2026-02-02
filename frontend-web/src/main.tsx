import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './i18n';
import './index.css';
import { db, forceFullSync, purgeSoftDeleted, getSyncStats } from './db/database';

// 🔴 PROFESSIONAL SYNC: Expose utilities for debugging and troubleshooting
// Access via browser DevTools console:
//   window.dbUtils.getSyncStats()
//   window.dbUtils.forceFullSync()
//   window.dbUtils.purgeSoftDeleted(30)
if (typeof window !== 'undefined') {
  (window as any).dbUtils = {
    db,
    forceFullSync,
    purgeSoftDeleted,
    getSyncStats,
  };
  console.log('🔧 dbUtils exposed on window. Use window.dbUtils.getSyncStats() to check sync status.');
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <App />
      </HashRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
