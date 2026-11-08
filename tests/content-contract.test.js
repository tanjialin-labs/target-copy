// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
const { TFile } = vi.hoisted(() => ({
  TFile: class TFile {
    constructor(path, bytes = 3) {
      this.path = path;
      this.name = path.split("/").at(-1);
      this.extension = path.split(".").at(-1);
      this.stat = { size: bytes };
    }
  },
}));
vi.mock("obsidian", () => ({ TFile }));
import * as markdown from "../src/core/markdown";
import * as diagrams from "../src/core/diagrams";
import * as selection from "../src/core/selection";
import * as dom from "../src/core/dom";
import * as assets from "../src/core/assets";
import * as stability from "../src/core/dom-stability";
import * as text from "../src/adapters/text";
import * as rich from "../src/adapters/rich-html";
import * as types from "../src/types";
const api = { ...markdown, ...diagrams, ...selection, ...dom, ...assets, ...stability, ...text, ...rich, ...types };
const context = {
  target: 'markdown', title: 'Fixture', sourcePath: 'Root/Main.md',
  isSelection: true, settings: api.DEFAULT_SETTINGS,
};

function check(name, actual, expected) {
  it(name, () => {
    if (typeof expected === "function") expect(expected(actual)).toBe(true);
    else expect(actual).toEqual(expected);
  });
}
function root(html) {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}
function selected(html, startSelector, endSelector = startSelector) {
  const el = root(html);
  document.body.appendChild(el);
  const start = el.querySelector(startSelector).firstChild;
  const end = el.querySelector(endSelector).firstChild;
  const range = document.createRange();
  range.setStart(start, 0);
  range.setEnd(end, end.textContent.length);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  const value = api.getReadingViewSelection(el);
  el.remove();
  return value;
}
function normalized(html) {
  const el = root(html);
  api.normalizeRenderedDom(el, context);
  return el;
}

const fencedHtml = '```html\n<div><strong>Example</strong></div>\n```';
check('fenced HTML -> Markdown preserves code', api.toPortableMarkdown(fencedHtml, api.DEFAULT_SETTINGS), fencedHtml);
check('raw HTML -> Markdown retains raw HTML', api.toPortableMarkdown('<div><strong>Example</strong></div>', api.DEFAULT_SETTINGS), '<div><strong>Example</strong></div>');
const withEmptyLines = '```html\n<p>A</p>\n\n\n<p>B</p>\n```';
check('fenced code keeps all blank lines', api.toPortableMarkdown(withEmptyLines, api.DEFAULT_SETTINGS), withEmptyLines);
const htmlCode = '<pre><code>const s = "[[Note]]";\nconst x = "==literal==";</code></pre>';
check('raw PRE/CODE protects source syntax', api.toPortableMarkdown(htmlCode, api.DEFAULT_SETTINGS), htmlCode);
const rawPre = '<pre>\nalpha\nbeta\n</pre>';
check('raw PRE protects source line breaks', api.normalizeSoftBreaksForRichText(rawPre), rawPre);
const indented = '    const s = "[[Note]]";';
check('indented code protects source syntax', api.toPortableMarkdown(indented, api.DEFAULT_SETTINGS), indented);
check('quoted Mermaid fence is protected before rendering', api.preserveDiagramSourceForRendering('> ```mermaid\n> graph TD; A-->B\n> ```'), value => value.includes('data-target-copy-language="mermaid"'));

check('reading link text selection retains href', selected('<p><a href="https://example.com">Link</a></p>', 'a'), value => value.includes('href="https://example.com"'));
check('reading bold selection retains formatting', selected('<p><strong>Bold</strong></p>', 'strong'), value => value.includes('<strong>'));
const taskSelection = selected('<ul><li><input type="checkbox" checked><span class="first">A</span></li><li><input type="checkbox"><span class="last">B</span></li></ul>', '.first', '.last');
check('multi-item task selection retains both checkboxes', root(taskSelection).querySelectorAll('input').length, 2);
const titleSelection = selected('<div class="callout" data-callout="warning"><div class="callout-title">Custom title</div><div class="callout-content"><p>Body</p></div></div>', '.callout-title');
check('callout title-only selection preserves selected title', normalized(titleSelection).textContent, 'Custom title');
check('reading Tasks -> Markdown stays a Markdown task', api.domToMarkdown(normalized('<ul><li><input type="checkbox" checked>Done</li></ul>')), '- [x] Done');
check('HTML BR -> Markdown retains hard break', api.domToMarkdown(root('<p>first<br>second</p>')), 'first  \nsecond');
check('literal HTML text -> Markdown stays literal', api.domToMarkdown(root('<p>&lt;em&gt;literal&lt;/em&gt;</p>')), value => value.includes('&lt;') || value.includes('\\<'));
check('Markdown text escapes literal emphasis', api.domToMarkdown(root('<p>literal *stars*</p>')), 'literal \\*stars\\*');
const table = '<table><tr><th style="text-align:right">Name</th></tr><tr><td><a href="https://example.com">Link</a><br><strong>Bold</strong><img src="chart.png" alt="Chart"></td></tr></table>';
check('table -> Markdown retains link, image, emphasis, breaks, alignment', api.domToMarkdown(root(table)), value => value.includes('https://example.com') && value.includes('chart.png') && value.includes('**Bold**') && value.includes('---:'));
check('complex HTML table retains colspan in Markdown fallback', api.domToMarkdown(root('<table><tr><td colspan="2">Merged</td></tr><tr><td>A</td><td>B</td></tr></table>')), value => value.includes('colspan="2"'));
check('inline code chooses safe delimiter length', api.domToMarkdown(root('<p><code>a``b</code></p>')), '```a``b```');
check('code block chooses safe delimiter length', api.domToMarkdown(root('<pre><code>````\nbody</code></pre>')), '`````\n````\nbody\n`````');

