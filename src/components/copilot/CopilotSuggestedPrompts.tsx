import { BarChart3, FileQuestion, FileText, HelpCircle, ListChecks, Route, Scale, ShieldAlert, StickyNote, Table2 } from 'lucide-react';

export const copilotSuggestedPrompts = [
  { prompt: 'Map uploaded CSV', icon: Table2 },
  { prompt: 'Find missing data', icon: FileQuestion },
  { prompt: 'Check report readiness', icon: FileText },
  { prompt: 'What should I do next?', icon: ListChecks },
  { prompt: 'Prepare CFO summary.', icon: BarChart3 },
  { prompt: 'Explain root causes', icon: Route }
] as const;

export const copilotFindingPrompts = [
  { prompt: 'Explain this finding.', icon: HelpCircle },
  { prompt: 'Explain formula.', icon: Scale },
  { prompt: 'Review evidence quality', icon: FileQuestion },
  { prompt: 'Check false positives', icon: ShieldAlert },
  { prompt: 'Why did this leakage happen?', icon: Route },
  { prompt: 'Draft reviewer checklist.', icon: ListChecks },
  { prompt: 'Draft recovery note', icon: StickyNote }
] as const;

export function CopilotSuggestedPrompts({
  onSelect,
  disabled,
  hasSelectedFinding
}: {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
  hasSelectedFinding?: boolean;
}) {
  const prompts = hasSelectedFinding ? copilotFindingPrompts : copilotSuggestedPrompts;
  return (
    <div className="copilot-suggested-prompts" aria-label="Suggested Copilot prompts">
      {prompts.map((item) => {
        const Icon = item.icon;
        return (
          <button key={item.prompt} type="button" className="copilot-prompt-chip" onClick={() => onSelect(item.prompt)} disabled={disabled}>
            <Icon size={14} />
            <span>{item.prompt}</span>
          </button>
        );
      })}
    </div>
  );
}
