import { memo, useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { marked } from "marked";
import "katex/dist/katex.min.css";
import type { ThemeName } from "../feature/user/userSlice";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="cursor-pointer hover:opacity-80"
      style={{ color: "var(--text-secondary)" }}
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

interface MarkdownRendererProps {
  content: string;
  theme?: ThemeName;
  id?: string;
}

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex];

/**
 * Normalize LaTeX delimiters so remark-math can parse them:
 *   \[...\]  →  $$...$$   (display math)
 *   \(...\)  →  $...$     (inline math)
 */
function normalizeLatex(text: string): string {
  // Block math: \[...\] (may span multiple lines)
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_match, inner) => `$$${inner}$$`);
  // Inline math: \(...\)
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_match, inner) => `$${inner}$`);
  return text;
}

/**
 * Parse markdown into block-level tokens using marked.lexer().
 * Returns an array of raw markdown strings, one per block.
 */
function parseMarkdownIntoBlocks(content: string): string[] {
  const tokens = marked.lexer(content);
  return tokens
    .filter((t) => t.type !== "space")
    .map((t) => t.raw);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MarkdownComponents = Record<string, React.ComponentType<any>>;

/**
 * A single markdown block, memo'd so it skips re-render when content is unchanged.
 */
const MemoizedMarkdownBlock = memo(
  ({ content, components }: { content: string; components: MarkdownComponents }) => (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={components}
    >
      {normalizeLatex(content)}
    </ReactMarkdown>
  ),
  (prev, next) => prev.content === next.content && prev.components === next.components,
);
MemoizedMarkdownBlock.displayName = "MemoizedMarkdownBlock";

/**
 * Splits content into blocks and renders each with MemoizedMarkdownBlock.
 * Only the last (actively streaming) block re-renders; all prior blocks are memo-skipped.
 */
function MemoizedMarkdown({ content, id, components }: { content: string; id: string; components: MarkdownComponents }) {
  const blocks = useMemo(() => parseMarkdownIntoBlocks(content), [content]);

  return (
    <>
      {blocks.map((block, i) => (
        <MemoizedMarkdownBlock
          key={`${id}-${i}`}
          content={block}
          components={components}
        />
      ))}
    </>
  );
}

const MarkdownRenderer = memo(({ content, theme = "saas", id = "md" }: MarkdownRendererProps) => {
  const isDark = theme === "dark";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const codeStyle: any = isDark ? vscDarkPlus : oneLight;

  const components = useMemo(() => ({
    // Links: open external links in new tab, subtle inline style
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    a({ href, children, title, ...props }: any) {
      const isExternal = href && (href.startsWith("http://") || href.startsWith("https://"));
      const isCitation = title === "source";

      if (isCitation) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 no-underline hover:opacity-80 align-baseline"
            style={{
              fontSize: "0.7em",
              padding: "1px 6px",
              borderRadius: "9999px",
              backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
              color: "var(--text-secondary)",
              verticalAlign: "middle",
              lineHeight: 1.6,
              marginLeft: "2px",
              fontWeight: 500,
            }}
            {...props}
          >
            {children}
            <sup style={{ fontSize: "0.7em", opacity: 0.5 }}>↗</sup>
          </a>
        );
      }

      return (
        <a
          href={href}
          {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className="no-underline hover:underline"
          style={{ color: "var(--accent)" }}
          {...props}
        >
          {children}
          {isExternal && (
            <sup style={{ fontSize: "0.6em", marginLeft: "1px", opacity: 0.5 }}>↗</sup>
          )}
        </a>
      );
    },
    // Strip prose default dark background from <pre>
    pre({ children }: { children?: React.ReactNode }) {
      return <>{children}</>;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
    code({ className, children, ref, node, ...props }: any) {
      const match = /language-(\w+)/.exec(className || "");
      return match ? (
        <div
          className="not-prose rounded-lg overflow-hidden my-2"
          style={{
            border: "1px solid var(--border-main)",
            backgroundColor: "var(--code-block-bg)",
          }}
        >
          <div
            className="flex justify-between items-center px-3 py-1.5 text-[11px]"
            style={{
              borderBottom: "1px solid var(--border-main)",
              backgroundColor: "var(--code-header-bg)",
              color: "var(--text-secondary)",
            }}
          >
            <span className="uppercase tracking-wider font-medium">{match[1]}</span>
            <CopyButton text={String(children).replace(/\n$/, "")} />
          </div>
          <SyntaxHighlighter
            style={codeStyle}
            language={match[1]}
            PreTag="div"
            {...props}
            customStyle={{
              margin: 0,
              borderRadius: 0,
              fontSize: "0.75rem",
              background: "transparent",
              padding: "0.75rem 1rem",
            }}
            codeTagProps={{ style: { background: "transparent" } }}
          >
            {String(children).replace(/\n$/, "")}
          </SyntaxHighlighter>
        </div>
      ) : (
        <code
          className="px-1 py-0.5 rounded text-xs font-mono"
          style={{
            backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "var(--accent-light)",
            color: "var(--accent)",
          }}
          ref={ref}
          {...props}
        >
          {children}
        </code>
      );
    },
  }), [codeStyle, isDark]);

  return (
    <div
      className="prose prose-sm max-w-none"
      style={{
        color: "var(--text-primary)",
        "--tw-prose-body": "var(--text-primary)",
        "--tw-prose-headings": "var(--text-primary)",
        "--tw-prose-bold": "var(--text-primary)",
        "--tw-prose-links": "var(--accent)",
        "--tw-prose-code": "var(--accent)",
        "--tw-prose-quotes": "var(--text-secondary)",
        "--tw-prose-hr": "var(--border-main)",
      } as React.CSSProperties}
    >
      <MemoizedMarkdown content={content} id={id} components={components} />
    </div>
  );
});

MarkdownRenderer.displayName = "MarkdownRenderer";

export default MarkdownRenderer;
