import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "./markdown";

const html = (md: string) => renderToStaticMarkup(createElement(Markdown, null, md));

describe("Markdown", () => {
  it("keeps raw HTML inert", () => {
    const out = html("<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
  });
  it("drops javascript: hrefs", () => {
    const out = html("[x](javascript:alert(1))");
    expect(out).not.toMatch(/href="javascript/i);
    expect(out).toContain("x");
  });
  it("adds rel/target to external links only", () => {
    expect(html("[a](https://example.com)")).toContain('rel="noopener noreferrer nofollow"');
    expect(html("[a](/news)")).not.toContain("target=");
  });
  it("renders https images as figures with caption and rejects http", () => {
    const ok = html("![Buzzer beater](https://example.com/a.jpg)");
    expect(ok).toContain("<figure>");
    expect(ok).toContain("<figcaption>Buzzer beater</figcaption>");
    expect(ok).not.toContain("<p><figure");
    expect(html("![x](http://example.com/a.jpg)")).not.toContain("<img");
  });
});
