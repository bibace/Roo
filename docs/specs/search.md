# Roo Local Search Specification

## Boundary

Local search MUST accept a read-only `JumpTarget[]` and a query string, and MUST return matching `JumpTarget[]`. The boundary MUST be pure TypeScript and MUST remain independent from React, WXT, browser APIs, extension storage, configuration parsing, resolution, network access, and AWS navigation.

Search MUST NOT mutate the input target array or any input target.

## Query normalization

Roo MUST trim leading and trailing query whitespace, lowercase matching text, and collapse consecutive whitespace into one separator. A normalized query with fewer than 3 characters MUST return no results. Query text with exactly 3 characters MUST be searchable.

The normalized query MUST split on whitespace into tokens. Matching MUST be case-insensitive. Every query token MUST match a searchable term, so multi-token queries MUST use AND semantics. Query token order MUST NOT change the candidate set or result order.

## Searchable data

Search MUST cover these Jump Target fields:

- `accountId`
- `accountName`
- `project`
- `environment`
- `role`
- `roleShortName`
- derived role aliases

Each textual field MUST contribute its complete normalized value and logical segments split on `/`, `-`, `_`, and whitespace. Duplicate terms MUST be removed internally. Stored JumpTarget values MUST NOT be lowercased or otherwise modified.

## Search index

Roo MUST build a pure in-memory search index when the target collection changes.
Index construction performs role-alias derivation, value normalization, logical
segment splitting, term deduplication, and exact-value construction once per
target. The index MUST retain each original JumpTarget by reference, MUST NOT
mutate targets, and MUST NOT be persisted or depend on React, browser APIs,
storage, Workspace, network, or navigation.

Repeated query execution MUST normalize only the query and search the prebuilt
terms and exact values. It MUST NOT repeat target-field normalization, role
alias derivation, logical splitting, or index construction for each keystroke.
The compatibility `searchJumpTargets()` API remains pure and builds an index
for its individual invocation before delegating to the indexed query path.

## Role aliases

A `roleShortName` equal to or ending with `readonly` MUST receive `readonly`, `read`, and `ro` aliases. A `roleShortName` equal to or ending with `admin` MUST receive `admin` and `adm` aliases. No other built-in aliases exist, and aliases MUST NOT be configurable in this phase.

## Match classes

Each token MUST receive its strongest match across all searchable terms:

1. `EXACT`: the token equals the term.
2. `PREFIX`: the term starts with the token and is not equal.
3. `NO_MATCH`: no searchable term equals or starts with the token.

Any `NO_MATCH` token MUST exclude the target.

An internal substring is not a match. `prod` MUST NOT match `nonprod`,
`preprod`, or `myprod`. `prod` MUST match `prod` exactly and MUST match
`production` as a prefix.

## Ranking

Before token ranking, a target MUST receive a whole-query exact flag only when the normalized query contains exactly one token and the complete normalized query equals `accountId`, `accountName`, `project`, `environment`, `role`, `roleShortName`, or a role alias. Whole-query exact ranking MUST apply only to a normalized query containing one token.

Matching targets MUST be ranked by this tuple, in order:

1. whole-query exact flag, `true` first
2. exact token count, higher first
3. prefix token count, higher first
4. `accountName`, ascending
5. `role`, ascending
6. `accountId`, ascending
7. deterministic remaining target fields, ascending

String ordering MUST be deterministic and MUST NOT use locale-dependent comparison or input-array order. Remaining target fields MUST provide a deterministic final tie-break only when all listed ranking values are equal.

Search MUST remain local. It MUST NOT use a network dependency, fuzzy-search algorithms, or fuzzy-search dependencies.
