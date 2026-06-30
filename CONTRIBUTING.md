# Contributing

Thanks for contributing to Color Token Manager.

## Development setup

```bash
npm install
npm run compile
```

Open the project in VS Code and press `F5` to launch the Extension Development Host.

## Quality checks

Run these before opening a pull request:

```bash
npm run check
npm test
npm run lint
npm run format:check
```

If you touch VS Code integration behavior, also run:

```bash
npm run test:integration
```

## Pull requests

- Keep changes focused and small when possible.
- Add or update tests when behavior changes.
- Update `README.md` if user-facing behavior or settings change.
- Update `CHANGELOG.md` for notable releases or user-visible improvements.

## Style notes

- TypeScript is the primary language in this repo.
- Prefer clear, incremental changes over broad rewrites.
- Keep user-facing workflows safe: preview before apply, and avoid surprising edits.

## Reporting issues

When filing an issue, include:

- VS Code version
- extension version
- operating system
- a short reproduction
- relevant token file examples when possible
