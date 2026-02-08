# Contributing

Thanks for contributing to this repository.

## Development

- Use Node.js 20+ and pnpm 8+ (see `package.json` engines).
- Install deps: `pnpm install`
- Useful commands:
  - `pnpm build`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test`

## Docs

- Prefer updating docs under `docs/` and keep relative links valid.
- Avoid committing secrets. Use `.env` (already in `.gitignore`) and `/.env.example` for templates.

## Pull Requests

- Keep changes focused and include a short explanation.
- If you change CLI commands, file paths, or settings keys, update the relevant `.md` docs in the same PR.

