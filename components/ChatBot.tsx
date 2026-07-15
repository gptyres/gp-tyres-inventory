import React, { useEffect, useRef, useState } from 'react';

interface ChatBotProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  currentUser: string;
  isAdmin: boolean;
}

interface AgentSource {
  kind: string;
  title: string;
  identifier?: string;
  verifiedAt?: string | null;
  supplier?: string | null;
}

interface Message {
  role: 'user' | 'assistant';
  text: string;
  messageId?: string;
  sources?: AgentSource[];
  confidence?: number;
  verificationStatus?: 'VERIFIED' | 'PARTIAL' | 'UNVERIFIED';
}

type AgentMode = 'INTERNAL' | 'CUSTOMER_READY';

const formatVerifiedAt = (value?: string | null) => {
  if (!value) return 'time unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-ZA', {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
};

const getAgentErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Business Agent request failed.';
  if (/valid staff login/i.test(message)) return 'Your secure staff session has expired. Please sign in again.';
  if (/not configured/i.test(message)) return 'The GP Business Agent is not configured yet. Ask an administrator to add the server-side NVIDIA key.';
  if (/DEGRADED|temporarily unavailable|overloaded|timeout/i.test(message)) return 'GLM-5.2 is temporarily unavailable. Your stock data has not been changed; please try again shortly.';
  return message || 'The GP Business Agent request failed. Please try again.';
};

