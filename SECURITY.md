# Security policy

## Supported version

Security fixes apply to the current `main` branch. System One Deslop is
pre-alpha scaffolding; it has no implemented detection or rewriting features.

## Reporting a vulnerability

Use GitHub's private **Report a vulnerability** flow when enabled. Include the
affected version or commit, reproduction steps using synthetic text, and
observed impact. Do not include API keys, private text, account identifiers,
or raw service responses. Avoid public issues containing unpatched exploits.
If private reporting is unavailable, ask maintainers for a private reporting
channel without disclosing vulnerability details in public.

## Security boundaries

Keep `TYPESAFE_API_KEY` server-side: never embed it in browser code or expose
it to page users. `.env` is local and ignored; `.env.example` has no key.
Text inputs may be private. Hosted judgments send text to TypeSafe; disclose
this boundary before processing real user content and keep that content out
of logs, diagnostics, test fixtures, and vulnerability reports.

The optional smoke script sends only synthetic text, disables SDK logging and
retries, and omits raw errors. Offline tests use a mock transport and need no
API key. CI must not run smoke or receive a TypeSafe API key.

CI uses SHA-pinned actions and read-only repository permissions. Run
`./scripts/install-gitleaks.sh`, then `./scripts/scan-secrets.sh staged` before
committing and `./scripts/scan-secrets.sh history` before publication. A clean
secret scan does not replace review of private data or commit metadata.
