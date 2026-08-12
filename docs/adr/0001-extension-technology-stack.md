# ADR 0001: Extension Technology Stack

## Status

Accepted

## Context

Roo needs a small browser-extension implementation with a typed domain, React popup UI, runtime validation, and focused tests. Phase 0 establishes the stack without creating its implementation scaffold.

## Decision

The initial stack is WXT, Manifest V3, TypeScript, React, Zod, Vitest, and plain CSS.

Additional dependencies MUST have a concrete requirement and a new ADR.

## Consequences

The stack supports a typed extension boundary, schema validation, local UI behavior, and unit-focused verification while keeping the initial dependency surface small.

## Rejected alternatives

The initial implementation rejects Tailwind, Redux, Zustand, the AWS SDK, backend services, a database, and component libraries. Playwright was initially excluded from the implementation stack; its narrowly scoped release-verification use is superseded by ADR 0008.
