// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { getEditorSelections, getReadingViewSelection } from "../src/core/selection";

describe("copy input selection handling", () => {
  it("combines multiple editor selections in document order", () => {
    const editor = {
      listSelections: () => [
        { anchor: { line: 4, ch: 5 }, head: { line: 4, ch: 0 } },
        { anchor: { line: 1, ch: 0 }, head: { line: 1, ch: 5 } },
      ],
      getRange: (from: { line: number }, to: { line: number }) =>
        from.line === 1 && to.line === 1 ? "Alpha" : "Omega",
    };

    expect(getEditorSelections(editor as never)).toBe("Alpha\n\nOmega");
  });

  it("rebuilds ordered-list and task context for a partial reading selection", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <ol start="3">
        <li>First</li>
        <li class="task-list-item"><input type="checkbox" checked><span>Second task</span></li>
        <li>Third</li>
      </ol>`;
    document.body.appendChild(container);

    const text = container.querySelectorAll("span")[0]!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, text.textContent!.length);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    const html = getReadingViewSelection(container)!;
    const result = document.createElement("div");
    result.innerHTML = html;
    expect(result.querySelector("ol")?.getAttribute("start")).toBe("4");
    expect(result.querySelectorAll("li")).toHaveLength(1);
    expect(result.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(result.textContent).toContain("Second task");
    expect(result.textContent).not.toContain("First");
    expect(result.textContent).not.toContain("Third");
  });

  it("retains a callout title without expanding the selected body", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="callout" data-callout="warning">
        <div class="callout-title">Warning</div>
        <div class="callout-content"><p>Keep this</p><p>Do not copy this</p></div>
      </div>`;
    document.body.appendChild(container);

    const text = container.querySelector("p")!.firstChild!;
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    const html = getReadingViewSelection(container)!;
    const result = document.createElement("div");
    result.innerHTML = html;
    expect(result.querySelector(".callout-title")?.textContent).toBe("Warning");
    expect(result.textContent).toContain("Keep this");
    expect(result.textContent).not.toContain("Do not copy this");
  });

  it("renumbers a reading selection that starts between ordered-list items", () => {
    const container = document.createElement("div");
    container.innerHTML = "<ol><li>One</li><li>Two</li><li>Three</li></ol>";
    document.body.appendChild(container);
    const items = container.querySelectorAll("li");
    const range = document.createRange();
    range.setStart(items[1]!.firstChild!, 0);
    range.setEnd(items[2]!.firstChild!, items[2]!.textContent!.length);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    const result = document.createElement("div");
    result.innerHTML = getReadingViewSelection(container)!;
    expect(result.querySelector("ol")?.getAttribute("start")).toBe("2");
    expect(result.textContent).toContain("Two");
    expect(result.textContent).toContain("Three");
    expect(result.textContent).not.toContain("One");
  });

  it("retains transclusion ownership around a reading-view selection", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="internal-embed markdown-embed is-loaded" src="Nested note">
        <p><a class="internal-link" data-href="Sibling">Sibling</a></p>
      </div>`;
    document.body.appendChild(container);
    const linkText = container.querySelector("a")!.firstChild!;
    const range = document.createRange();
    range.selectNodeContents(linkText);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    const result = document.createElement("div");
    result.innerHTML = getReadingViewSelection(container)!;
    expect(result.querySelector('.internal-embed[src="Nested note"]')).not.toBeNull();
    expect(result.textContent).toBe("Sibling");
  });
});
