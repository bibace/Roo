import React, { useEffect, useReducer } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
import ErrorBoundary from '../../src/ui/error-boundary';
import PopupFallback from '../../src/popup/popup-fallback';
import { loadPopupBootstrap, type PopupBootstrap } from '../../src/popup/load-effective-targets';
import {
  initialPopupBootstrapState,
  popupBootstrapReducer,
} from '../../src/popup/popup-bootstrap-state';

const loadingBootstrap: PopupBootstrap = {
  targets: [],
  catalogStatus: 'empty',
  summary: { accounts: 0, roles: 0 },
  searchEnabled: true,
};

const rootElement = document.getElementById('app');

if (!rootElement) {
  throw new Error('Roo popup root element was not found.');
}

function PopupBootstrap() {
  const [state, dispatch] = useReducer(
    popupBootstrapReducer,
    initialPopupBootstrapState,
  );

  useEffect(() => {
    void loadPopupBootstrap()
      .then((bootstrap) => dispatch({ type: 'BOOTSTRAP_LOADED', bootstrap }))
      .catch(() => dispatch({ type: 'BOOTSTRAP_FAILED' }));
  }, []);

  if (state.failed) {
    return <PopupFallback />;
  }

  return (
    <App
      {...(state.bootstrap ?? loadingBootstrap)}
      loading={state.bootstrap === null}
      query={state.query}
      onQueryChange={(query) => dispatch({ type: 'QUERY_CHANGED', query })}
    />
  );
}

createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary fallback={<PopupFallback />}>
      <PopupBootstrap />
    </ErrorBoundary>
  </React.StrictMode>,
);
