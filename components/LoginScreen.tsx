import React, { useEffect, useState } from 'react';
import { USER_CREDENTIALS } from '../config';

interface LoginScreenProps {
  onLogin: (username: string) => void;
  onAttempt: (username: string, success: boolean) => void;
}

const REMEMBERED_LOGIN_KEY = 'gp-remembered-login';

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onAttempt }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const savedLogin = localStorage.getItem(REMEMBERED_LOGIN_KEY);
      if (!savedLogin) return;

      const parsed = JSON.parse(savedLogin) as { username?: string; password?: string };
      setUsername(parsed.username ?? '');
      setPassword(parsed.password ?? '');
      setRememberMe(Boolean(parsed.username || parsed.password));
    } catch (error) {
      console.warn('[AUTH] Could not load remembered login details', error);
      localStorage.removeItem(REMEMBERED_LOGIN_KEY);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const formattedUser = username.toUpperCase().trim();
    const correctPassword = USER_CREDENTIALS[formattedUser];

    if (correctPassword && correctPassword === password) {
      if (rememberMe) {
        localStorage.setItem(REMEMBERED_LOGIN_KEY, JSON.stringify({
          username: formattedUser,
          password
        }));
      } else {
        localStorage.removeItem(REMEMBERED_LOGIN_KEY);
      }

      console.log(`[AUTH] Login Successful: ${formattedUser} at ${new Date().toISOString()}`);
      onAttempt(formattedUser, true);
      onLogin(formattedUser);
    } else {
      const errorMsg = 'Invalid Terminal ID or Access Code';
      setError(errorMsg);
      console.warn(`[AUTH] Failed Login Attempt: ${formattedUser}`);
      onAttempt(formattedUser, false);
    }
  };

  return (
    <div className="min-h-screen bg-gp-black flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-gp-panel border border-gp-border rounded-xl shadow-2xl overflow-hidden">
        <div className="bg-gp-dark p-6 text-center border-b border-gp-border">
          <p className="text-xs text-gp-text-muted uppercase tracking-widest font-bold">Secure Terminal Access</p>
        </div>

        <form onSubmit={handleLogin} className="p-8 flex flex-col gap-6">
          <div>
            <label className="block text-xs font-bold text-gp-text-muted uppercase mb-2">Terminal ID (e.g. USERPC1)</label>
            <input 
              type="text" 
              autoFocus
              className="w-full bg-gp-input border border-gp-border rounded p-3 text-gp-text-main focus:border-gp-red focus:outline-none transition-colors uppercase"
              placeholder="ENTER USERNAME"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gp-text-muted uppercase mb-2">Access Code</label>
            <input 
              type="password" 
              className="w-full bg-gp-input border border-gp-border rounded p-3 text-gp-text-main focus:border-gp-red focus:outline-none transition-colors"
              placeholder="ENTER PASSWORD"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-3 rounded border border-gp-border bg-gp-input/60 p-3 cursor-pointer select-none hover:border-gp-red/60 transition-colors">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-gp-border bg-gp-black text-gp-red focus:ring-gp-red"
            />
            <span className="text-xs font-bold uppercase tracking-wider text-gp-text-muted">
              Remember me on this terminal
            </span>
          </label>

          {error && (
            <div className="bg-red-900/20 border border-red-500/50 p-3 rounded text-red-500 text-xs font-bold text-center animate-pulse">
              {error}
            </div>
          )}

          <button 
            type="submit"
            className="w-full bg-gp-red hover:bg-red-700 text-white font-bold py-4 rounded uppercase tracking-wider transition-all active:scale-95 shadow-lg"
          >
            Initialize System
          </button>
        </form>
        
        <div className="bg-gp-input p-4 text-center border-t border-gp-border">
          <p className="text-[10px] text-gp-text-muted uppercase">Authorized Personnel Only</p>
        </div>
      </div>
    </div>
  );
};
