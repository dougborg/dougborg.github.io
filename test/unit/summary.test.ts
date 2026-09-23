import assert from "node:assert/strict";
import test from "node:test";
import { firstSentence } from "../../src/summary.ts";

test("takes the first sentence of plain prose", () => {
  assert.equal(firstSentence("One thing. Another thing.\n\nMore."), "One thing.");
});

test("skips headings, lists, code, quotes, tables, and images before the prose", () => {
  const body = [
    "# Title",
    "- a list\n- of items",
    "```ts\nconst x = 1;\n```",
    "> A quote.",
    "| a | b |\n| - | - |",
    "![alt](img.png)",
    "The real opening. Then more.",
  ].join("\n\n");
  assert.equal(firstSentence(body), "The real opening.");
});

test("drops markdown syntax, footnotes, and inline HTML", () => {
  assert.equal(
    firstSentence("A [linked](https://x.test) *word*,[^1] `code`, and <abbr>HTML</abbr>. Next."),
    "A linked word, code, and HTML.",
  );
});

test("wraps across lines and falls back to the whole paragraph without a full stop", () => {
  assert.equal(firstSentence("Line one\ncontinues here"), "Line one continues here");
  assert.equal(firstSentence("```\nonly code\n```"), "");
});
