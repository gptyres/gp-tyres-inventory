import React, { useState, useEffect, useRef } from 'react';

interface ChatBotProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
}

interface Message {
  role: 'user' | 'model';
  text: string;
  sources?: { uri: string; title: string }[];
}

const getFitmentErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Fitment bot request failed.';

  if (/DEGRADED function cannot be invoked/i.test(message)) {
    return 'NVIDIA GLM-5.2 is temporarily unavailable right now. Please try again shortly.';
  }

  if (/NVIDIA API key is not configured/i.test(message)) {
    return 'NVIDIA bot is not configured yet. Please contact admin.';
  }

  return message || 'Fitment bot request failed. Please try again.';
};

export const ChatBot: React.FC<ChatBotProps> = ({ isOpen, onClose, onMinimize }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: 'Fast Fitment Bot Ready. Name the car (e.g., "Golf 7 GTI").' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userText = inputValue;
    const nextMessages: Message[] = [...messages, { role: 'user', text: userText }];
    setInputValue('');
    setMessages(nextMessages);
    setIsLoading(true);

    try {
      const response = await fetch('/api/fitment-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Fitment bot request failed.');
      }

      setMessages(prev => [
        ...prev,
        { role: 'model', text: result.text || 'No response generated.' }
      ]);
    } catch (error) {
      console.error('Chat Error', error);
      setMessages(prev => [...prev, { role: 'model', text: getFitmentErrorMessage(error) }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] w-full max-w-sm md:max-w-md flex flex-col shadow-2xl animate-fade-in-up">
      <div className="bg-gp-panel border border-gp-border rounded-t-lg shadow-lg flex flex-col h-[500px] max-h-[80vh]">
        <div className="bg-gp-dark p-3 border-b border-gp-border flex justify-between items-center rounded-t-lg">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gp-red/10 flex items-center justify-center text-gp-red">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-gp-text-main">Fitment Expert <span className="text-[10px] bg-gp-red/20 text-gp-red px-1 rounded ml-1">NVIDIA</span></h3>
              <span className="text-[10px] text-green-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                Online
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onMinimize} className="p-1.5 hover:bg-gp-input rounded text-gp-text-muted hover:text-gp-text-main" title="Minimize">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-gp-input rounded text-gp-text-muted hover:text-red-500" title="Close">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-gp-black/50 space-y-4">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed shadow-sm ${
                msg.role === 'user'
                  ? 'bg-gp-red text-white rounded-br-none'
                  : 'bg-gp-panel border border-gp-border text-gp-text-main rounded-bl-none'
              }`}>
                <div className="whitespace-pre-wrap">{msg.text}</div>

                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-gp-border/50">
                    <p className="text-[10px] font-bold opacity-70 mb-1">Sources:</p>
                    <div className="flex flex-wrap gap-2">
                      {msg.sources.map((source, i) => (
                        <a
                          key={i}
                          href={source.uri}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] underline opacity-80 hover:opacity-100 truncate max-w-full"
                        >
                          {source.title}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gp-panel border border-gp-border rounded-2xl rounded-bl-none p-3 flex gap-1">
                <div className="w-2 h-2 bg-gp-text-muted rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gp-text-muted rounded-full animate-bounce delay-75"></div>
                <div className="w-2 h-2 bg-gp-text-muted rounded-full animate-bounce delay-150"></div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSendMessage} className="p-3 bg-gp-panel border-t border-gp-border flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask e.g. 'PCD for BMW F30'"
            className="flex-1 bg-gp-input border border-gp-border rounded-full px-4 py-2 text-sm text-gp-text-main focus:border-gp-red focus:outline-none"
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className={`p-2 rounded-full bg-gp-red text-white transition-all ${isLoading || !inputValue.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-700 active:scale-95 shadow-md'}`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
};
