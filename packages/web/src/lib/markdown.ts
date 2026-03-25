import { Marked, Renderer } from "@/lib/vendor/marked";
import type { Tokens } from "@/lib/vendor/marked";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeHref(href: string): string | null {
  const trimmed = href.trim();

  if (!trimmed) {
    return null;
  }

  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    trimmed.startsWith("#")
  ) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed, "https://atlas.local");

    if (
      url.protocol === "http:" ||
      url.protocol === "https:" ||
      url.protocol === "mailto:" ||
      url.protocol === "tel:"
    ) {
      return trimmed;
    }
  } catch {
    return null;
  }

  return null;
}

const renderer = new Renderer();

renderer.html = ({ text }: Tokens.HTML | Tokens.Tag) => escapeHtml(text);
renderer.link = function ({ href, title, tokens }: Tokens.Link): string {
  const safeHref = sanitizeHref(href);
  const text = this.parser.parseInline(tokens);

  if (!safeHref) {
    return text;
  }

  const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";

  return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noreferrer noopener"${titleAttr}>${text}</a>`;
};
renderer.image = ({ text }: Tokens.Image) => escapeHtml(text || "[图片]");

const markdown = new Marked({
  breaks: true,
  gfm: true,
  renderer,
});

export function renderMarkdown(content: string): string {
  return markdown.parse(content) as string;
}
