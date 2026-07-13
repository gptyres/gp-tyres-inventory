import React, { useState } from 'react';
import { StaffName } from '../types';

const ALLOWED_ADMINS: StaffName[] = ['Noor', 'Mac', 'Rafiek'];

interface AdminLoginResult {
  ok: boolean;
  error?: string;
}
interface AdminAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (staffName: StaffName, password: string) => Promise<AdminLoginResult>;
}

export function AdminAuthModal({ isOpen, onClose, onLogin }: AdminAuthModalProps) {
  const [password, setPassword] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<StaffName | ''>('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg('');

    if (!selectedStaff) {
      setErrorMsg('Select an authorized administrator.');
      return;
    }
    if (!password) {
      setErrorMsg('Enter the admin password.');
      return;
    }

    setSubmitting(true);
    const result = await onLogin(selectedStaff, password);
    setSubmitting(false);

    if (!result.ok) {
      setErrorMsg(result.error || 'Admin authentication failed.');
      return;
    }

    setPassword('');
    setSelectedStaff('');
    setErrorMsg('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-lg border-2 border-gp-red bg-gp-panel p-6 shadow-[0_0_30px_rgba(255,0,0,0.3)]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close admin login"
          className="absolute right-4 top-2 text-2xl text-gp-text-muted hover:text-gp-text-main"
        >
          &times;
        </button>

        <div className="mb-6 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-gp-red">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="font-display text-xl font-bold uppercase tracking-widest text-gp-text-main">
            The Vault
          </h2>
          <p className="mt-1 text-xs text-gp-silver">Restricted Access // Admin Only</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">
              Identity Verification
            </label>
            <select
              value={selectedStaff}
              onChange={(event) => setSelectedStaff(event.target.value as StaffName)}
              disabled={submitting}
              className="w-full appearance-none rounded border border-gp-border bg-gp-black p-3 text-gp-text-main transition-colors focus:border-gp-red focus:outline-none"
            >
              <option value="">-- SELECT ADMIN --</option>
              {ALLOWED_ADMINS.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">
              Security Clearance
            </label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              autoComplete="current-password"
              className={
                'w-full rounded border bg-gp-black p-3 text-center tracking-widest text-gp-text-main transition-colors focus:border-gp-red focus:outline-none '
                + (errorMsg ? 'border-gp-red' : 'border-gp-border')
              }
              placeholder="ENTER ACCESS CODE"
            />
            {errorMsg && (
              <p className="mt-2 text-center text-xs font-bold text-gp-red" role="alert">
                {errorMsg}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 flex items-center justify-center rounded bg-gp-red py-3 text-sm font-bold uppercase tracking-widest text-white transition-all hover:bg-red-700 disabled:cursor-wait disabled:opacity-60"
          >
            {submitting ? 'Verifying...' : 'Authenticate'}
          </button>
        </form>
      </div>
    </div>
  );
}
