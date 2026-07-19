"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders a task description as formatted markdown (Trello/Notion style):
// headings, bold/italic, lists, checkboxes, links, quotes, code. Styled for
// the dark theme via per-element classes (no typography plugin needed).
export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-[13.5px] leading-relaxed text-ink2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h1 className="mb-1.5 mt-3 text-[17px] font-bold text-inkstrong first:mt-0" {...p} />,
          h2: (p) => <h2 className="mb-1.5 mt-3 text-[15px] font-bold text-inkstrong first:mt-0" {...p} />,
          h3: (p) => <h3 className="mb-1 mt-2.5 text-[13.5px] font-bold text-inkstrong first:mt-0" {...p} />,
          p: (p) => <p className="my-1.5 first:mt-0 last:mb-0" {...p} />,
          ul: (p) => <ul className="my-1.5 list-disc space-y-0.5 pl-5 marker:text-ink3" {...p} />,
          ol: (p) => <ol className="my-1.5 list-decimal space-y-0.5 pl-5 marker:text-ink3" {...p} />,
          li: (p) => <li className="pl-0.5" {...p} />,
          a: (p) => <a className="text-accent underline underline-offset-2 hover:brightness-110" target="_blank" rel="noreferrer" {...p} />,
          strong: (p) => <strong className="font-bold text-inkstrong" {...p} />,
          em: (p) => <em className="italic" {...p} />,
          del: (p) => <del className="text-ink3" {...p} />,
          blockquote: (p) => <blockquote className="my-2 border-l-2 border-line pl-3 text-ink3" {...p} />,
          hr: () => <hr className="my-3 border-line2" />,
          code: ({ className, ...p }) =>
            className?.includes("language-") ? (
              <code className={`${className} font-mono text-[12px]`} {...p} />
            ) : (
              <code className="rounded-[4px] bg-cardalt px-1 py-0.5 font-mono text-[12px] text-ink" {...p} />
            ),
          pre: (p) => (
            <pre className="my-2 overflow-x-auto rounded-[8px] border border-line2 bg-cardalt p-2.5 text-[12px] text-ink" {...p} />
          ),
          input: (p) => <input className="mr-1.5 -mb-px accent-[#C2F24C]" disabled {...p} />,
          table: (p) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-[12.5px]" {...p} />
            </div>
          ),
          th: (p) => <th className="border border-line2 px-2 py-1 text-left font-semibold text-ink" {...p} />,
          td: (p) => <td className="border border-line2 px-2 py-1" {...p} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
