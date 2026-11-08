# Architecture

Target Copy runs its complete conversion pipeline locally inside Obsidian.

## Conversion flow

~~~text
editor, reading selection, or note
  -> CopyInput
  -> source-preservation transforms
  -> inert Obsidian Markdown rendering
  -> DOM safety and semantic normalization
  -> destination adapter
  -> text/html and text/plain clipboard representations
~~~

## Modules

### Plugin interface

- **src/main.ts**: lifecycle, commands, menus, picker, notices, and copy queue.
- **src/settings.ts**: destination order, per-target preferences, language, source, image, and notice settings.
- **src/i18n.ts**: English, Simplified Chinese, Traditional Chinese, Japanese,
  and German strings.
- **src/types.ts**: target definitions, settings, inputs, and adapter results.

### Core pipeline

- **src/core/input.ts**: reads the active selection or note as conversion input.
- **src/core/references.ts**: collects reference-link and footnote definitions used by editor selections and note fragments.
- **src/core/source.ts**: shared lexical boundaries for code, HTML, math, and comments.
- **src/core/markdown.ts**: opt-in cleanup and hidden-source preservation.
- **src/core/diagrams.ts**: shields every fenced block from postprocessor execution.
- **src/core/math.ts**: retains editable LaTeX when source is available.
- **src/core/render.ts**: performs bounded rendering in an inert document with cancellation and timeout status.
- **src/core/render-note.ts**: resolves local transclusions with per-copy caching, cycle detection, and optional expansion limits.
- **src/core/dom.ts**: keeps safe source structure and makes executable content inert.
- **src/core/assets.ts**: embeds referenced local images with their original bytes.
- **src/core/visuals.ts**: preserves SVG and Canvas markup.
- **src/core/converter.ts**: orchestrates the pipeline.
- **src/core/clipboard.ts**: writes rich and plain clipboard representations.
- **src/core/latest-task.ts**: serializes writes so the newest request wins.

### Destination adapters

- **src/adapters/rich-html.ts**: Google Docs, Word/WPS, Notion, email, Slack,
  and WeChat HTML profiles.
- **src/adapters/markdown.ts**: semantic Markdown with HTML preservation for complex structures.
- **src/adapters/text.ts**: readable text and aligned text tables.
- **src/adapters/index.ts**: selects the adapter and adds compatibility warnings.

## Local data flow

The selected note or selection enters the conversion pipeline, referenced Vault
images are resolved when embedding is enabled, and the result is written to the
system clipboard. Source notes remain the input of the operation.

These properties are checked by tests, static scans, and the official Obsidian
ESLint configuration.

## Source-preservation model

Destination wrappers and styles may change because applications accept different
clipboard formats. User-authored content and editable source are preserved by
default. Optional removal or conversion settings represent explicit user choices.

Executable HTML and plugin code blocks remain visible, inert source throughout
conversion. Original-source export bypasses transformations; HTML-source export
writes markup as text. Image reads are cached per copy and retain original bytes.
Source ranges are captured before the picker opens. A new copy cancels the
previous conversion, and renderer components are disposed on completion,
cancellation, failure, and timeout.

Embedded-note source reads and base renders are cached for one conversion. The
render cache holds up to 16 entries, each with at most 131,072 source characters and
131,072 HTML characters. Expansion limits are user-configurable; zero means
unlimited. Rendering yields periodically so cancellation can be handled while
expanding cached notes. Circular references preserve their source and produce a
compatibility notice.

Destination preferences inherit general settings unless explicitly overridden.
The copy-details view retains destination, scope, and compatibility notices for
the latest successful copy in memory. Its lifetime follows the plugin instance.

## Dependencies and paths

Repository imports, documentation links, test fixtures, and build inputs use
repository-relative paths. Runtime Vault files are resolved dynamically through
the Obsidian API.

The production bundle keeps Obsidian and Electron host APIs external. Clipboard
writing uses the browser API, the available desktop host bridge, and a document
copy event as compatibility paths.
See [DEPENDENCIES.md](DEPENDENCIES.md) for the dependency and license boundary.
