export function getCanonicalYamlFileName(
  sourceFileName?: string,
): string {
  if (sourceFileName === undefined) {
    return 'roo.yaml';
  }

  return sourceFileName.replace(
    /\.(?:yaml|yml|json)$/i,
    '.yaml',
  );
}
