// Server-side sanitizer for article HTML submitted by the browser extension.
// The reader injects this HTML with dangerouslySetInnerHTML, so untrusted markup
// coming off arbitrary publisher pages MUST be scrubbed here (Readability strips
// scripts but is not a security boundary). Node runtime only — needs jsdom.

import { JSDOM } from "jsdom";
import DOMPurify from "dompurify";

// One jsdom window for the process; DOMPurify binds to it. jsdom's window is
// structurally close but not identical to DOMPurify's WindowLike, so cast to the
// factory's own parameter type rather than fighting the DOM lib types.
const purify = DOMPurify(new JSDOM("").window as unknown as Parameters<typeof DOMPurify>[0]);

// Reader-oriented allowlist: structure + media a long-form article needs,
// nothing that can execute or exfiltrate. `javascript:`/`data:` URIs and inline
// event handlers are dropped by DOMPurify regardless of this list.
const ALLOWED_TAGS = [
  "p", "br", "hr",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "blockquote", "pre", "code", "kbd", "samp",
  "em", "strong", "b", "i", "u", "s", "small", "sup", "sub", "mark",
  "ul", "ol", "li", "dl", "dt", "dd",
  "a", "img", "figure", "figcaption", "picture", "source",
  "video", "audio", "iframe",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "span", "div", "time", "cite", "abbr", "address", "q",
];

const ALLOWED_ATTR = [
  "href", "src", "srcset", "alt", "title", "width", "height",
  "loading", "decoding", "colspan", "rowspan", "datetime",
  "controls", "poster", "type", "media", "allow", "allowfullscreen",
  "frameborder", "data-src",
];

export function sanitizeArticleHtml(dirty: string): string {
  return purify.sanitize(dirty ?? "", {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select", "link", "meta", "base"],
    FORBID_ATTR: ["style"],
  });
}
