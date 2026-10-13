# system-one-deslop

Catch AI slop in prose and fix it.

The idea: instead of grepping for "delve" and counting em-dashes, ask [TypeSafe](https://docs.typesafe.ai)'s Jev model small, typed questions about each passage. Who is this sentence for? Would anyone miss it if it were gone? Is it informing the reader or covering the writer? Jev answers with probabilities, and plain code decides what to flag or rewrite.

**Status:** nothing works yet. We're still researching what slop actually _is_ before writing detectors for it. Right now this repo is a well-linted empty room.

## Setup

```sh
npm ci
cp .env.example .env   # put your TYPESAFE_API_KEY in it
npm run verify         # typecheck, lint, format check, tests
npm run smoke          # one real call to Jev, to check your key works
```

You need Node 22.12+ (or 20.19+).

## Stack

- TypeScript 7 (the native one, it's fast)
- `@typesafe-ai/sdk`, pinned exactly. It infers answer types from your questions, which is the whole reason we're in TS.
- oxlint for bugs only, oxfmt for formatting. No style debates: the formatter wins.
- `node:test`. Tests never hit the API; `smoke` is the only thing that does, and it costs real (tiny) money.

## Ground rules

Keys stay in `.env`. Don't commit private text as test fixtures. That's it.

MIT.
