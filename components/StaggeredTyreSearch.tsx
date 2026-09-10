import React, { useEffect, useState } from 'react';
import { InventoryItem } from '../types';
import { buildStaggeredTyreQuery, extractStaggeredTyreQuery, matchesMetricTyreSize } from '../staggeredTyreSearch';
import { buildSingleTyreQuery, extractSupplierTyreSizeQuery } from '../supplierInventorySearch';

interface Props { query: string; items: InventoryItem[]; onSearch: (query: string) => void }

export const StaggeredTyreSearch: React.FC<Props> = ({ query, items, onSearch }) => {
  const active = extractStaggeredTyreQuery(query);
  const single = active ? null : extractSupplierTyreSizeQuery(query);
  const [mode, setMode] = useState<'single' | 'pair'>(active ? 'pair' : 'single');
  const [narrow, setNarrow] = useState(active?.narrow.display || single?.displaySize || '');
  const [wide, setWide] = useState(active?.wide.display || '');
  const [terms, setTerms] = useState(active?.remainingQuery || single?.remainingQuery || '');
  const [error, setError] = useState('');
  useEffect(() => {
    const parsed = extractStaggeredTyreQuery(query);
    const parsedSingle = parsed ? null : extractSupplierTyreSizeQuery(query);
    if (parsed || parsedSingle) setMode(parsed ? 'pair' : 'single');
    setNarrow(parsed?.narrow.display || parsedSingle?.displaySize || '');
    setWide(parsed?.wide.display || '');
    setTerms(parsed?.remainingQuery || parsedSingle?.remainingQuery || '');
    setError('');
  }, [query]);
  return (
    <section className="staggered-search" aria-label="Tyre size search">
      <details>
        <summary>Tyre size search <span>Single size or narrow &amp; wide · filter by brand or pattern</span></summary>
        <div className="tyre-search-modes" role="group" aria-label="Tyre search mode">
          <button type="button" aria-pressed={mode === 'single'} onClick={() => { setMode('single'); setError(''); }}>Single size</button>
          <button type="button" aria-pressed={mode === 'pair'} onClick={() => { setMode('pair'); setError(''); }}>Narrow &amp; wide</button>
        </div>
        <form onSubmit={event => {
          event.preventDefault();
          const result = mode === 'pair' ? buildStaggeredTyreQuery(narrow, wide, terms) : buildSingleTyreQuery(narrow, terms);
          setError(result.error || '');
          if (result.query) onSearch(result.query);
        }}>
          <p>{mode === 'pair' ? 'Enter the two tyre sizes to find stock for each side of your set.' : 'Find an exact tyre size, with an optional brand or pattern filter.'}</p>
          <div className={`staggered-fields ${mode === 'single' ? 'tyre-search-single' : ''}`}>
            <label>{mode === 'pair' ? 'Narrow size' : 'Tyre size'}<input value={narrow} onChange={e => setNarrow(e.target.value)} placeholder={mode === 'pair' ? '225/40R18' : '205/55R16'} aria-describedby={error ? 'staggered-error' : undefined} /></label>
            {mode === 'pair' && <label>Wide size<input value={wide} onChange={e => setWide(e.target.value)} placeholder="255/35R18" aria-describedby={error ? 'staggered-error' : undefined} /></label>}
            <label>Brand or pattern <small>(optional)</small><input value={terms} onChange={e => setTerms(e.target.value)} placeholder="e.g. Michelin" /></label>
            <button type="submit" className="workspace-primary">{mode === 'pair' ? 'Search both sizes' : 'Search tyres'}</button>
          </div>
          {error && <p id="staggered-error" role="alert" className="text-gp-red">{error}</p>}
        </form>
      </details>
      {single && <div className="staggered-results" role="status">
        <div><small>Tyre size</small><strong>{single.displaySize}</strong><span>{items.length} {items.length === 1 ? 'option' : 'options'} · {items.filter(item => item.quantity > 0).length} with stock</span></div>
        {single.remainingQuery && <div><small>Brand or pattern filter</small><strong>{single.remainingQuery}</strong><button type="button" onClick={() => onSearch(single.displaySize)}>Show all brands</button></div>}
        <button type="button" onClick={() => onSearch('')}>Clear size search</button>
      </div>}
      {active && <div className="staggered-results" role="status">
        {[{ label: 'Narrow', size: active.narrow }, { label: 'Wide', size: active.wide }].map(({ label, size }) => {
          const matching = items.filter(item => matchesMetricTyreSize(item, size));
          const stocked = matching.filter(item => item.quantity > 0).length;
          return <div key={label}><small>{label}</small><strong>{size.display}</strong><span>{matching.length} {matching.length === 1 ? 'option' : 'options'} · {stocked} with stock</span></div>;
        })}
        <button type="button" onClick={() => { setNarrow(''); setWide(''); setTerms(''); setError(''); onSearch(''); }}>Clear size search</button>
      </div>}
    </section>
  );
};
