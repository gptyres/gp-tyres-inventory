
import React, { useState } from 'react';

interface NavbarProps {
  isAdmin: boolean;
  toggleAdmin: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onMenuClick: () => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
  isSearchVisible: boolean;
  toggleSearch: () => void;
  toggleChat: () => void;
  isChatOpen: boolean;
  placeholder?: string;
  pageTitle?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  isAdmin,
  toggleAdmin,
  searchQuery,
  setSearchQuery,
  onMenuClick,
  isDarkMode,
  toggleTheme,
  isSearchVisible,
  toggleSearch,
  toggleChat,
  isChatOpen,
  placeholder = "Search inventory (e.g. 195 40 17, Dunlop...)",
  pageTitle
}) => {
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isAiDropdownOpen, setIsAiDropdownOpen] = useState(false);

  const handleAiSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsAiThinking(true);
    setIsAiDropdownOpen(true);
    setAiResult(null);

    try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const prompt = `You are an expert automotive inventory assistant for 'GP Tyres & Mags'. 
        The user is searching for: "${searchQuery}". 
        Provide a concise, helpful summary related to this search term. 
        If it's a tyre size, explain common vehicles it fits. 
        If it's a brand, summarize its reputation. 
        If it's technical (e.g. "PCD"), explain it.
        Keep it under 100 words.`;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt
        });
        
        setAiResult(response.text || "No response generated.");
    } catch (error) {
        console.error("AI Error:", error);
        setAiResult("Connection to AI assistant failed. Please try again.");
    } finally {
        setIsAiThinking(false);
    }
  };

  const closeAiDropdown = () => {
    setIsAiDropdownOpen(false);
    setAiResult(null);
  };

  return (
    <div className="sticky top-0 z-30 bg-gp-black/95 backdrop-blur-md border-b border-gp-border h-16 flex items-center px-4 shadow-md transition-colors duration-300">
      
      {/* Mobile/Desktop Menu Toggle */}
      <button 
        onClick={onMenuClick}
        className="mr-4 text-gp-text-muted hover:text-gp-text-main p-1 hover:bg-gp-border rounded transition-colors"
        title="Toggle Menu"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {pageTitle && (
        <div className="mr-4 flex min-w-0 items-center gap-3">
          <span className="h-2 w-2 shrink-0 rounded-full bg-gp-red shadow-[0_0_10px_rgba(255,0,0,0.55)]" />
          <h1 className="truncate font-display text-sm font-black uppercase tracking-wider text-gp-text-main md:text-lg">
            {pageTitle}
          </h1>
        </div>
      )}

      {/* Search Bar Container */}
      <div className={`flex-1 max-w-2xl relative transition-all duration-300 ${isSearchVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95 hidden md:block md:w-0 md:flex-none'}`}>
        {isSearchVisible && (
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gp-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            
            <input
              type="text"
              className="block w-full pl-10 pr-12 py-2 border border-gp-border rounded-md leading-5 bg-gp-panel text-gp-text-main placeholder-gp-text-muted focus:outline-none focus:border-gp-red focus:ring-1 focus:ring-gp-red sm:text-sm transition-all shadow-sm"
              placeholder={placeholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchQuery) {
                    // Optional: Default to normal search, user clicks AI button for AI
                }
              }}
            />

            {/* AI Action Button inside Search Bar - Gives user the OPTION */}
            {searchQuery && (
                <button
                    onClick={handleAiSearch}
                    disabled={isAiThinking}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gp-red hover:text-red-600 transition-colors group/ai"
                    title="Ask AI Assistant about this query"
                >
                    {isAiThinking ? (
                        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        <svg className="w-5 h-5 animate-pulse group-hover/ai:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                    )}
                </button>
            )}

            {/* AI Dropdown Response */}
            {isAiDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-gp-panel border-2 border-gp-red/50 rounded-lg shadow-2xl z-50 overflow-hidden animate-fade-in-up">
                    <div className="bg-gp-red/10 px-3 py-2 flex justify-between items-center border-b border-gp-red/20">
                        <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-gp-red" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                            <span className="text-xs font-bold uppercase text-gp-red tracking-wider">AI Quick Insight</span>
                        </div>
                        <button onClick={closeAiDropdown} className="text-gp-text-muted hover:text-gp-text-main">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    <div className="p-4 max-h-60 overflow-y-auto">
                        {isAiThinking ? (
                            <div className="flex flex-col items-center justify-center py-4 gap-3 text-gp-text-muted">
                                <div className="w-6 h-6 border-2 border-gp-red border-t-transparent rounded-full animate-spin"></div>
                                <span className="text-xs font-bold uppercase tracking-wide animate-pulse">Analyzing Inventory Data...</span>
                            </div>
                        ) : (
                            <div className="prose prose-sm prose-invert max-w-none text-sm text-gp-text-main whitespace-pre-wrap leading-relaxed">
                                {aiResult}
                            </div>
                        )}
                    </div>
                    {!isAiThinking && aiResult && (
                        <div className="px-3 py-1.5 bg-gp-black border-t border-gp-border flex justify-end">
                            <button 
                                onClick={toggleChat} 
                                className="text-[10px] text-blue-500 hover:text-blue-400 font-bold uppercase flex items-center gap-1"
                            >
                                Continue in Chat <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                            </button>
                        </div>
                    )}
                </div>
            )}
          </div>
        )}
      </div>

      {/* Spacer when search is hidden */}
      {!isSearchVisible && <div className="flex-1"></div>}

      {/* Right Actions */}
      <div className="ml-4 flex items-center gap-2 md:gap-3">
        
        {/* Toggle Search Button */}
        <button
          onClick={toggleSearch}
          className={`p-2 rounded-full transition-colors border border-transparent hover:border-gp-border ${!isSearchVisible ? 'text-gp-red bg-gp-panel shadow-sm' : 'text-gp-text-muted hover:text-gp-text-main hover:bg-gp-panel'}`}
          title={isSearchVisible ? 'Hide Search' : 'Show Search'}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>

        {/* AI Chat Button */}
        <button
          onClick={toggleChat}
          className={`hidden md:flex p-2 rounded-full transition-colors border border-transparent hover:border-gp-border ${isChatOpen ? 'text-white bg-gp-red shadow-md' : 'text-gp-text-muted hover:text-gp-text-main hover:bg-gp-panel'}`}
          title="Fitment AI Assistant"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </button>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-full text-gp-text-muted hover:text-gp-text-main hover:bg-gp-panel transition-colors border border-transparent hover:border-gp-border"
          title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {isDarkMode ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        <button
          onClick={toggleAdmin}
          className={`hidden md:flex px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all items-center gap-2 ${
            isAdmin 
              ? 'bg-gp-red text-white border border-gp-red shadow-[0_0_10px_rgba(255,0,0,0.4)]' 
              : 'bg-transparent border border-gray-600 text-gp-text-muted hover:border-gp-text-main hover:text-gp-text-main'
          }`}
        >
          {isAdmin && (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
            </svg>
          )}
          {isAdmin ? 'Admin' : 'Sales'}
        </button>
      </div>
    </div>
  );
};
