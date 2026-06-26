
import React, { useState } from 'react';
import { StaffName } from '../types';

const ALLOWED_ADMINS: StaffName[] = ['Noor', 'Mac', 'Rafiek'];

interface AdminAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (staffName: StaffName) => void;
}

export const AdminAuthModal: React.FC<AdminAuthModalProps> = ({ isOpen, onClose, onLogin }) => {
  const [password, setPassword] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<StaffName | ''>('');
  const [error, setError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);
    setErrorMsg('');

    if (!selectedStaff) {
      setError(true);
      setErrorMsg('IDENTIFICATION REQUIRED');
      return;
    }

    if (password === '786') {
      onLogin(selectedStaff);
      setPassword('');
      setSelectedStaff('');
      setError(false);
      onClose();
    } else {
      setError(true);
      setErrorMsg('ACCESS DENIED: INVALID PASSCODE');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
      <div className="bg-gp-panel border-2 border-gp-red w-full max-w-sm rounded-lg shadow-[0_0_30px_rgba(255,0,0,0.3)] p-6 relative">
        <button 
          onClick={onClose}
          className="absolute top-2 right-4 text-gp-text-muted hover:text-gp-text-main text-2xl"
        >
          &times;
        </button>
        
        <div className="text-center mb-6">
          <div className="mx-auto w-12 h-12 bg-gp-red rounded-full flex items-center justify-center mb-2">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-display font-bold text-gp-text-main uppercase tracking-widest">
            The Vault
          </h2>
          <p className="text-xs text-gp-silver mt-1">Restricted Access // Admin Only</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          
          {/* Identity Selection */}
          <div>
            <label className="block text-[10px] font-bold text-gp-text-muted uppercase mb-1 tracking-wider">
              Identity Verification
            </label>
            <select 
              value={selectedStaff}
              onChange={(e) => setSelectedStaff(e.target.value as StaffName)}
              className="w-full bg-gp-black border border-gp-border rounded p-3 text-gp-text-main focus:border-gp-red focus:outline-none appearance-none transition-colors"
            >
              <option value="">-- SELECT ADMIN --</option>
              {ALLOWED_ADMINS.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* Password Input */}
          <div>
            <label className="block text-[10px] font-bold text-gp-text-muted uppercase mb-1 tracking-wider">
              Security Clearance
            </label>
            <input 
              type="password" 
              className={`w-full bg-gp-black border ${error ? 'border-red-500 animate-pulse' : 'border-gp-border'} rounded p-3 text-gp-text-main text-center tracking-widest focus:outline-none focus:border-gp-red transition-colors`}
              placeholder="ENTER PASSCODE"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {error && <p className="text-red-500 text-xs text-center mt-2 font-bold uppercase">{errorMsg}</p>}
          </div>

          <button 
            type="submit" 
            className="mt-2 w-full bg-gp-red text-white font-bold py-3 rounded uppercase tracking-wider hover:bg-red-700 transition-colors shadow-lg active:scale-95 transform"
          >
            Authenticate
          </button>
        </form>
      </div>
    </div>
  );
};
