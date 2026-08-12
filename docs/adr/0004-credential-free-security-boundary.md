# ADR 0004: Credential-Free Security Boundary

## Status

Accepted

## Context

Roo is a navigator, not an AWS authentication or API client. Handling credentials would expand the security boundary and is unnecessary for users who already have an authenticated AWS Console session.

## Decision

Roo MUST NOT handle AWS credentials, use an AWS SDK credential workflow, call STS `AssumeRole`, store AWS cookies or tokens, or create federation credentials. Roo MUST navigate with the user's existing browser AWS Console session.

Roo MUST request only minimum extension permissions. Roo MUST NOT request `<all_urls>`, `cookies`, or `webRequest`. Roo MUST NOT add a content script in the initial architecture. Shared and remote configuration MUST remain data only. External configuration MUST be validated before runtime use, and AWS destinations MUST be generated only from structured account and role data.

## Consequences

Roo cannot provide credential issuance or AWS API operations, but it has a narrower security boundary and avoids handling secrets. Navigation logic remains isolated from UI code.

## Rejected alternatives

Roo MUST NOT implement AWS credential storage, AWS SDK credential flows, STS AssumeRole, AWS federation, session-cookie access, token storage, arbitrary external navigation URLs, or an initial content script.
