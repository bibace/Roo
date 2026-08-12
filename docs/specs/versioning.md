# Roo Versioning Specification

Roo uses semantic `X.Y.Z` package versions.

## First Public Release

Roo 1.0.0 is the first public release.

All package versions before 1.0.0 were unreleased development iterations.
The one-time reset to 1.0.0 is not a downgrade from a published Roo release.

After 1.0.0 is publicly released, the normal PATCH, MINOR, and MAJOR rules
below apply.

## PATCH

A small corrective change, bug fix, small UX adjustment, or internal
maintenance shipped as a new build increments:

```text
X.Y.Z
→ X.Y.(Z+1)
```

## MINOR

A new user-visible capability, substantial UX feature, or new supported
configuration/product workflow increments:

```text
X.Y.Z
→ X.(Y+1).0
```

## MAJOR

An explicit backward-incompatible product, configuration, or storage contract
change approved as a major release increments:

```text
X.Y.Z
→ (X+1).0.0
```

Every shipped Roo product change MUST bump at least PATCH. Normal direct-to-main
corrective work does not create a Git tag. `package.json` and
`package-lock.json` versions MUST remain synchronized.

The Configuration Editor upgrade is MINOR.
