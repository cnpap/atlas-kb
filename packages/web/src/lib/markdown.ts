import MarkdownIt from "markdown-it";
import type { RenderRule } from "markdown-it/lib/renderer.mjs";

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

const markdown = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: true,
});

markdown.validateLink = (url) => sanitizeHref(url) !== null;

const defaultLinkOpen: RenderRule = (tokens, idx, options, _env, self) =>
  self.renderToken(tokens, idx, options);

markdown.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];

  if (!token) {
    return defaultLinkOpen(tokens, idx, options, env, self);
  }

  const href = token.attrGet("href");
  const safeHref = href ? sanitizeHref(href) : null;

  if (!safeHref) {
    return defaultLinkOpen(tokens, idx, options, env, self);
  }

  token.attrSet("href", safeHref);
  token.attrSet("target", "_blank");
  token.attrSet("rel", "noreferrer noopener");
  return defaultLinkOpen(tokens, idx, options, env, self);
};

markdown.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const alt = token
    ? self.renderInlineAsText(token.children ?? [], options, env).trim()
    : "";

  return escapeHtml(alt ? `[图片] ${alt}` : "[图片]");
};

export function renderMarkdown(content: string): string {
  return markdown.render(content);
}
