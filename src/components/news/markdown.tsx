import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Posts are markdown typed by club members, so this is an XSS boundary even though RLS limits who
 * can write. react-markdown outputs React elements (no dangerouslySetInnerHTML) and we do NOT add
 * rehype-raw, so raw HTML stays inert text. Its default urlTransform drops javascript:/data: hrefs.
 */
const components: Components = {
  a({ href, children }) {
    const external = /^https?:\/\//i.test(href ?? "");
    return external ? (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    ) : (
      <a href={href}>{children}</a>
    );
  },
  // https only: an http image on an https page is blocked mixed content anyway, and file:/data: are out.
  img({ src, alt }) {
    if (typeof src !== "string" || !/^https:\/\//i.test(src)) return null;
    return (
      <figure>
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external hosts; no loader configured */}
        <img src={src} alt={alt ?? ""} loading="lazy" />
        {alt ? <figcaption>{alt}</figcaption> : null}
      </figure>
    );
  },
  // A <figure> inside a <p> is invalid HTML; unwrap paragraphs that hold only an image.
  p({ node, children }) {
    const kids = node?.children ?? [];
    if (kids.length === 1 && kids[0].type === "element" && kids[0].tagName === "img") return <>{children}</>;
    return <p>{children}</p>;
  },
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
