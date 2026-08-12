import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import OptionsApp from '../../entrypoints/options/App';
import { getCurrentCatalogMessage } from './current-catalog-status';

describe('options App', () => {
  it('renders the configuration-only Settings surface', () => {
    const markup = renderToStaticMarkup(<OptionsApp />);

    expect(markup).toContain('Roo Settings');
    expect(markup).toContain('/icons/48.png');
    expect(markup).toContain('width="48"');
    expect(markup).toContain('height="48"');
    expect(markup).toContain('alt=""');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('Create, upload, or edit the Roo configuration used by the search popup.');
    expect(markup).toContain('<h2>Configuration</h2>');
    expect(markup).toContain('<h2>Help</h2>');
    expect(markup).toContain('Configuration Guide');
    expect(markup).toContain('<h2>About Roo</h2>');
    expect(markup).toContain('Author');
    expect(markup).toContain('nova');
    expect(markup).toContain('github.com/bibace/Roo');
    expect(markup).not.toContain('Configuration YAML Reference');
    expect(markup).toContain('Loading…');
    expect(markup).not.toContain('New configuration');
    expect(markup).not.toContain('Upload YAML / JSON');
    expect(markup).not.toContain('Edit configuration');
    expect(markup).not.toContain('Replace file');
    expect(markup).toContain('type="file"');
    expect(markup).toContain('accept=".yaml,.yml,.json"');
    expect(markup).toContain('hidden=""');
    expect(markup).not.toContain(['Local', 'accounts'].join(' '));
    expect(markup).not.toContain('+ Add account');
    expect(markup).not.toContain(['Edit', 'local', 'account'].join(' '));
  });

  it('keeps the one-file Configuration import boundary', () => {
    const markup = renderToStaticMarkup(<OptionsApp />);

    expect(markup).not.toContain('multiple');
    expect(markup).not.toContain('Validate');
    expect(markup).not.toContain('Effective catalog');
  });

  it('uses the current Configuration status messages', () => {
    expect(getCurrentCatalogMessage('invalid')).toBe(
      'Stored configuration is invalid. Replace it with a valid YAML or JSON file.',
    );
  });
});
