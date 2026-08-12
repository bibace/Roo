export type CurrentCatalogStatus =
  | 'loading'
  | 'empty'
  | 'invalid'
  | 'ready';

export function getCurrentCatalogMessage(status: CurrentCatalogStatus): string | undefined {
  if (status === 'loading') {
    return 'Loading…';
  }

  if (status === 'empty') {
    return 'No configuration imported.';
  }

  if (status === 'invalid') {
    return 'Stored configuration is invalid. Replace it with a valid YAML or JSON file.';
  }

  return undefined;
}
