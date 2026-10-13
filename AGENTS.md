# Repository invariants

- Keep this public repository free of credentials, private prose, personal
  identifiers, local machine paths, and deployment evidence.
- Use strict TypeScript, npm, and ESM. Pin `@typesafe-ai/sdk` exactly; keep
  runtime and development dependencies lean.
- Use type-aware oxlint for bugs and risk; oxfmt alone enforces formatting.
- Keep API keys server-side. Tests and CI must work without credentials or
  hosted API calls. Live smoke is an explicit local operation only.
- Preserve the CI check names `Required checks` and `gitleaks`. Pin Actions
  by full commit SHA, use read-only permissions, and disable persisted checkout
  credentials.
- Use `scripts/quiet-run.sh` for routine checks. Run `npm run verify`, workflow
  validation, and a staged secret scan before handing off changes.
- Stage named paths only. Agents may commit completed work; the operator
  pushes.
