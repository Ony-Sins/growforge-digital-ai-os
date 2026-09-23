/* eslint-disable @next/next/no-img-element */
"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ content, size = "sm" }: { content: string; size?: "sm" | "base" }) {
  return (
    <div className={`${size === "base" ? "text-[15px]" : "text-sm"} leading-relaxed text-navy`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => (
            <a {...props} target="_blank" rel="noreferrer" className="break-words text-electric underline underline-offset-2" />
          ),
          code: ({ className, children, ...props }) => {
            const isBlock = /language-/.test(className ?? "");
            return isBlock ? (
              <code className="block overflow-x-auto rounded-lg bg-app px-3 py-2 font-mono text-xs text-white/90" {...props}>
                {children}
              </code>
            ) : (
              <code className="rounded bg-sunken px-1 py-0.5 font-mono text-[0.85em] text-navy" {...props}>
                {children}
              </code>
            );
          },
          ul: (props) => <ul className="mb-3 list-disc space-y-1 pl-5" {...props} />,
          ol: (props) => <ol className="mb-3 list-decimal space-y-1 pl-5" {...props} />,
          p: (props) => <p className="mb-3 last:mb-0" {...props} />,
          strong: (props) => <strong className="font-semibold text-navy" {...props} />,
          h1: (props) => <h2 className="mb-2 mt-5 font-heading text-lg font-bold text-navy first:mt-0" {...props} />,
          h2: (props) => <h3 className="mb-2 mt-5 font-heading text-base font-semibold text-navy first:mt-0" {...props} />,
          h3: (props) => <h4 className="mb-1.5 mt-4 font-heading text-sm font-semibold text-navy first:mt-0" {...props} />,
          blockquote: (props) => (
            <blockquote className="mb-3 rounded-lg border-l-4 border-gold bg-gold/10 px-3 py-2 text-secondary" {...props} />
          ),
          hr: () => <hr className="my-5 border-border-metal" />,
          table: (props) => (
            <div className="mb-3 overflow-x-auto rounded-lg border border-border-metal">
              <table className="w-full border-collapse text-left text-xs" {...props} />
            </div>
          ),
          th: (props) => <th className="border-b border-border-metal bg-sunken px-2.5 py-1.5 font-semibold" {...props} />,
          td: (props) => <td className="border-b border-border-metal px-2.5 py-1.5 align-top" {...props} />,
          img: (props) => (
            <span className="my-3 block overflow-hidden rounded-xl border border-border-metal bg-[#0B1220] p-1 shadow-md">
              <img
                {...props}
                alt={props.alt || "Visual asset"}
                className="max-h-96 w-full rounded-lg object-contain"
                loading="lazy"
              />
            </span>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
