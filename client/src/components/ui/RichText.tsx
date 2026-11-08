/**
 * Renders agent-written text safely (no HTML injection): paragraphs,
 * "- " / "1." bullets and **bold** spans only.
 */
import { Fragment } from 'react';

function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold text-fg">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks: { type: 'p' | 'ul'; lines: string[] }[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      const last = blocks.at(-1);
      if (last?.type === 'ul') last.lines.push(bullet[1]);
      else blocks.push({ type: 'ul', lines: [bullet[1]] });
    } else {
      blocks.push({ type: 'p', lines: [line.replace(/^#+\s*/, '')] });
    }
  }
  return (
    <div className={className}>
      {blocks.map((b, i) =>
        b.type === 'ul' ? (
          <ul key={i} className="my-1 list-disc space-y-0.5 pl-4">
            {b.lines.map((l, j) => (
              <li key={j}>{inline(l)}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="my-1">
            {inline(b.lines[0])}
          </p>
        )
      )}
    </div>
  );
}
