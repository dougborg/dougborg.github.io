/** Lines that open something other than a prose paragraph. */
const NOT_PROSE = /^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|```|~~~|\||<|!\[|\[\^)/;

const plain = (markdown: string) =>
  markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[\^[^\]]+\]/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** The first sentence of the first prose paragraph, as plain text. */
export function firstSentence(body: string): string {
  const paragraphs = body.trim().split(/\n\s*\n/);
  const prose = paragraphs.find((paragraph) => !NOT_PROSE.test(paragraph.trimStart()));
  const text = plain(prose ?? "");
  return text.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? text;
}
