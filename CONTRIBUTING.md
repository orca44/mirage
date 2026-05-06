# Contributing to Mirage

Thank you for your interest in contributing to Mirage. Mirage is a unified
virtual filesystem for AI agents, with Python and TypeScript implementations in
one repository.

## Contribution Guidelines

We prefer small, well-tested contributions that solve real user problems.

- Open an issue or discussion before starting non-trivial features, API changes,
  or large refactors.
- Link related issues or discussions in your pull request.
- Keep pull requests focused. Split unrelated changes into separate PRs.
- Include tests for bug fixes and new behavior when practical.
- Update affected docs and examples when behavior changes.
- AI-assisted contributions are fine, but they must be reviewed, edited, and
  tested by a human before submission. Bulk low-signal generated submissions
  may be closed.

## Repository Layout

- `python/` contains the Python package, tests, `pyproject.toml`, and `uv.lock`.
- `typescript/` contains the TypeScript monorepo and packages.
- `docs/`, `examples/`, and `.github/` are shared across both implementations.

Run Python commands from `python/`. Run TypeScript commands from `typescript/`.

## Development Setup

Install Python dependencies:

```bash
cd python
uv sync --all-extras
```

Install TypeScript dependencies:

```bash
cd typescript
pnpm install
```

Examples under `examples/python/` load `.env.development` from the repository
root. Run them from the root with the Python virtualenv interpreter:

```bash
./python/.venv/bin/python examples/python/s3/s3.py
```

## Common Commands

Run Python tests:

```bash
cd python
uv run pytest
```

Run Python formatting and linting from the repository root:

```bash
./python/.venv/bin/pre-commit run --all-files
```

Run TypeScript checks:

```bash
cd typescript
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
```

Build TypeScript packages:

```bash
cd typescript
pnpm build
```

If you change Python dependencies, use `uv add` and commit the updated lock
file. If you change TypeScript dependencies, use `pnpm` and commit the updated
lock file.

## Code Style

- Represent filesystem paths with `PathSpec`, not raw strings, in Python APIs.
- Keep imports at the top of files.
- Avoid circular imports. Fix the dependency direction instead of using lazy
  function-local imports.
- Do not silently swallow exceptions. Let unexpected errors propagate, or log
  clearly when an error is intentionally ignored.
- Do not call `asyncio.run()` from sync code that may run inside an existing
  event loop.
- Keep comments and docstrings useful and concise. When adding docstring
  `Args`, include argument types.

## Pull Request Checklist

Before opening a PR:

- The change is scoped to one bug, feature, or documentation improvement.
- Related issues or discussions are linked.
- Tests were added or updated when relevant.
- Affected docs and examples were updated.
- Formatting, linting, and tests pass locally, or the PR explains why a check
  could not be run.

Useful PR title prefixes:

- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation changes
- `refactor:` for code restructuring
- `test:` for test-only changes
- `chore:` for maintenance work

## Getting Help

Use GitHub issues for bugs, feature requests, and design discussions. For faster
conversation, join the Mirage Discord linked from the README.
