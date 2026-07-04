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

export const ChatBot: React.FC<ChatBotProps> = ({ isOpen, onClose, onMinimize }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: '⚡ Fast Fitment Bot Ready. Name the car (e.g., "Golf 7 GTI").' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Initialize AI Client
  const aiRef = useRef<any>(null);
  const chatSessionRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    const initializeAI = async () => {
      if (!aiRef.current) {
        try {
            const { GoogleGenAI } = await import('@google/genai');
            if (cancelled) return;
            aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY });
            chatSessionRef.current = aiRef.current.chats.create({
                model: 'gemini-3-flash-preview',
                config: {
                    systemInstruction: "You are a high-speed automotive fitment expert for 'GP Tyres & Mags'. Provide **fast, accurate, and concise** Wheel Specifications and Tyre Sizes. \n\n" +
                    "RULES:\n" +
                    "1. KEEP IT SHORT: Users need quick info. Use bullet points. Minimal text.\n" +
                    "2. FORMAT:\n" +
                    "   • **PCD**: [Value]\n" +
                    "   • **Offset**: [Value]\n" +
                    "   • **Center Bore**: [Value]\n" +
                    "   • **Tyres**: [Size 1], [Size 2]\n" +
                    "3. TOOL: You MUST use 'googleSearch' to find accurate data (e.g. wheel-size.com).",
                    tools: [{ googleSearch: {} }]
                }
            });
        } catch (error) {
            console.error("Failed to initialize AI", error);
        }
      }
    };

    void initializeAI();
    return () => {
      cancelled = true;
    };
  }, []);

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
    setInputValue('');
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setIsLoading(true);

    try {
        if (chatSessionRef.current) {
            const result = await chatSessionRef.current.sendMessage({ message: userText });
            const responseText = result.text;
            
            // Extract grounding metadata if available
            const groundingChunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
            const sources = groundingChunks
                .map((chunk: any) => chunk.web)
                .filter((web: any) => web && web.uri && web.title);

            setMessages(prev => [
                ...prev, 
                { role: 'model', text: responseText, sources: sources.length > 0 ? sources : undefined }
            ]);
        }
    } catch (error) {
        console.error("Chat Error", error);
        setMessages(prev => [...prev, { role: 'model', text: "Connection error. Please try again." }]);
    } finally {
        setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] w-full max-w-sm md:max-w-md flex flex-col shadow-2xl animate-fade-in-up">
      <div className="bg-gp-panel border border-gp-border rounded-t-lg shadow-lg flex flex-col h-[500px] max-h-[80vh]">
        
        {/* Header */}
        <div className="bg-gp-dark p-3 border-b border-gp-border flex justify-between items-center rounded-t-lg">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gp-red/10 flex items-center justify-center text-gp-red">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <div>
                <h3 className="text-sm font-bold text-gp-text-main">Fitment Expert <span className="text-[10px] bg-gp-red/20 text-gp-red px-1 rounded ml-1">LITE</span></h3>
                <span className="text-[10px] text-green-500 flex items-center gap-1"><span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>Online</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onMinimize} className="p-1.5 hover:bg-gp-input rounded text-gp-text-muted hover:text-gp-text-main" title="Minimize">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-gp-input rounded text-gp-text-muted hover:text-red-500" title="Close">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 bg-gp-black/50 space-y-4">
            {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed shadow-sm ${
                        msg.role === 'user' 
                        ? 'bg-gp-red text-white rounded-br-none' 
                        : 'bg-gp-panel border border-gp-border text-gp-text-main rounded-bl-none'
                    }`}>
                        <div className="whitespace-pre-wrap">{msg.text}</div>
                        
                        {/* Sources */}
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

        {/* Input Area */}
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
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            </button>
        </form>

      </div>
    </div>
  );
};
