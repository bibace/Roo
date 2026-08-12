const whitespace = /\s+/g;
const logicalSeparators = /[\/_-]+|\s+/;

export interface NormalizedQuery {
  value: string;
  tokens: string[];
}

export function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase().replace(whitespace, ' ');
}

export function normalizeQuery(query: string): NormalizedQuery | undefined {
  const trimmedQuery = query.trim();

  if (trimmedQuery.length < 3) {
    return undefined;
  }

  const value = normalizeSearchValue(trimmedQuery);

  return {
    value,
    tokens: value.split(' '),
  };
}

export function normalizeSearchTerms(value: string): string[] {
  const normalizedValue = normalizeSearchValue(value);

  if (normalizedValue.length === 0) {
    return [];
  }

  const terms = new Set<string>([normalizedValue]);

  for (const segment of normalizedValue.split(logicalSeparators)) {
    if (segment.length > 0) {
      terms.add(segment);
    }
  }

  return [...terms];
}
