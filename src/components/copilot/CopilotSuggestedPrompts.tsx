import { BarChart3, FileQuestion, FileText, HelpCircle, ListChecks, Scale, ShieldAlert, StickyNote, TrendingUp } from 'lucide-react';

export const copilotSuggestedPrompts = [
  { prompt: 'What is the biggest leakage?', icon: TrendingUp },
  { prompt: 'What needs review?', icon: ListChecks },
  { prompt: 'Is this audit report-ready?', icon: FileText },
  { prompt: 'What data is missing?', icon: FileQuestion },
  { prompt: 'Explain selected finding.', icon: HelpCircle },
  { prompt: 'Prepare CFO summary.', icon: BarChart3 }
] as const;

export const copilotFindingPrompts = [
  { prompt: 'Explain this finding.', icon: HelpCircle },
  { prompt: 'Explain formula.', icon: Scale },
  { prompt: 'Check false-positive risk.', icon: ShieldAlert },
  { prompt: 'Score evidence quality.', icon: FileQuestion },
  { prompt: 'Draft reviewer checklist.', icon: ListChecks },
  { prompt: 'Draft recovery note.', icon: StickyNote }
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
