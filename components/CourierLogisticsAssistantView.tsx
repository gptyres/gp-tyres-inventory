import React, { useEffect, useMemo, useState } from 'react';
import {
  CourierItemType,
  createCourierEstimate,
  formatCourierPortalText,
  parseCourierSpecs,
  parseTyreSize,
  parseWheelSize
} from '../courierLogisticsAssistant';

const inputClassName = 'w-full rounded-lg border border-gp-border bg-gp-black px-3 py-3 text-sm text-gp-text-main placeholder-gp-text-muted outline-none transition-colors focus:border-gp-red focus:ring-1 focus:ring-gp-red';
const panelClassName = 'rounded-lg border border-gp-border bg-gp-panel shadow-sm';

interface SavedEstimate {
  id: string;
  label: string;
  output: string;
  createdAt: string;
}

const HISTORY_KEY = 'gp-courier-logistics-history-v1';

const loadHistory = (): SavedEstimate[] => {
  try {
    const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(stored) ? stored.slice(0, 6) : [];
  } catch {
    return [];
  }
};

const copyText = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
};

export const CourierLogisticsAssistantView: React.FC = () => {
  const [itemType, setItemType] = useState<CourierItemType>('WHEEL_AND_TYRE');
  const [customerMessage, setCustomerMessage] = useState('');
  const [wheelSize, setWheelSize] = useState('19 x 9.5J');
  const [tyreSize, setTyreSize] = useState('225/40R19');
  const [quantity, setQuantity] = useState(4);
  const [actualWeight, setActualWeight] = useState('');
  const [address, setAddress] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [history, setHistory] = useState<SavedEstimate[]>(loadHistory);

  const wheel = useMemo(() => parseWheelSize(wheelSize), [wheelSize]);
  const tyre = useMemo(() => parseTyreSize(tyreSize), [tyreSize]);
  const requiresWheel = itemType !== 'TYRE_ONLY';
  const requiresTyre = itemType !== 'WHEEL_ONLY';
  const estimate = useMemo(() => createCourierEstimate({
    itemType,
    quantity,
    wheelSize: wheel,
    tyreSize: tyre,
    actualWeightKgOverride: actualWeight ? Number(actualWeight) : null
  }), [actualWeight, itemType, quantity, tyre, wheel]);
  const portalText = useMemo(() => estimate ? formatCourierPortalText(estimate, quantity, address) : '', [address, estimate, quantity]);

  useEffect(() => {
    if (copyStatus) {
      const timer = window.setTimeout(() => setCopyStatus(''), 2400);
      return () => window.clearTimeout(timer);
    }
  }, [copyStatus]);

  const applyCustomerMessage = () => {
    const parsed = parseCourierSpecs(customerMessage);
    if (parsed.wheelSize) setWheelSize(`${parsed.wheelSize.diameterInches} x ${parsed.wheelSize.widthInches}J`);
    if (parsed.tyreSize) setTyreSize(parsed.tyreSize.display);
    if (parsed.hasTyres) setItemType(parsed.wheelSize ? 'WHEEL_AND_TYRE' : 'TYRE_ONLY');
    else if (parsed.wheelSize) setItemType('WHEEL_ONLY');
    setCopyStatus(parsed.wheelSize || parsed.tyreSize ? 'Size read from customer message.' : 'Add a wheel size such as 19 x 9.5J or tyre size such as 225/40R19.');
  };

  const handleCopy = async () => {
    if (!portalText) return;
    try {
      await copyText(portalText);
      setCopyStatus('Courier details copied.');
    } catch {
      setCopyStatus('Copy failed. Select the text below and copy it manually.');
    }
  };

  const saveEstimate = () => {
    if (!portalText || !estimate) return;
    const record: SavedEstimate = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: `${quantity} x ${itemType === 'WHEEL_ONLY' ? wheelSize : tyreSize}`,
      output: portalText,
      createdAt: new Date().toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
    };
    const nextHistory = [record, ...history].slice(0, 6);
    setHistory(nextHistory);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
    setCopyStatus('Saved to recent estimates.');
  };

  const invalidMessage = (requiresWheel && !wheel) || (requiresTyre && !tyre);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4 md:px-5 md:py-6">
      <header className="flex flex-col gap-3 border-b border-gp-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-gp-red shadow-[0_0_12px_rgba(255,0,0,0.8)]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gp-text-muted">COURIER_LOGISTICS_ASSISTANT</span>
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-gp-text-main md:text-3xl">Courier Logistics Assistant</h1>
          <p className="mt-1 max-w-3xl text-sm text-gp-text-muted">Turn wheel and tyre sizes into courier-ready parcel dimensions, weight and a copyable portal declaration.</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" /></svg>
          Verify packed measurements before booking.
        </div>
      </header>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className={`${panelClassName} min-w-0 p-4`} aria-labelledby="courier-input-heading">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="courier-input-heading" className="text-sm font-black uppercase tracking-wider text-gp-text-main">Parcel input</h2>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-gp-border bg-gp-black p-1 text-center">
              {([
                ['WHEEL_ONLY', 'Rims only'],
                ['WHEEL_AND_TYRE', 'Rims + tyres'],
                ['TYRE_ONLY', 'Tyres only']
              ] as Array<[CourierItemType, string]>).map(([type, label]) => (
                <button key={type} type="button" onClick={() => setItemType(type)} className={`min-h-10 rounded px-2 text-[10px] font-bold uppercase transition-colors ${itemType === type ? 'bg-gp-red text-white' : 'text-gp-text-muted hover:bg-gp-border hover:text-gp-text-main'}`}>{label}</button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-gp-text-muted">Paste customer message <span className="normal-case font-medium">(optional)</span></span>
            <div className="flex gap-2">
              <input className={inputClassName} value={customerMessage} onChange={(event) => setCustomerMessage(event.target.value)} placeholder="e.g. Set of 4 19 x 9.5J with 225/40/19 tyres" />
              <button type="button" onClick={applyCustomerMessage} className="shrink-0 rounded-lg bg-gp-red px-4 text-xs font-black uppercase tracking-wider text-white transition hover:bg-red-700 active:scale-95">Read size</button>
            </div>
          </label>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {requiresWheel && <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wider text-gp-text-muted">Wheel size</span><input className={inputClassName} value={wheelSize} onChange={(event) => setWheelSize(event.target.value)} placeholder="19 x 9.5J" />{wheelSize && <span className={`mt-1 block text-[11px] ${wheel ? 'text-green-400' : 'text-gp-red'}`}>{wheel ? `${wheel.diameterInches}-inch × ${wheel.widthInches}J wheel read` : 'Use a size such as 19 x 9.5J'}</span>}</label>}
            {requiresTyre && <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wider text-gp-text-muted">Tyre size</span><input className={inputClassName} value={tyreSize} onChange={(event) => setTyreSize(event.target.value)} placeholder="225/40R19 or 35/12.5R20" />{tyreSize && <span className={`mt-1 block text-[11px] ${tyre ? 'text-green-400' : 'text-gp-red'}`}>{tyre ? `${tyre.display} · ${tyre.overallDiameterCm.toFixed(1)} cm outside diameter` : 'Use a size such as 225/40R19'}</span>}</label>}
            <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wider text-gp-text-muted">Pieces / parcels</span><input type="number" min={1} inputMode="numeric" className={inputClassName} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} /></label>
            <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wider text-gp-text-muted">Measured weight per parcel <span className="normal-case font-medium">(optional kg)</span></span><input type="number" min={0.1} step={0.1} inputMode="decimal" className={inputClassName} value={actualWeight} onChange={(event) => setActualWeight(event.target.value)} placeholder="Use scale weight when available" /></label>
          </div>

          <label className="mt-4 block"><span className="mb-1 block text-xs font-bold uppercase tracking-wider text-gp-text-muted">Delivery address <span className="normal-case font-medium">(optional, included in copy text)</span></span><textarea className={`${inputClassName} min-h-24 resize-y`} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Unit 42 Mega Park, Bellville South, Cape Town, 7530" /></label>
        </section>

        <section className={`${panelClassName} min-w-0 overflow-hidden`} aria-labelledby="courier-output-heading">
          <div className="flex items-center justify-between border-b border-gp-border bg-gp-input px-4 py-3">
            <h2 id="courier-output-heading" className="text-sm font-black uppercase tracking-wider text-gp-text-main">Courier declaration</h2>
            <span className={`rounded px-2 py-1 text-[10px] font-black uppercase tracking-wider ${estimate ? 'bg-green-900/40 text-green-400' : 'bg-gp-red/10 text-gp-red'}`}>{estimate ? 'Ready' : 'Needs size'}</span>
          </div>
          {estimate ? <div className="p-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-gp-red/40 bg-gp-red/10 p-3"><div className="text-xl font-black text-gp-text-main">{estimate.dimensionsCm.length} × {estimate.dimensionsCm.width} × {estimate.dimensionsCm.height}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">cm per parcel</div></div>
              <div className="rounded-lg border border-gp-border bg-gp-black p-3"><div className="text-xl font-black text-gp-text-main">{estimate.estimatedActualWeightKg} kg</div><div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">actual estimate</div></div>
              <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 p-3"><div className="text-xl font-black text-amber-200">{estimate.chargeableWeightKg} kg</div><div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">chargeable</div></div>
            </div>
            <div className="mt-4 rounded-lg border border-gp-border bg-gp-black p-3 text-xs text-gp-text-muted"><div className="flex justify-between gap-3"><span>Volumetric weight</span><strong className="text-gp-text-main">{estimate.volumetricWeightKg} kg per parcel</strong></div><div className="mt-2 flex justify-between gap-3"><span>Total chargeable</span><strong className="text-gp-text-main">{estimate.totalChargeableWeightKg} kg across {quantity} pieces</strong></div></div>
            <p className="mt-3 text-xs leading-relaxed text-amber-200/90">{estimate.calculationNote}</p>
            <textarea aria-label="Courier portal details" readOnly value={portalText} className="mt-4 min-h-48 w-full resize-y rounded-lg border border-gp-border bg-gp-black p-3 font-mono text-xs leading-relaxed text-gp-text-main outline-none" />
            <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={handleCopy} className="rounded-lg bg-gp-red px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-red-700 active:scale-95">Copy for courier portal</button><button type="button" onClick={saveEstimate} className="rounded-lg border border-gp-border bg-gp-input px-4 py-3 text-xs font-black uppercase tracking-wider text-gp-text-main transition hover:bg-gp-border active:scale-95">Save estimate</button>{copyStatus && <span className="self-center text-xs font-bold text-green-400">{copyStatus}</span>}</div>
          </div> : <div className="flex min-h-80 flex-col items-center justify-center p-6 text-center"><svg className="mb-3 h-10 w-10 text-gp-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2a4 4 0 014-4h4m0 0l-3-3m3 3l-3 3M5 19a2 2 0 01-2-2V5a2 2 0 012-2h10a2 2 0 012 2v2" /></svg><p className="text-sm font-bold text-gp-text-main">Add a valid {requiresTyre ? 'tyre' : 'wheel'} size to calculate the parcel.</p><p className="mt-1 text-xs text-gp-text-muted">The assistant accepts 225/40R19, 35/12.5R20 and 19 x 9.5J formats.</p></div>}
        </section>
      </div>

      {history.length > 0 && <section className={`${panelClassName} p-4`}><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-black uppercase tracking-wider text-gp-text-main">Recent estimates</h2><button type="button" onClick={() => { setHistory([]); localStorage.removeItem(HISTORY_KEY); }} className="text-xs font-bold text-gp-text-muted hover:text-gp-red">Clear</button></div><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{history.map((record) => <button key={record.id} type="button" onClick={() => void copyText(record.output).then(() => setCopyStatus('Saved declaration copied.'))} className="rounded-lg border border-gp-border bg-gp-black p-3 text-left transition hover:border-gp-red/60"><div className="truncate text-xs font-black uppercase text-gp-text-main">{record.label}</div><div className="mt-1 text-[11px] text-gp-text-muted">{record.createdAt} · Click to copy</div></button>)}</div></section>}
    </div>
  );
};
