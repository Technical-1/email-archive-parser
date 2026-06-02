# Tech Stack

## Core Technologies

| Layer | Choice | Why |
|-------|--------|-----|
| Language | TypeScript `^5.3` (target ES2020, `strict` on) | I wanted every public type — `Email`, `Account`, `Purchase`, `Subscription`, `Newsletter` — checked and shipped as declarations so consumers get full IntelliSense. `strict`, `noUnusedLocals`, and `noImplicitReturns` catch mistakes in the parsing/decoding code where edge cases are easy to miss. |
| Build | [tsup](https://tsup.egoist.dev/) `^8.0` | A single command produces CommonJS, ESM, and `.d.ts` output from one entry point. It removed the need to hand-maintain separate build configs while still supporting both `import` and `require` consumers. |
| Tests | [Vitest](https://vitest.dev/) `^1.0` | Fast TypeScript-native test runner with a Node environment and v8 coverage. The detector and decoding logic is full of edge cases (locale separators, surrogate pairs, domain boundaries), so a quick test loop matters. |

## Infrastructure

- **npm registry** — published as `@technical-1/email-archive-parser` with public access; the package ships only `dist`, the README, and the license.
- **GitHub** — source hosting and issue tracking at [Technical-1/email-archive-parser](https://github.com/Technical-1/email-archive-parser).
- **CI** — a GitHub Actions workflow (`.github/workflows/publish.yml`) runs on a published release: it checks out the repo, installs with `npm ci`, builds, runs the test suite (`npm run test:run`), and publishes to npm using OIDC (`id-token: write`) rather than a long-lived token.

## Development Tools

- **Package manager:** npm (with `npm ci` in CI for reproducible installs)
- **Build:** tsup — `npm run build` for a one-shot CJS+ESM+types bundle, `npm run dev` for watch mode
- **Tests:** Vitest — `npm test` (watch) and `npm run test:run` (single pass)

## Key Dependencies

| Dependency | Version | Role |
|------------|---------|------|
| `jszip` | `^3.10` | Extracts the ZIP container behind `.olm` archives. The only runtime dependency — everything else is built on platform primitives. |

This library is intentionally near-zero-dependency. MIME decoding, charset handling, and base64 all run on built-in `TextDecoder`/`TextEncoder`/`atob` with `Buffer` fallbacks, so adding it to a project pulls in almost nothing transitively.
