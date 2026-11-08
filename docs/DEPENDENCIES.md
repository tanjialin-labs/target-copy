# Dependencies and licenses

Target Copy is distributed as a self-contained Obsidian plugin. The production
bundle uses host APIs supplied by Obsidian itself and runs the
conversion pipeline locally.

## Runtime boundary

- `obsidian` — Obsidian public plugin API, MIT License; provided by the host and
  kept external during bundling.
- `electron` — the desktop host clipboard bridge, provided by Obsidian and kept
  external during bundling. The optional bridge is used when browser clipboard
  access is unavailable. Electron is MIT-licensed.
- All conversion, adapter, interface, and localization modules in `main.js` are
  built from this repository's TypeScript source under the repository MIT
  License.

The runtime dependency boundary consists of the host APIs above. Local images
are read through the Obsidian Vault API when the copied content references them
and image embedding is enabled.

## Direct development dependencies

These packages build, lint, type-check, and test the project. Plugin installation
uses the generated `main.js`, `manifest.json`, and `styles.css` files.

| Package | Purpose | License |
| --- | --- | --- |
| `@types/node` | Node.js type definitions | MIT |
| `esbuild` | Production bundling | MIT |
| `eslint` | Static analysis | MIT |
| `eslint-plugin-obsidianmd` | Official Obsidian plugin rules | MIT |
| `happy-dom` | Test DOM environment | MIT |
| `obsidian` | Obsidian API types | MIT |
| `typescript` | Type checking | Apache-2.0 |
| `vitest` | Automated tests | MIT |

`package-lock.json` is the authoritative record of exact direct and transitive
versions used for reproducible installs. Contributors should use `npm ci` and
review Dependabot changes through the full `npm run check` suite.

## Auditing

`npm run audit:runtime` audits the release dependency boundary. `npm audit`
audits the complete development toolchain. Dependabot tracks dependency updates.

## Updating this file

When adding a direct dependency, document why it is needed, verify its license
is compatible with MIT distribution, update the lock file, run `npm audit`, and
verify that the runtime remains local.
