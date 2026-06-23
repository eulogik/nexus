import { useState, useCallback } from 'react';
import type { ComponentProps } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded-md bg-[var(--nexus-bg-tertiary)] border border-[var(--nexus-border-secondary)] opacity-0 group-hover/code:opacity-100 transition-opacity text-[var(--nexus-text-tertiary)] hover:text-white hover:bg-surface-hover"
      title="Copy code"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

const customComponents: Components = {
  code({
    className,
    children,
    ...props
  }: ComponentProps<'code'> & { className?: string }) {
    const match = /language-(\w+)/.exec(className ?? '');
    const codeString = String(children).replace(/\n$/, '');

    if (match) {
      return (
        <div className="group/code relative my-3">
          <div className="flex items-center justify-between px-4 py-1.5 text-xs text-[var(--nexus-text-tertiary)] bg-[var(--nexus-bg-tertiary)] border border-[var(--nexus-border-primary)] border-b-0 rounded-t-lg">
            <span>{match[1]}</span>
          </div>
          <CopyButton text={codeString} />
          <SyntaxHighlighter
            style={oneDark}
            language={match[1]}
            PreTag="div"
            customStyle={{
              margin: 0,
              borderTopLeftRadius: 0,
              borderTopRightRadius: 0,
              borderTop: 'none',
              border: '1px solid var(--nexus-border-primary)',
              borderRadius: '0 0 6px 6px',
              padding: '16px',
              fontSize: '13px',
              background: '#1a1b26',
            }}
          >
            {codeString}
          </SyntaxHighlighter>
        </div>
      );
    }

    return (
      <code
        className="text-sm px-1.5 py-0.5 rounded"
        style={{
          background: 'rgba(92,124,250,0.1)',
          color: 'var(--nexus-text-primary)',
          fontSize: '0.875em',
        }}
        {...props}
      >
        {children}
      </code>
    );
  },

  a({ href, children, ...props }: ComponentProps<'a'>) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'var(--nexus-text-link)' }}
        className="hover:underline"
        {...props}
      >
        {children}
      </a>
    );
  },

  ul({ children, ...props }: ComponentProps<'ul'>) {
    return (
      <ul className="list-disc pl-6 my-2 space-y-1 text-sm" {...props}>
        {children}
      </ul>
    );
  },

  ol({ children, ...props }: ComponentProps<'ol'>) {
    return (
      <ol className="list-decimal pl-6 my-2 space-y-1 text-sm" {...props}>
        {children}
      </ol>
    );
  },

  li({ children, ...props }: ComponentProps<'li'>) {
    return (
      <li className="leading-relaxed" {...props}>
        {children}
      </li>
    );
  },

  table({ children, ...props }: ComponentProps<'table'>) {
    return (
      <div className="overflow-x-auto my-3">
        <table
          className="w-full text-sm border-collapse border border-[var(--nexus-border-primary)] rounded-lg"
          {...props}
        >
          {children}
        </table>
      </div>
    );
  },

  thead({ children, ...props }: ComponentProps<'thead'>) {
    return (
      <thead className="bg-[var(--nexus-bg-tertiary)]" {...props}>
        {children}
      </thead>
    );
  },

  th({ children, ...props }: ComponentProps<'th'>) {
    return (
      <th
        className="px-3 py-2 text-left font-medium text-[var(--nexus-text-secondary)] border-b border-[var(--nexus-border-primary)]"
        {...props}
      >
        {children}
      </th>
    );
  },

  td({ children, ...props }: ComponentProps<'td'>) {
    return (
      <td
        className="px-3 py-2 border-b border-[var(--nexus-border-primary)]"
        {...props}
      >
        {children}
      </td>
    );
  },

  p({ children, ...props }: ComponentProps<'p'>) {
    return (
      <p className="my-2 leading-relaxed text-sm" {...props}>
        {children}
      </p>
    );
  },

  h1({ children, ...props }: ComponentProps<'h1'>) {
    return (
      <h1 className="text-lg font-semibold mt-4 mb-2 text-white" {...props}>
        {children}
      </h1>
    );
  },

  h2({ children, ...props }: ComponentProps<'h2'>) {
    return (
      <h2 className="text-base font-semibold mt-3 mb-2 text-white" {...props}>
        {children}
      </h2>
    );
  },

  h3({ children, ...props }: ComponentProps<'h3'>) {
    return (
      <h3 className="text-sm font-semibold mt-3 mb-1 text-white" {...props}>
        {children}
      </h3>
    );
  },

  blockquote({ children, ...props }: ComponentProps<'blockquote'>) {
    return (
      <blockquote
        className="pl-4 my-2 border-l-2 border-[var(--nexus-accent-blue)] text-[var(--nexus-text-secondary)] italic text-sm"
        {...props}
      >
        {children}
      </blockquote>
    );
  },

  hr(props: ComponentProps<'hr'>) {
    return (
      <hr
        className="my-4 border-[var(--nexus-border-primary)]"
        {...props}
      />
    );
  },
};

export function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown components={customComponents}>
      {content}
    </ReactMarkdown>
  );
}
