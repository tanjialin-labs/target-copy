// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import {
  preserveLatexForRendering,
  replaceRenderedMathWithLatex,
  restorePreservedLatexSource,
} from "../src/core/math";

describe("LaTeX source output", () => {
  it("turns inline and block formulas into visible editable source", () => {
    const markdown = `Inline $E=mc^2$ formula.

$$
\\int_0^1 x^2 \\, dx
$$`;
    const preserved = preserveLatexForRendering(markdown);

    expect(preserved).toContain('data-target-copy-latex-source="%24E%3Dmc%5E2%24"');
    expect(preserved).toContain('<pre class="target-copy-latex-block">');
    expect(preserved).not.toContain("$E=mc^2$");
  });

  it("restores protected formula source after Markdown rendering", () => {
    const root = document.createElement("div");
    root.innerHTML = preserveLatexForRendering("Inline $E=mc^2$ and $$x^2$$.");
    restorePreservedLatexSource(root);

    expect(root.textContent).toContain("$E=mc^2$");
    expect(root.textContent).toContain("$$x^2$$");
    expect(root.querySelectorAll(".target-copy-latex-inline wbr")).toHaveLength(4);
    expect(root.querySelector("[data-target-copy-latex-source]")).toBeNull();
  });

  it("does not alter formulas inside code or escaped dollar text", () => {
    const markdown = `\`const price = "$5"; $notMath$\`

\`\`\`tex
$code$
\`\`\`

Escaped \\$value and price $5 and $10.`;
    expect(preserveLatexForRendering(markdown)).toBe(markdown);
  });

  it("recovers explicit TeX metadata from a rendered reading selection", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <span class="math math-inline" data-math="E=mc^2"><svg></svg></span>
      <div class="math math-block"><annotation encoding="application/x-tex">x^2</annotation></div>
    `;
    const warnings = replaceRenderedMathWithLatex(root, "en");

    expect(root.textContent).toContain("$E=mc^2$");
    expect(root.textContent).toContain("$$x^2$$");
    expect(root.querySelector("svg")).toBeNull();
    expect(warnings).toEqual([]);
  });

  it("keeps the original rendered formula when its source cannot be recovered", () => {
    const root = document.createElement("div");
    root.innerHTML = '<span class="math math-inline"><svg></svg></span>';
    const warnings = replaceRenderedMathWithLatex(root, "en");

    expect(root.querySelector("svg")).not.toBeNull();
    expect(warnings).toHaveLength(1);
  });
});
