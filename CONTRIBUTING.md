# Contributing

## Development Workflow

1. Fork the repo and create a feature branch from `main`
2. Install dependencies: `npm ci`
3. Create `.env` safely: `node scripts/create-env.mjs`
4. Start the backend: [supabase-warehouse-template](https://github.com/abhiguru/supabase-warehouse-template)
5. Run the app: `npm start`

Start the companion backend with `bash setup.sh --demo`. Use the same localhost API origin and Android USB/emulator port reversal described in [the handoff](docs/DEVELOPER_HANDOFF.md). Run `npm run doctor`, `npm test`, `npm run test:setup`, lint and typecheck before submitting. Stop Metro with Ctrl+C and stop the backend with its `bash stop.sh` wrapper.

## Code Style

- TypeScript strict mode
- ESLint + Prettier (run `npm run lint:fix` and `npm run format`)
- Commits must follow [Conventional Commits](https://www.conventionalcommits.org/)

### Commit Message Format

```
type(scope): description

Examples:
feat(grn): add image compression on upload
fix(auth): handle expired JWT tokens
docs: update quick start instructions
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## Pull Request Process

1. Ensure `npm run typecheck` and `npm run lint` pass
2. Update README if you change configuration or add features
3. Request review from a maintainer
4. Squash commits before merging
