import React from 'react';

export const RADAR_RED_DRIVE_URL = 'https://drive.google.com/drive/folders/1wb3hD39eP31msi4LxtXPgDMz8kY86I9_?usp=sharing';
export const RADAR_RED_EMBED_URL = 'https://drive.google.com/embeddedfolderview?id=1wb3hD39eP31msi4LxtXPgDMz8kY86I9_#grid';

export const RadarRedView: React.FC = () => (
  <section className="flex h-full min-h-[calc(100dvh-4rem)] w-full flex-col bg-gp-black" aria-labelledby="radar-red-title">
    <header className="border-b border-gp-border bg-gp-input px-4 py-4 shadow-sm md:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-gp-red shadow-[0_0_12px_rgba(255,0,0,0.65)]" aria-hidden="true" />
            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-gp-red">Communication Resource Hub</span>
          </div>
          <h1 id="radar-red-title" className="text-2xl font-black uppercase tracking-tight text-gp-text-main">RADAR RED</h1>
          <p className="mt-1 text-xs text-gp-text-muted">Product, protection programme, and claims resources from the shared Google Drive folder.</p>
        </div>

        <a
          href={RADAR_RED_DRIVE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-red-400/60 bg-gp-red px-5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-gp-red/20 transition hover:-translate-y-px hover:bg-red-700 active:translate-y-0"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 3h7m0 0v7m0-7L10 14M5 5h5M5 5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
          </svg>
          Open in Google Drive
        </a>
      </div>
    </header>

    <div className="relative mx-auto flex w-full max-w-7xl flex-1 p-3 md:p-6">
      <div className="relative min-h-[620px] w-full overflow-hidden rounded-xl border border-gp-border bg-white shadow-2xl">
        <iframe
          src={RADAR_RED_EMBED_URL}
          title="RADAR RED Google Drive folder"
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
          allow="fullscreen"
        />
      </div>
    </div>

    <p className="px-4 pb-4 text-center text-[10px] font-bold uppercase tracking-wider text-gp-text-muted md:px-6">
      This live view updates automatically when files are added to the shared folder.
    </p>
  </section>
);
