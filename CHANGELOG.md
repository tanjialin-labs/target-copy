# Changelog

## 1.0.2 - 2026-11-12

- Set the Quick Copy destination at the top of Settings → Target Copy. Use **Adjust order** to rearrange destinations, or open a destination’s gear to change its preferences. Inherited options now show the value they use.
- In Reading view, selecting only whitespace now leaves the clipboard untouched. The picker marks a destination as last used after the first successful copy.
- Opening the context menu no longer reads an inactive note or scans the current note for reference definitions. That work happens when you choose a destination that needs it.
- Image limits now cover embedded responsive image variants in rich text and HTML source. In **Advanced settings**, choose unlimited or set a cap for images and embedded notes.

## 1.0.1 - 2026-11-08

- Improved compatibility across Obsidian windows and desktop clipboard handoff.

## 1.0.0 - 2026-11-04

- Added destination-aware copying for Google Docs, Microsoft Word and WPS,
  Notion, Slack, email, WeChat Official Accounts, portable Markdown, and plain
  text.
- Added selection, whole-note, editor-menu, file-menu, picker, Quick Copy,
  repeat-target, and destination-specific command workflows.
- Added optional Original source and HTML source destinations, a context-menu submenu,
  configurable destination order, and per-destination preferences.
- Added local note embed expansion, Cancel copy, and Last copy details.
- Added rich HTML and plain-text clipboard representations tailored to each
  destination.
- Preserved YAML, Obsidian comments, wikilinks, formulas, fenced code, SVG,
  Canvas markup, external links, full table cells, and editable diagram source.
- Embedded referenced Vault images as original-byte data URLs, with optional
  user-configured image limits.
- Added destination visibility controls and interfaces in English, Simplified
  Chinese, Traditional Chinese, Japanese, and German.
- Added local processing, source-preserving conversion, inert executable source,
  and serialized clipboard writes.
- Published the complete plugin source, tests, public documentation, and CI
  configuration under the MIT License.
