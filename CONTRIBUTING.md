# Contributing

## Development workflow

1. Fork the repository and create a feature branch from `main`.
2. Follow the [README quickstart](README.md#quickstart): `npm ci`,
   `node scripts/create-env.mjs`, then the checks.
3. Read [docs/DEVELOPER_HANDOFF.md](docs/DEVELOPER_HANDOFF.md) for the server
   selection model, where credentials live, the session-scoped state, the
   postinstall patches and the CI jobs.
4. Install the companion backend with its
   [operator install guide](https://github.com/abhiguru/supabase-warehouse-template/blob/main/docs/OPERATOR_INSTALL.md),
   then select its canonical HTTPS origin in the app. `npm run doctor` checks
   the backend read-only.
5. Run `npm run typecheck && npm run lint && npm test && npm run test:setup`
   before opening a pull request. Stop Metro with Ctrl+C.

## Code style

- TypeScript strict mode.
- ESLint and Prettier (`npm run lint:fix`, `npm run format`).
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  `type(scope): description` with types `feat`, `fix`, `docs`, `style`,
  `refactor`, `test`, `chore`.

## Pull request process

1. `npm run typecheck` and `npm run lint` pass locally; CI runs them again.
2. Update the README or docs if you change configuration or add features.
3. Request review from a maintainer. Commits are squashed on merge.
