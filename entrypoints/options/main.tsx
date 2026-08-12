import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
import ErrorBoundary from '../../src/ui/error-boundary';

const rootElement = document.getElementById('app');

if (!rootElement) {
  throw new Error('Roo settings root element was not found.');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary
      fallback={
        <main className="roo-settings" role="alert">
          <h1>Roo Settings encountered an unexpected error.</h1>
          <button type="button" onClick={() => window.location.reload()}>Reload</button>
        </main>
      }
    >
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
