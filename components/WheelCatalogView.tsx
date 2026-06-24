
import React, { useState, useEffect } from 'react';

interface WheelCatalogViewProps {
  searchQuery?: string;
}

export const WheelCatalogView: React.FC<WheelCatalogViewProps> = ({ searchQuery }) => {
  const [isLoading, setIsLoading] = useState(true);
  
  // The folder ID from your link
  const FOLDER_ID = "1KshPN5mbkXXx8AQupHtEK6dMUWf4mqi3";
  
  // URL for the embedded view
  const driveEmbedUrl = `https://drive.google.com/embeddedfolderview?id=${FOLDER_ID}#grid`;
  
  // Smart Search URL: Searches ONLY inside this specific folder
  const getDriveSearchUrl = (query: string) => 
    `https://drive.google.com/drive/u/0/search?q=parent:${FOLDER_ID} ${encodeURIComponent(query)}`;

  return (
    <div className="flex flex-col h-full bg-gp-panel text-gp-text-main relative transition-colors duration-300">
      
      {/* Smart Search Bridge - Appears when user types in main navbar */}
      {searchQuery && (
        <div className="bg-gp-panel border-b-2 border-gp-red p-4 shadow-lg animate-fade-in-up z-20 flex flex-col md:flex-row items-center justify-between gap-4 transition-colors duration-300">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-gp-red/10 rounded-full text-gp-red animate-pulse">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                <div>
                    <h3 className="text-lg font-black font-display uppercase text-gp-text-main leading-none">
                        Searching Catalog...
                    </h3>
                    <p className="text-xs text-gp-text-muted mt-1">
                        Query: <span className="font-bold text-gp-text-main">"{searchQuery}"</span>
                    </p>
                </div>
            </div>
            
            <div className="flex items-center gap-3 w-full md:w-auto">
                <span className="hidden md:inline text-[10px] text-gp-text-muted uppercase tracking-wider font-bold">
                    Drive Security Protocol Active
                </span>
                <a 
                    href={getDriveSearchUrl(searchQuery)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-gp-red hover:bg-red-700 text-white px-6 py-3 rounded font-black uppercase text-xs tracking-widest transition-all shadow-lg hover:shadow-xl transform active:scale-95"
                >
                    <span>View Results</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </a>
            </div>
        </div>
      )}

      {/* Toolbar / Info */}
      {!searchQuery && (
          <div className="bg-gp-panel border-b border-gp-border py-2 px-4 flex justify-between items-center transition-colors duration-300">
              <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">
                      Live Cloud Sync &bull; <span className="hidden sm:inline">Double-click folders to browse</span>
                  </span>
              </div>
              <a 
                href={`https://drive.google.com/drive/folders/${FOLDER_ID}`} 
                target="_blank" 
                rel="noreferrer"
                className="text-[10px] font-bold uppercase text-blue-500 hover:text-blue-400 flex items-center gap-1"
              >
                Open in Drive App <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
          </div>
      )}

      {/* Main Content: Iframe with Theme-Aware Background */}
      <div className="flex-1 relative bg-gp-panel w-full h-full overflow-hidden transition-colors duration-300">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-0 bg-gp-panel transition-colors duration-300">
                <div className="flex flex-col items-center gap-4">
                    <div className="relative w-16 h-16">
                        <div className="absolute inset-0 border-4 border-gp-border rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-gp-red border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <span className="text-xs font-bold text-gp-text-muted uppercase tracking-widest animate-pulse">Connecting to Drive...</span>
                </div>
            </div>
          )}
          
          <iframe 
            id="drive-frame"
            src={driveEmbedUrl} 
            className="absolute inset-0 w-full h-full border-none z-10 bg-white" 
            onLoad={() => setIsLoading(false)}
            title="Wheel Catalog"
            sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-top-navigation-by-user-activation"
            allow="autoplay; fullscreen"
          />
      </div>
    </div>
  );
};
