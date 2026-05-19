import { Fragment, type ReactNode } from 'react';

interface Props {
  text: string;
  className?: string;
}

export default function MarkdownText({ text, className }: Props): JSX.Element {
  return <div className={className}>{renderBlocks(text)}</div>;
}

function renderBlocks(text: string): ReactNode[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      nodes.push(
        <pre key={`code-${index}`}>
          <code>{code.join('\n')}</code>
        </pre>
      );
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const content = renderInline(heading[2], `h-${index}`);
      nodes.push(
        level === 1 ? (
          <h3 key={`h-${index}`}>{content}</h3>
        ) : level === 2 ? (
          <h4 key={`h-${index}`}>{content}</h4>
        ) : (
          <h5 key={`h-${index}`}>{content}</h5>
        )
      );
      index += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        const item = lines[index].replace(/^\s*[-*]\s+/, '');
        items.push(<li key={`li-${index}`}>{renderInline(item, `li-${index}`)}</li>);
        index += 1;
      }
      nodes.push(<ul key={`ul-${index}`}>{items}</ul>);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        const item = lines[index].replace(/^\s*\d+\.\s+/, '');
        items.push(<li key={`oli-${index}`}>{renderInline(item, `oli-${index}`)}</li>);
        index += 1;
      }
      nodes.push(<ol key={`ol-${index}`}>{items}</ol>);
      continue;
    }

    if (/^>\s+/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s+/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s+/, ''));
        index += 1;
      }
      nodes.push(
        <blockquote key={`quote-${index}`}>
          {renderInline(quote.join('\n'), `quote-${index}`)}
        </blockquote>
      );
      continue;
    }

    const para: string[] = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !isBlockStart(lines[index])
    ) {
      para.push(lines[index]);
      index += 1;
    }
    nodes.push(
      <p key={`p-${index}`}>{renderInline(para.join('\n'), `p-${index}`)}</p>
    );
  }

  return nodes;
}

function isBlockStart(line: string): boolean {
  return (
    /^```/.test(line) ||
    /^(#{1,3})\s+/.test(line) ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line) ||
    /^>\s+/.test(line)
  );
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\n)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let partIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${partIndex}`;
    if (token === '\n') {
      nodes.push(<br key={key} />);
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      nodes.push(
        link ? (
          <a key={key} href={link[2]} target="_blank" rel="noreferrer">
            {link[1]}
          </a>
        ) : (
          <Fragment key={key}>{token}</Fragment>
        )
      );
    }
    lastIndex = pattern.lastIndex;
    partIndex += 1;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}
