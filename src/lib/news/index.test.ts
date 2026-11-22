import { describe, expect, it } from "vitest";
import { keepScores, formatNewsDate, plainSummary, slugify, wasEdited, categoryLabel } from "./index";

describe("slugify", () => {
  it("lowercases and dashes", () => expect(slugify("Nebraska beats Ohio State")).toBe("nebraska-beats-ohio-state"));
  it("transliterates Vietnamese", () => expect(slugify("Đội bóng thắng")).toBe("doi-bong-thang"));
  it("falls back to 'post' for empty or emoji-only titles", () => {
    expect(slugify("")).toBe("post");
    expect(slugify("🏀🏀")).toBe("post");
  });
  it("caps at 60 chars with no trailing dash", () => {
    const s = slugify("word ".repeat(40));
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith("-")).toBe(false);
  });
  it("collapses repeated punctuation", () => expect(slugify("Win!!! -- again?")).toBe("win-again"));
});

describe("formatNewsDate", () => {
  const now = new Date(2026, 10, 22, 12, 0);
  it("uses AP months", () => {
    expect(formatNewsDate(new Date(2026, 8, 3).toISOString(), now)).toBe("Sept. 3, 2026");
    expect(formatNewsDate(new Date(2026, 2, 3).toISOString(), now)).toBe("March 3, 2026");
  });
  it("is relative within 24h only when asked", () => {
    const iso = new Date(2026, 10, 22, 9, 0).toISOString();
    expect(formatNewsDate(iso, now, true)).toBe("3h ago");
    expect(formatNewsDate(iso, now)).toBe("Nov. 22, 2026");
    expect(formatNewsDate(new Date(2026, 10, 22, 11, 18).toISOString(), now, true)).toBe("42m ago");
  });
  it("handles a year boundary and bad input", () => {
    expect(formatNewsDate(new Date(2025, 11, 31).toISOString(), now, true)).toBe("Dec. 31, 2025");
    expect(formatNewsDate("nope", now)).toBe("");
  });
});

describe("wasEdited", () => {
  const pub = "2026-11-21T10:00:00Z";
  it("is false at 59 minutes, true at 61", () => {
    expect(wasEdited(pub, "2026-11-21T10:59:00Z")).toBe(false);
    expect(wasEdited(pub, "2026-11-21T11:01:00Z")).toBe(true);
  });
  it("is false for unpublished posts", () => expect(wasEdited(null, pub)).toBe(false));
});

describe("plainSummary", () => {
  it("prefers the summary", () => expect(plainSummary({ summary: " Hi ", body: "x" })).toBe("Hi"));
  it("strips markdown and cuts on a word boundary", () => {
    const s = plainSummary({ body: "## Title\n\n**Bold** [link](http://x.y) " + "word ".repeat(60) });
    expect(s).not.toMatch(/[#*\[\]()]/);
    expect(s.endsWith("…")).toBe(true);
    expect(s.length).toBeLessThanOrEqual(162);
  });
  it("returns short bodies whole", () => expect(plainSummary({ body: "Short." })).toBe("Short."));
});

describe("categoryLabel", () => {
  it("maps and falls back", () => {
    expect(categoryLabel("recap")).toBe("Game recap");
    expect(categoryLabel("zzz")).toBe("News");
  });
});

describe("keepScores", () => {
  it("joins digits across an en dash only", () => {
    expect(keepScores("Win 68–64")).toBe("Win 68\u2060–\u206064");
    expect(keepScores("Rise – fall")).toBe("Rise – fall");
  });
});