export const ChatBot: React.FC<ChatBotProps> = ({ isOpen, onClose, onMinimize, currentUser, isAdmin }) => {
  const [mode, setMode] = useState<AgentMode>('INTERNAL');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: 'GP Business Agent ready. Ask me to search current GP stock, compare supplier availability, check fitment requirements, build a customer reply, or prepare a quotation.'
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen, feedbackFor]);

  const handleModeChange = (nextMode: AgentMode) => {
    if (isLoading || nextMode === mode) return;
    setMode(nextMode);
    setConversationId(null);
    setMessages([{
      role: 'assistant',
      text: nextMode === 'CUSTOMER_READY'
        ? 'Customer-ready mode enabled. I will use verified selling prices and stock, and hide supplier costs, margins, staff notes, and system details.'
        : 'Internal staff mode enabled. Live stock, supplier comparison, fitment support, and quotations are available. Cost and margin tools require admin mode.'
    }]);
  };

  const handleSendMessage = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const userText = inputValue.trim();
    if (!userText || isLoading) return;

    const nextMessages: Message[] = [...messages, { role: 'user', text: userText }];
    setInputValue('');
    setMessages(nextMessages);
    setIsLoading(true);
    setFeedbackFor(null);
    setFeedbackStatus('');

    try {
      const response = await fetch('/api/business-agent', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          mode,
          messages: nextMessages.map((message) => ({ role: message.role, content: message.text }))
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Business Agent request failed.');
      setConversationId(result.conversationId || conversationId);
      setMessages((current) => [...current, {
        role: 'assistant',
        text: result.text || 'No response was generated.',
        messageId: result.messageId,
        sources: Array.isArray(result.sources) ? result.sources : [],
        confidence: typeof result.confidence === 'number' ? result.confidence : undefined,
        verificationStatus: result.verificationStatus
      }]);
    } catch (error) {
      console.error('Business Agent error', error);
      setMessages((current) => [...current, { role: 'assistant', text: getAgentErrorMessage(error), verificationStatus: 'UNVERIFIED' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const submitFeedback = async (messageIndex: number) => {
    const answer = messages[messageIndex];
    const originalQuestion = [...messages.slice(0, messageIndex)].reverse().find((message) => message.role === 'user');
    if (!conversationId || !answer?.messageId || !originalQuestion || !feedbackText.trim() || submittingFeedback) return;
    setSubmittingFeedback(true);
    setFeedbackStatus('');
    try {
      const response = await fetch('/api/business-agent-feedback', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          messageId: answer.messageId,
          originalQuestion: originalQuestion.text,
          originalAnswer: answer.text,
          correction: feedbackText.trim(),
          targetType: 'KNOWLEDGE'
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Correction could not be saved.');
      setFeedbackStatus(result.message || 'Correction saved for approval.');
      setFeedbackText('');
    } catch (error) {
      setFeedbackStatus(error instanceof Error ? error.message : 'Correction could not be saved.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  if (!isOpen) return null;

  return (
    <section className="fixed inset-x-3 bottom-3 z-[100] flex max-h-[88vh] flex-col overflow-hidden rounded-xl border border-gp-border bg-gp-panel shadow-2xl md:left-auto md:right-4 md:w-[520px]" aria-label="GP Business Agent">
      <header className="border-b border-gp-border bg-gp-dark p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gp-red text-sm font-black text-white">AI</div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-black uppercase tracking-wide text-gp-text-main">GP Business Agent</h3>
                <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-green-400">GLM-5.2</span>
              </div>
              <p className="truncate text-[10px] text-gp-text-muted">{currentUser} · {isAdmin ? 'Admin permissions' : 'Sales permissions'} · live tool verification</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onMinimize} className="rounded p-2 text-gp-text-muted hover:bg-gp-input hover:text-gp-text-main" title="Minimise" aria-label="Minimise agent">—</button>
            <button onClick={onClose} className="rounded p-2 text-gp-text-muted hover:bg-gp-input hover:text-red-400" title="Close" aria-label="Close agent">×</button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-gp-black p-1" role="tablist" aria-label="Agent response mode">
          <button
            type="button"
            onClick={() => handleModeChange('INTERNAL')}
            className={`rounded-md px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-colors ${mode === 'INTERNAL' ? 'bg-gp-red text-white' : 'text-gp-text-muted hover:bg-gp-input'}`}
          >
            Internal staff
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('CUSTOMER_READY')}
            className={`rounded-md px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-colors ${mode === 'CUSTOMER_READY' ? 'bg-blue-600 text-white' : 'text-gp-text-muted hover:bg-gp-input'}`}
          >
            Customer-ready
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-gp-black/55 p-4">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[92%] rounded-2xl p-3 text-sm leading-relaxed shadow-sm ${message.role === 'user' ? 'rounded-br-sm bg-gp-red text-white' : 'rounded-bl-sm border border-gp-border bg-gp-panel text-gp-text-main'}`}>
              <div className="whitespace-pre-wrap">{message.text}</div>

              {message.role === 'assistant' && message.verificationStatus && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gp-border/70 pt-2 text-[9px] font-bold uppercase tracking-wider">
                  <span className={message.verificationStatus === 'VERIFIED' ? 'text-green-400' : message.verificationStatus === 'PARTIAL' ? 'text-amber-400' : 'text-gp-text-muted'}>
                    {message.verificationStatus === 'VERIFIED' ? 'Verified sources used' : message.verificationStatus === 'PARTIAL' ? 'Partially verified' : 'No live source verified'}
                  </span>
                  {typeof message.confidence === 'number' && <span className="text-gp-text-muted">{Math.round(message.confidence * 100)}% evidence confidence</span>}
                </div>
              )}

              {message.sources && message.sources.length > 0 && (
                <details className="mt-2 rounded-lg border border-gp-border/70 bg-gp-black/35 p-2">
                  <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-blue-400">Sources used ({message.sources.length})</summary>
                  <div className="mt-2 space-y-2">
                    {message.sources.map((source, sourceIndex) => (
                      <div key={`${source.kind}-${source.identifier || sourceIndex}`} className="border-l-2 border-blue-500/50 pl-2 text-[10px] text-gp-text-muted">
                        <p className="font-bold text-gp-text-main">{source.title}</p>
                        <p>{source.kind.replace(/_/g, ' ')} · verified {formatVerifiedAt(source.verifiedAt)}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {message.role === 'assistant' && message.messageId && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFeedbackFor(feedbackFor === index ? null : index);
                      setFeedbackStatus('');
                    }}
                    className="text-[10px] font-bold text-gp-text-muted underline decoration-dotted underline-offset-2 hover:text-gp-text-main"
                  >
                    Correct this answer
                  </button>
                  {feedbackFor === index && (
                    <div className="mt-2 space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2">
                      <p className="text-[10px] text-gp-text-muted">Your correction is saved as pending knowledge. It does not change trusted data until approved.</p>
                      <textarea
                        value={feedbackText}
                        onChange={(event) => setFeedbackText(event.target.value)}
                        rows={3}
                        maxLength={8000}
                        placeholder="Explain the correct product, fitment, pricing rule, or business policy..."
                        className="w-full resize-none rounded border border-gp-border bg-gp-input p-2 text-xs text-gp-text-main outline-none focus:border-amber-500"
                      />
                      <button
                        type="button"
                        disabled={!feedbackText.trim() || submittingFeedback}
                        onClick={() => submitFeedback(index)}
                        className="rounded bg-amber-500 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-black disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {submittingFeedback ? 'Saving...' : 'Submit for review'}
                      </button>
                      {feedbackStatus && <p className="text-[10px] font-bold text-amber-300">{feedbackStatus}</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-blue-500/30 bg-gp-panel p-3">
              <div className="flex items-center gap-2 text-xs font-bold text-gp-text-main">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                Checking live inventory, suppliers, fitment and business rules...
              </div>
              <p className="mt-1 text-[10px] text-gp-text-muted">No answer is shown until the relevant tools return.</p>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSendMessage} className="border-t border-gp-border bg-gp-panel p-3">
        <div className="flex gap-2">
          <textarea
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSendMessage();
              }
            }}
            rows={2}
            maxLength={4000}
            placeholder={mode === 'CUSTOMER_READY' ? 'e.g. Write a customer reply for 4 × 265/65R17 all-terrain tyres' : 'e.g. Compare verified 245/70R16 stock across GP and suppliers'}
            className="min-h-[52px] flex-1 resize-none rounded-xl border border-gp-border bg-gp-input px-3 py-2 text-sm text-gp-text-main outline-none focus:border-gp-red"
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="self-stretch rounded-xl bg-gp-red px-4 text-xs font-black uppercase tracking-wider text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Send
          </button>
        </div>
        <p className="mt-2 text-[9px] text-gp-text-muted">Enter sends · Shift+Enter adds a line · stock and price claims require live sources</p>
      </form>
    </section>
  );
};
