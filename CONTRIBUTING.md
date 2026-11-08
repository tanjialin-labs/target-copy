# Contributing to Target Copy

Thanks for helping improve Target Copy. Contributions of bug reports, target
compatibility results, translations, documentation, tests, and code are
welcome.

By participating, you agree to follow [the code of conduct](CODE_OF_CONDUCT.md).

## Before opening an issue

- Search existing issues first.
- Use a minimal synthetic note.
- Include the Obsidian version, Target Copy version, operating system, source
  view, destination, and exact paste behavior.
- For security vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of
  opening a public issue.

## Development setup

Requirements:

- Node.js 20.19 or later.
- npm.
- A disposable desktop Obsidian test vault.

~~~sh
npm ci
npm run check
~~~

Useful commands:

~~~sh
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm run release:verify
~~~

**npm run dev** watches the TypeScript sources and rebuilds **main.js**.
**main.js** and release ZIP files are generated artifacts and are intentionally
ignored by Git.

## Project invariants

Changes must preserve these guarantees:

1. Every conversion runs locally inside Obsidian.
2. The system clipboard is the output of the copy workflow.
3. Note files remain unchanged during copying.
4. User content and editable source are preserved by default.
5. Content transformations are controlled by explicit user settings.
6. Executable content remains visible, inert source during conversion.
7. Destination notices describe the actual representation written to the clipboard.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

- **src/core** collects, protects, renders, normalizes, and writes content.
- **src/adapters** produces destination-specific HTML and text.
- **src/i18n.ts** contains all five supported UI languages.
- **src/settings.ts** and **src/main.ts** provide the Obsidian interface.
- **tests** contains deterministic conversion and safety regressions.

## Adding or changing a destination

1. Document the target's actual clipboard behavior.
2. Add or update the adapter while preserving source content.
3. Add automated tests for headings, lists, tables, links, code, formulas, and
   images where relevant.
4. Test normal paste in the real destination application and summarize the
   result in the pull request with synthetic content.
5. Add localized labels, descriptions, and warnings in all five languages.

## Translations

English is the source interface language. The current translations are
Simplified Chinese, Traditional Chinese, Japanese, and German. Keep placeholders
such as {{name}} unchanged and add tests when introducing new language behavior.

## Pull requests

- Keep each pull request focused.
- Explain the user-visible behavior and privacy impact.
- Add regression tests for bug fixes.
- Run **npm run check** before submitting.
- Update README or compatibility documentation when behavior changes.
- Commit source, tests, and public documentation. Keep Vaults, generated
  **main.js**, **node_modules**, and release ZIP files in their designated local
  locations.

All contributions are accepted under the repository's [MIT License](LICENSE).
