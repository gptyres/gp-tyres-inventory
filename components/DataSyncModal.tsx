import React, { useRef } from 'react';
import { Order, LoginLog } from '../types';

interface DataSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

export const DataSyncModal: React.FC<DataSyncModalProps> = ({ isOpen, onClose, onExport, onImport }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImport(e.target.files[0]);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-gp-panel border border-gp-border w-full max-w-2xl rounded-lg shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-6 bg-gp-dark border-b border-gp-border flex justify-between items-center">
          <div>
            <h2 className="text-xl font-display font-black text-gp-text-main uppercase tracking-wider">
              Cloud Data Synchronization
            </h2>
            <p className="text-xs text-gp-text-muted mt-1">Sync Sales History & Logs between Terminals</p>
          </div>
          <button onClick={onClose} className="text-gp-text-muted hover:text-gp-text-main">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* EXPORT SECTION */}
          <div className="flex flex-col gap-4 p-4 border border-gp-border rounded-lg bg-gp-input/30">
            <div className="flex items-center gap-2 text-blue-500 mb-2">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <h3 className="font-bold uppercase tracking-wider">Step 1: Export Data</h3>
            </div>
            <p className="text-xs text-gp-text-muted leading-relaxed">
                Download the latest history from this terminal. Save this file to the <strong>Order History</strong> folder in your Google Drive.
            </p>
            
            <button 
                onClick={onExport}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded uppercase text-xs tracking-wider shadow-md transition-colors"
            >
                Download Sync File
            </button>

            <a 
                href="https://drive.google.com/drive/folders/1_xSiYfPgjrZ1e54PEujksOo_WfgHHLm7?usp=sharing"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 text-center text-xs text-blue-400 hover:text-blue-300 underline font-medium"
            >
                Open Order History Drive Folder
            </a>
          </div>

          {/* IMPORT SECTION */}
          <div className="flex flex-col gap-4 p-4 border border-gp-border rounded-lg bg-gp-input/30">
            <div className="flex items-center gap-2 text-green-500 mb-2">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <h3 className="font-bold uppercase tracking-wider">Step 2: Import & Merge</h3>
            </div>
            <p className="text-xs text-gp-text-muted leading-relaxed">
                Select a sync file from another terminal (via Google Drive). This will <strong>merge</strong> histories intelligently.
            </p>
            
            <input 
                type="file" 
                ref={fileInputRef}
                className="hidden"
                accept=".json"
                onChange={handleFileChange}
            />

            <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded uppercase text-xs tracking-wider shadow-md transition-colors"
            >
                Select File to Import
            </button>

            <div className="flex flex-col items-center gap-1 mt-2">
                <a 
                    href="https://drive.google.com/drive/folders/1_xSiYfPgjrZ1e54PEujksOo_WfgHHLm7?usp=sharing"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-center text-xs text-green-400 hover:text-green-300 underline font-medium"
                >
                    Open Order History Drive
                </a>
                <a 
                    href="https://drive.google.com/drive/folders/15EHpXPf6Ek1SK5cHMLb7XmPhb_QTe1uY?usp=sharing"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-center text-xs text-purple-400 hover:text-purple-300 underline font-medium"
                >
                    Open System Logs Drive
                </a>
            </div>
          </div>

        </div>

        <div className="bg-yellow-900/20 p-4 border-t border-yellow-900/30 text-center">
            <p className="text-[10px] text-yellow-500 font-bold uppercase tracking-widest">
                Warning: Ensure all terminals are online before finalizing end-of-day sync.
            </p>
        </div>

      </div>
    </div>
  );
};