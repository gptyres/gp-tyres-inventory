
import React, { useState, useEffect } from 'react';
import { AppView, InventoryStats, ProductType } from '../types';
import { StatsDashboard } from './StatsDashboard';
import { STAFF_NAMES } from '../config';
import {
  TERMINAL_STAFF_NAMES,
  TRAINING_PROGRESS_EVENT,
  TrainingProgressSummary,
  getAllStaffTrainingProgress,
  loadTrainingProgressStore
} from '../trainingProgress';

interface DashboardViewProps {
  currentUser: string;
  stats: InventoryStats;
  isAdmin: boolean;
  onNavigate: (view: AppView, filter?: ProductType | 'ALL') => void;
  onPortalSelect: (name: string, url: string, view: AppView) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ 
  currentUser, 
  stats, 
  isAdmin, 
  onNavigate,
  onPortalSelect 
}) => {
  const [greeting, setGreeting] = useState('');
  const [trainingProgress, setTrainingProgress] = useState<TrainingProgressSummary[]>(() =>
    getAllStaffTrainingProgress(STAFF_NAMES, loadTrainingProgressStore())
  );

  useEffect(() => {
    const updateGreeting = () => {
      const hour = new Date().getHours();
      if (hour < 12) setGreeting('Good Morning');
      else if (hour < 18) setGreeting('Good Afternoon');
      else setGreeting('Good Evening');
    };

    updateGreeting();
    // Update every minute to keep greeting accurate if app is left open
    const interval = setInterval(updateGreeting, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const refreshTrainingProgress = () => {
      setTrainingProgress(getAllStaffTrainingProgress(STAFF_NAMES, loadTrainingProgressStore()));
    };

    refreshTrainingProgress();
    window.addEventListener('storage', refreshTrainingProgress);
    window.addEventListener(TRAINING_PROGRESS_EVENT, refreshTrainingProgress);

    return () => {
      window.removeEventListener('storage', refreshTrainingProgress);
      window.removeEventListener(TRAINING_PROGRESS_EVENT, refreshTrainingProgress);
    };
  }, []);

  const displayName = TERMINAL_STAFF_NAMES[currentUser] || currentUser;

  const menuItems = [
    {
      title: 'Training Portal',
      description: 'Open SOP guides and update staff training progress.',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5S19.832 5.477 21 6.253v13C19.832 18.477 18.246 18 16.5 18s-3.332.477-4.5 1.253" />
        </svg>
      ),
      action: () => onNavigate('TRAINING_PORTAL'),
      color: 'text-gp-red',
      bg: 'bg-gp-red/10',
      border: 'border-gp-red/30'
    },
    {
      title: 'Customer Hub',
      description: 'Manage customers, leads, saved quotes and invoices.',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a4 4 0 00-4-4h-1M9 20H4v-2a4 4 0 014-4h1m8-4a4 4 0 10-8 0 4 4 0 008 0zm-8 0a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      action: () => onNavigate('CUSTOMER_HUB'),
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20'
    },
    {
      title: 'Inventory Management',
      description: 'Manage Tyres, Wheels, and Accessories stock levels.',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
      action: () => onNavigate('INVENTORY', 'ALL'),
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20'
    },
    {
      title: 'Sales & Orders',
      description: 'Track recent sales, view history and manage orders.',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
      action: () => onNavigate('ORDERS'),
      color: 'text-green-500',
      bg: 'bg-green-500/10',
      border: 'border-green-500/20'
    },
    {
      title: 'Incoming Stock',
      description: 'Monitor backorders and expected deliveries.',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
      action: () => onNavigate('BACKORDERS'),
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
      border: 'border-orange-500/20'
    },
    {
      title: 'Tools & Utilities',
      description: 'Calculators, Visualizers and Size Comparisons.',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      action: () => onPortalSelect('Tyre Size Comparison', 'https://tiresize.com/comparison/', 'TOOLS_PORTAL'),
      color: 'text-cyan-500',
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/20'
    },
    {
      title: 'Shipping & Payment',
      description: 'Couriers and Payment Gateways.',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
        </svg>
      ),
      action: () => onPortalSelect('The Courier Guy', 'https://portal.thecourierguy.co.za/', 'SHIPPING_PORTAL'),
      color: 'text-pink-500',
      bg: 'bg-pink-500/10',
      border: 'border-pink-500/20'
    }
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 animate-fade-in-up">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-gp-dark to-gp-panel border border-gp-border rounded-2xl p-8 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <svg className="w-64 h-64" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
          </svg>
        </div>
        
        <div className="relative z-10">
          <h1 className="text-3xl md:text-4xl font-display font-black text-gp-text-main mb-2">
            {greeting}, <span className="text-gp-red">{displayName}</span>
          </h1>
          <p className="text-gp-text-muted text-lg max-w-2xl">
            Welcome to the GP Tyres & Mags Inventory System. Here's a quick overview of your current stock performance and system status.
          </p>
        </div>
      </div>

      {/* Stats Section */}
      <div>
        <h2 className="text-sm font-bold text-gp-text-muted uppercase tracking-widest mb-4">System Overview</h2>
        <StatsDashboard stats={stats} visible={isAdmin} />
      </div>

      <div>
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-gp-text-muted uppercase tracking-widest">Staff Training Progress</h2>
            <p className="text-sm text-gp-text-muted mt-1">Checklist progress saved in the Training Portal for each staff member.</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('TRAINING_PORTAL')}
            className="self-start rounded bg-gp-red px-4 py-2 text-xs font-black uppercase tracking-wider text-white transition-colors hover:bg-red-700 md:self-auto"
          >
            Open Training Portal
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          {trainingProgress.map((progress) => {
            const isCurrentStaff = progress.staffName === displayName;

            return (
              <div
                key={progress.staffName}
                className={`rounded-lg border bg-gp-panel p-4 transition-colors ${
                  isCurrentStaff ? 'border-gp-red shadow-[0_0_12px_rgba(255,0,0,0.18)]' : 'border-gp-border'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-gp-text-main">{progress.staffName}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">
                      {progress.completed}/{progress.total} tasks
                    </p>
                  </div>
                  <span className={`rounded px-2 py-1 text-xs font-black ${isCurrentStaff ? 'bg-gp-red text-white' : 'bg-gp-input text-gp-text-muted'}`}>
                    {progress.percentage}%
                  </span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full border border-gp-border bg-gp-input">
                  <div
                    className="h-full rounded-full bg-gp-red transition-all duration-300"
                    style={{ width: `${progress.percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Feature Grid */}
      <div>
        <h2 className="text-sm font-bold text-gp-text-muted uppercase tracking-widest mb-4">Quick Access</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {menuItems.map((item, idx) => (
            <button 
              key={idx}
              onClick={item.action}
              className={`text-left p-6 rounded-xl border transition-all duration-200 hover:-translate-y-1 hover:shadow-xl group bg-gp-panel ${item.border} hover:border-gp-text-main/20`}
            >
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${item.bg} ${item.color}`}>
                {item.icon}
              </div>
              <h3 className="text-xl font-bold text-gp-text-main mb-2 group-hover:text-gp-red transition-colors">{item.title}</h3>
              <p className="text-sm text-gp-text-muted">{item.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
