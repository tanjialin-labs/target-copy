# Changelog

## 1.0.4 - 2026-11-20

### English

- Portable Markdown applies comment removal, internal-link conversion, and highlighting inside nested lists while preserving actual code blocks.
- Local images with URL-encoded filenames embed correctly. Reading view image selections retain usable Markdown references; unavailable references show a notice and a placeholder instead of a machine path.
- Included note titles retain literal filename characters. Links copied from HTML or Reading view to Markdown retain their title text.
- Rapid destination reordering retains every move. Settings saves run in order, report failures, and preserve input focus.
- Destinations show when they have individual preferences and offer a one-click reset to general settings.
- Advanced limits validate input immediately, show save status, and remember the last custom value when switching to unlimited and back.
- Last copy details include the source file, actual clipboard format, copy time, and retained/embedded image counts. Direct source copies retain image references without counting them.

### 中文

- Portable Markdown 会正确处理嵌套列表中的注释移除、内部链接和高亮，同时保留真正的代码块。
- 含 URL 编码文件名的本地图片可正确内嵌；阅读视图中的图片选区可保留为 Markdown 引用。无法恢复的引用会提供提示和占位文字，不再输出本机路径。
- 包含笔记标题时保留文件名的字面字符；HTML 或阅读视图转 Markdown 时保留链接的标题说明。
- 连续调整目标顺序时保留每次移动。设置按顺序保存，失败时明确提示，并保留输入焦点。
- 目标旁显示独立设置标记，并可一键恢复继承全局设置。
- 高级限制即时校验输入、显示保存状态；切换“不限”和“自定义”时记住上次设置的数值。
- “上次复制详情”显示源文件、实际剪贴板格式、耗时，以及图片引用保留数和内嵌数。直接复制源码时保留图片引用，不统计数量。

## 1.0.3 - 2026-11-17

- Plain-text copies, including the text supplied with rich copies, keep nested lists and the paragraphs that follow them in their original order.
- When copying a Reading view selection or an HTML file as Portable Markdown, literal heading, list, and divider markers remain visible as text. Actual headings, lists, and dividers keep their formatting.
- Responsive images retain complete image addresses when their paths or query parameters contain commas. Per-image and total image limits still apply.
- When you disable your default Quick Copy destination, Quick Copy switches to the first enabled destination in your menu order. Reordering destinations keeps your current default if it is still enabled.

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
