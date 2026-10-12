"use client";

import { useState, type ReactNode } from "react";

/**
 * Rendu du texte d'un message, sans HTML brut :
 * blocs ```langage, `code en ligne`, **gras**, liens http(s) et @mentions.
 */
export function MessageContent({ text, me }: { text: string; me?: string }) {
  const parts: ReactNode[] = [];
  const fence = /```([\w+#.-]*)[ \t]*\n?([\s\S]*?)```/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = fence.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(<Inline key={i++} text={text.slice(last, match.index)} me={me} />);
    }
    parts.push(<CodeBlock key={i++} lang={match[1] || null} code={match[2].replace(/\n$/, "")} />);
    last = fence.lastIndex;
  }
  if (last < text.length) parts.push(<Inline key={i++} text={text.slice(last)} me={me} />);

  return <div className="break-words">{parts}</div>;
}

function Inline({ text, me }: { text: string; me?: string }) {
  // Retire les sauts de ligne en bordure d'un bloc de code, garde ceux du texte.
  const trimmed = text.replace(/^\n+|\n+$/g, "");
  if (!trimmed) return null;

  const token = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])|(@[a-zA-Z0-9-]{2,39})/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;

  while ((m = token.exec(trimmed)) !== null) {
    if (m.index > last) nodes.push(trimmed.slice(last, m.index));
    const [whole, code, bold, url, mention] = m;
    if (code) {
      nodes.push(
        <code key={k++} className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.88em] text-text">
          {code.slice(1, -1)}
        </code>,
      );
    } else if (bold) {
      nodes.push(
        <strong key={k++} className="font-semibold">
          {bold.slice(2, -2)}
        </strong>,
      );
    } else if (url) {
      nodes.push(
        <a key={k++} href={url} target="_blank" rel="noopener noreferrer" className="text-amber underline-offset-2 hover:underline">
          {url}
        </a>,
      );
    } else if (mention) {
      const isMe = me && mention.slice(1).toLowerCase() === me.toLowerCase();
      nodes.push(
        <span key={k++} className={isMe ? "rounded bg-amber-soft px-1 font-medium text-amber" : "font-medium text-amber"}>
          {mention}
        </span>,
      );
    } else {
      nodes.push(whole);
    }
    last = token.lastIndex;
  }
  if (last < trimmed.length) nodes.push(trimmed.slice(last));

  return <p className="whitespace-pre-wrap">{nodes}</p>;
}

function CodeBlock({ lang, code }: { lang: string | null; code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* presse-papiers refusé par le navigateur */
    }
  }

  return (
    <div className="my-2 overflow-hidden rounded-md border border-line bg-rail">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5 text-xs text-faint">
        <span className="font-mono">{lang ?? "code"}</span>
        <button onClick={copy} className="rounded px-1.5 py-0.5 text-muted hover:text-text">
          {copied ? "Copié" : "Copier"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[13px] leading-relaxed text-text">
        <code>{code}</code>
      </pre>
    </div>
  );
}
