import React from 'react';
import { LoginLog } from '../types';

interface SystemLogsViewProps {
  logs: LoginLog[];
}

export const SystemLogsView: React.FC<SystemLogsViewProps> = ({ logs }) => {
  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-gp-text-muted border border-dashed border-gp-border rounded-xl m-4 bg-gp-overlay">
        <svg className="w-20 h-20 mb-4 text-gp-text-muted opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-lg font-display uppercase tracking-widest text-gp-text-muted">System Logs Empty</p>
      </div>
    );
  }

  // Sort logs new to old
  const sortedLogs = [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="max-w-4xl mx-auto px-4 mt-6">
        <div className="mb-4 flex items-center gap-2">
            <div className="p-2 bg-gp-red rounded text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
            </div>
            <div>
                <h2 className="text-lg font-display font-black uppercase text-gp-text-main leading-none">System Access Logs</h2>
                <p className="text-[10px] text-gp-text-muted uppercase tracking-wider">Restricted Admin View</p>
            </div>
        </div>

      <div className="bg-gp-panel border border-gp-border rounded-lg overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse bg-gp-black text-sm">
            <thead>
              <tr className="bg-gp-dark text-gp-text-muted uppercase text-[10px] tracking-wider font-bold">
                <th className="p-4 border-b border-gp-border w-40">Date / Time</th>
                <th className="p-4 border-b border-gp-border w-32">Event Type</th>
                <th className="p-4 border-b border-gp-border">Terminal / User ID</th>
                <th className="p-4 border-b border-gp-border text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gp-border font-mono">
              {sortedLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gp-panel transition-colors">
                  <td className="p-4 text-gp-text-main font-bold text-xs">
                    {new Date(log.timestamp).toLocaleDateString('en-ZA')} <span className="text-gp-text-muted font-normal">{new Date(log.timestamp).toLocaleTimeString('en-GB', { hour12: false })}</span>
                  </td>
                  <td className="p-4">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border ${
                        log.event === 'ADMIN_ACCESS' 
                        ? 'bg-purple-900/30 text-purple-400 border-purple-800' 
                        : 'bg-gp-input text-gp-text-muted border-gp-border'
                    }`}>
                        {log.event ? log.event.replace('_', ' ') : 'SYSTEM LOGIN'}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="text-gp-red px-2 py-1 rounded bg-gp-input border border-gp-border text-xs font-bold uppercase tracking-widest">
                        {log.username || 'UNKNOWN'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    {log.status === 'SUCCESS' ? (
                        <span className="text-[10px] text-green-500 font-bold uppercase tracking-wider flex items-center justify-end gap-1">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                            Authorized
                        </span>
                    ) : (
                        <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider flex items-center justify-end gap-1">
                            <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                            Access Denied
                        </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};