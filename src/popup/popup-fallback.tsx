import { useState } from 'react';
import { openSettings } from './open-settings';

export default function PopupFallback() {
  const [settingsError, setSettingsError] = useState(false);

  const handleSettings = async () => {
    setSettingsError(false);

    try {
      await openSettings();
    } catch {
      setSettingsError(true);
    }
  };

  return (
    <main className="roo-popup" role="alert">
      <p>Roo encountered an unexpected error.</p>
      <button type="button" className="settings-action" onClick={() => void handleSettings()}>
        Settings
      </button>
      {settingsError && <p className="settings-error">Unable to open Settings.</p>}
    </main>
  );
}
