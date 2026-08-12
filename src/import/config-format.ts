import { ConfigImportError } from './config-import-error';

export type RooConfigFormat = 'yaml' | 'json';

export function getRooConfigFormat(fileName: string): RooConfigFormat {
  const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();

  if (extension === '.yaml' || extension === '.yml') {
    return 'yaml';
  }

  if (extension === '.json') {
    return 'json';
  }

  throw new ConfigImportError(
    'UNSUPPORTED_FILE_TYPE',
    'Only .yaml, .yml, and .json files are supported.',
  );
}
