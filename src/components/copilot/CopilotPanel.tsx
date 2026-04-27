'use client';

import { FormEvent, useMemo, useRef, useState } from 'react';
import { Bot, ChevronDown, Loader2, Lock, MessageSquareText, RotateCcw, Send, ShieldCheck } from 'lucide-react';
import { CopilotMessage } from './CopilotMessage';
import { CopilotSuggestedPrompts } from './CopilotSuggestedPrompts';
import type { CopilotActionTransitionResponse, CopilotConversationMessage, CopilotPendingAction, CopilotResponse, CopilotRole } from './types';

export function CopilotPanel({
  accessToken,
  organizationId,
  workspaceId,
  workspaceName,
  userRole,
  selectedFindingId
}: {
  accessToken: string;
  organizationId: string;
  workspaceId: string;
  workspaceName: string;
  userRole: CopilotRole;
  selectedFindingId?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<CopilotConversationMessage[]>([]);
  const [lastPrompt, setLastPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idCounter = useRef(0);
  const canMutate = ['owner', 'admin', 'reviewer'].includes(userRole);
  const disabled = isLoading || !organizationId || !workspaceId;
  const headerRole = userRole || 'viewer';
  const safeWorkspaceName = workspaceName || 'Audit workspace';

  const emptyMessage = useMemo<CopilotConversationMessage>(() => ({
    id: 'empty',
    role: 'assistant',
    content: 'Ask me about this audit.'
  }), []);

  async function submitPrompt(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed || disabled) return;

    setIsOpen(true);
    setError(null);
    setInput('');
    setLastPrompt(trimmed);
    const userMessage = makeMessage('user', trimmed);
    setMessages((current) => [...current, userMessage]);
    setIsLoading(true);

    try {
      const response = await callCopilot(trimmed);
      setThreadId(response.thread_id);
      setMessages((current) => [...current, makeMessage('assistant', response.answer, response)]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Copilot request failed.';
      setError(message);
      setMessages((current) => [...current, makeMessage('assistant', 'I could not review the workspace data.', undefined, message)]);
    } finally {
      setIsLoading(false);
    }
  }

  async function callCopilot(message: string): Promise<CopilotResponse> {
    const response = await fetch(`/api/workspaces/${workspaceId}/copilot`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        organization_id: organizationId,
        thread_id: threadId ?? undefined,
        message,
        selected_finding_id: selectedFindingId || undefined,
        mode: 'read_only'
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof payload.error === 'string' ? payload.error : 'Copilot request failed.');
    }
    return payload as CopilotResponse;
  }

  async function transitionAction(actionId: string, transition: 'confirm' | 'cancel') {
    if (!actionId || busyActionId) return;
    setBusyActionId(actionId);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/copilot/actions/${actionId}/${transition}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          organization_id: organizationId
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Copilot action update failed.');
      }
      const result = payload as CopilotActionTransitionResponse;
      updateActionCard(result.action);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Copilot action update failed.');
    } finally {
      setBusyActionId(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitPrompt(input);
  }

  function makeMessage(role: CopilotConversationMessage['role'], content: string, response?: CopilotResponse, messageError?: string): CopilotConversationMessage {
    idCounter.current += 1;
    return {
      id: `${role}-${idCounter.current}`,
      role,
      content,
      response,
      error: messageError
    };
  }

  function updateActionCard(nextAction: CopilotPendingAction) {
    setMessages((current) => current.map((message) => {
      if (!message.response) return message;
      return {
        ...message,
        response: {
          ...message.response,
          action_cards: (message.response.action_cards ?? []).map((action) => action.id === nextAction.id ? nextAction : action)
        }
      };
    }));
  }

  return (
    <aside className={isOpen ? 'copilot-shell copilot-open' : 'copilot-shell'} aria-label="LeakProof Copilot">
      <button type="button" className="copilot-mobile-toggle" onClick={() => setIsOpen((current) => !current)} aria-expanded={isOpen}>
        <MessageSquareText size={16} />
        LeakProof Copilot
        <ChevronDown size={16} />
      </button>

      <div className="copilot-panel">
        <header className="copilot-header">
          <div className="copilot-title-row">
            <span className="copilot-mark"><Bot size={17} /></span>
            <div>
              <h2>LeakProof Copilot</h2>
              <p>{safeWorkspaceName}</p>
            </div>
          </div>
          <div className="copilot-badge-row">
            <span className="copilot-mode-badge"><ShieldCheck size={13} /> Read-only</span>
            <span className="copilot-later-badge"><Lock size={13} /> Actions enabled later</span>
            <span className={canMutate ? 'copilot-role-badge' : 'copilot-role-badge read-only-role'}>
              {canMutate ? headerRole : 'Read-only role'}
            </span>
          </div>
          <small>AI suggests. Code calculates. Human approves.</small>
        </header>

        <div className="copilot-safety-labels" aria-label="Copilot safety labels">
          <span className="scope-approved">Customer-facing leakage</span>
          <span className="scope-internal">Internal pipeline exposure</span>
          <span className="scope-review">Needs finance review</span>
          <span className="scope-approved">Approved evidence only</span>
        </div>

        <section className="copilot-thread" aria-live="polite">
          {messages.length === 0 ? <CopilotMessage message={emptyMessage} /> : messages.map((message) => (
            <CopilotMessage
              key={message.id}
              message={message}
              onConfirmAction={(actionId) => void transitionAction(actionId, 'confirm')}
              onCancelAction={(actionId) => void transitionAction(actionId, 'cancel')}
              busyActionId={busyActionId}
            />
          ))}
          {isLoading ? (
            <div className="copilot-loading">
              <Loader2 className="spin" size={16} />
              Reviewing workspace data…
            </div>
          ) : null}
        </section>

        {messages.length === 0 ? (
          <CopilotSuggestedPrompts onSelect={(prompt) => void submitPrompt(prompt)} disabled={disabled} hasSelectedFinding={Boolean(selectedFindingId)} />
        ) : null}

        {error ? (
          <div className="copilot-error">
            <span>{error}</span>
            <button type="button" className="secondary-button" onClick={() => void submitPrompt(lastPrompt)} disabled={!lastPrompt || disabled}>
              <RotateCcw size={14} />
              Retry
            </button>
          </div>
        ) : null}

        <form className="copilot-input-row" onSubmit={handleSubmit}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={selectedFindingId ? 'Ask about the selected finding…' : 'Ask about this audit…'}
            aria-label="Ask LeakProof Copilot"
            disabled={disabled}
          />
          <button type="submit" disabled={disabled || input.trim().length === 0} aria-label="Send Copilot message">
            {isLoading ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
          </button>
        </form>
      </div>
    </aside>
  );
}
