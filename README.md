# System One Deslop

Planned: a tool to detect and rewrite “AI slop” in prose using TypeSafe
System One judgments (Jev). This is pre-alpha: the audit returns uncalibrated
prose signals, and proposed rewrites need human review.
The [eval harness](eval/README.md) measures Jev against author-proposed synthetic
labels in the two [research catalogues](research/README.md).
The [read-only audit CLI](eval/AUDIT.md) runs those judgments over Markdown prose.
The [guarded editor loop](eval/DESLOP.md) asks a local model CLI for proposed edits.

Requires Node.js 26+ and npm; `mise.toml` pins the exact version CI uses.

```sh
npm ci
npm run verify
npm run build
```

Verification includes typechecking, type-aware oxlint, oxfmt, and offline
`node:test` tests against compiled TypeScript. Run `npm run format` to format
supported source and documentation files. To check the
live [TypeSafe SDK](https://docs.typesafe.ai/sdk/javascript.md), create `.env`
from `.env.example`, set `TYPESAFE_API_KEY`, and run `npm run smoke`.
This sends one synthetic sentence and one
`noul` question to the hosted API, with retries disabled; usage may be billed.
The smoke call never runs in CI. Keep keys server-side and private prose out
of logs and Git. See [SECURITY.md](SECURITY.md). MIT licensed.
