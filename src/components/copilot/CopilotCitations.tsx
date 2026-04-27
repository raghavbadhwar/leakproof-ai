import Link from 'next/link';
import { Link2 } from 'lucide-react';
import type { CopilotCitation } from './types';

export function CopilotCitations({ citations }: { citations: CopilotCitation[] }) {
  if (citations.length === 0) return null;

  return (
    <div className="copilot-citations" aria-label="Copilot citations">
      {citations.map((citation) => {
        const className = `copilot-citation-chip copilot-citation-${citation.tone ?? 'default'}`;
        const content = (
          <>
            <Link2 size={12} />
            <span>{citation.label}</span>
          </>
        );

        return citation.href ? (
          <Link key={`${citation.label}-${citation.href}`} className={className} href={citation.href}>
            {content}
          </Link>
        ) : (
          <span key={citation.label} className={className}>
            {content}
          </span>
        );
      })}
    </div>
  );
}