const actualFootnote = normalized('<p>Claim<sup><a class="footnote-link" href="#fn-1-hash" id="fnref-1-hash">[1]</a></sup></p><section class="footnotes"><ol><li id="fn-1-hash"><p>Source<a class="footnote-link" href="#fnref-1-hash">↩︎</a></p></li></ol></section>');
check('footnote-link DOM is normalized', api.domToMarkdown(actualFootnote), value => value.includes('Claim[^1]') && !value.includes('#fn-'));
const duplicateNotes = normalized('<p>A<sup class="footnote-ref"><a href="#fn-a">1</a></sup></p><section class="footnotes"><ol><li id="fn-a">A source</li></ol></section><p>B<sup class="footnote-ref"><a href="#fn-b">1</a></sup></p><section class="footnotes"><ol><li id="fn-b">B source</li></ol></section>');
check('embedded footnote sets get unique Markdown labels', api.domToMarkdown(duplicateNotes), value => (value.match(/\[\^1\]:/g) || []).length === 1 && value.includes('[^2]'));

const picture = normalized('<picture><source srcset="diagram.svg"><img srcset="diagram@2x.png 2x" alt="Diagram"></picture>');
check('srcset-only image retains a usable source', picture.innerHTML, value => value.includes('diagram.svg') || value.includes('diagram@2x.png'));
const styled = normalized('<div style="background-image:url(https://example.com/chart.png);color:red">Chart</div>');
check('CSS image URL is retained as content or visible source', styled.innerHTML, value => value.includes('https://example.com/chart.png'));
const svg = root('');
const vector = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
const vectorStyle = document.createElementNS('http://www.w3.org/2000/svg', 'style');
vectorStyle.textContent = '.shape {fill:red}';
const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
rect.setAttribute('width', '10'); rect.setAttribute('height', '10');
vector.append(vectorStyle, rect); svg.append(vector);
api.normalizeRenderedDom(svg, context);
check('SVG stylesheet remains SVG stylesheet', svg.innerHTML, value => value.includes('<style>') && !value.includes('language-html'));
const aligned = root(api.buildRichHtml(root('<table><tr><th align="right">Right</th></tr></table>'), 'word'));
check('rich output respects HTML align attribute', aligned.querySelector('th').style.textAlign, 'right');
check('content transformations do not depend on internal-link setting',
  api.toPortableMarkdown('==Important==', {...api.DEFAULT_SETTINGS, internalLinkMode:'source'}),
  api.toPortableMarkdown('==Important==', api.DEFAULT_SETTINGS));
check('raw HTML media retains a Markdown representation', api.domToMarkdown(root('<video controls src="demo.mp4">Video</video>')), value => value.includes('demo.mp4'));

const reads = [];
const rootImage = new TFile('chart.png');
const correctImage = new TFile('Root/Sections/chart.png');
const app = {
  vault: {
    getAbstractFileByPath: path => path === 'chart.png' ? rootImage : null,
    readBinary: async file => { reads.push(file.path); return new Uint8Array([1, 2, 3]).buffer; },
  },
  metadataCache: {
    getFirstLinkpathDest: (target, source) => {
      if (target === 'Chapter') return {path:'Root/Sections/Chapter.md', extension:'md'};
      if (target === 'chart.png' && source === 'Root/Sections/Chapter.md') return correctImage;
      return null;
    },
  },
};
const imageRoot = root('<div class="markdown-embed is-loaded" src="Chapter"><img src="chart.png"></div>');
await api.inlineLocalImages(app, imageRoot, 'Root/Main.md', 0, 0);
check('embedded same-name image resolves in owning note before vault root', reads[0], 'Root/Sections/chart.png');
reads.length = 0;
const repeatedImages = root('<img src="chart.png"><img src="chart.png"><img src="chart.png">');
await api.inlineLocalImages(app, repeatedImages, 'Root/Main.md', 0, 0);
check('same image is read once per conversion', reads.length, 1);

const delayed = root('');
const started = Date.now();
let mutated = false;
window.setTimeout(() => { delayed.textContent = 'Delayed'; mutated = true; }, 300);
await api.waitForDomStability(delayed, window);
check('unmarked 300ms postprocessor completes before copy', { elapsed: Date.now() - started, mutated }, value => value.mutated);
const stuck = root('<div class="markdown-embed is-loading"></div>');
const timeoutResult = await api.waitForDomStability(stuck, window, {quietMs:10, timeoutMs:40});
check('render timeout can be distinguished from success', timeoutResult ?? null, value => value !== null);
