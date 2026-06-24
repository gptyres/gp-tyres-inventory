import React, { useState } from 'react';
import { CartItem, InvoiceDocument } from '../types';
import gpLogo from '../assets/gp-tyres-logo-transparent.png';

interface InvoiceModalProps {
  isOpen: boolean;
  document: InvoiceDocument | null;
  onClose: () => void;
}

const BUSINESS_DETAILS = {
  legalName: 'MAGNOOR TYRES AND MAGS T/A',
  tradingName: 'GP TYRES AND MAGS',
  addressLines: ['220 Klip Road, Lotus River', 'Cape Town, Western Cape 7941'],
  phone: '+10217055166',
  email: 'gptyres@gmail.com',
  website: 'www.gptyresandmags.co.za',
  businessId: '201730954107',
  bankName: 'STANDARD BANK',
  branchCode: '051001',
  accountNumber: '10109876324',
  vatNumber: '4540308907'
};

const getDiscountedUnit = (item: CartItem) => Math.max(0, item.sellingPrice - item.appliedDiscount);

const formatInvoiceCurrency = (amount: number, withSymbol = false) => {
  const formatted = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${amount < 0 ? '-' : ''}${withSymbol ? 'R' : ''}${formatted}`;
};

const getDocumentNumber = (referenceId: string) => {
  const lastSegment = referenceId.split('-').pop() || referenceId;
  return lastSegment.length > 6 ? lastSegment.slice(-6) : lastSegment;
};

const getSafeFileName = (value: string) => {
  return value.replace(/[^a-z0-9-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
};

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ isOpen, document, onClose }) => {
  const [isDownloading, setIsDownloading] = useState(false);

  if (!isOpen || !document) return null;

  const createdAt = new Date(document.createdAt);
  const validUntil = new Date(createdAt);
  validUntil.setDate(validUntil.getDate() + 7);

  const documentLabel = document.documentType === 'QUOTE' ? 'Quote' : 'Tax Invoice';
  const statusLabel = document.documentType === 'QUOTE' ? 'No stock deducted' : 'Sale processed';
  const dueDate = document.documentType === 'QUOTE' ? validUntil : createdAt;
  const includedTax = document.grandTotal - (document.grandTotal / 1.15);
  const documentNumber = getDocumentNumber(document.referenceId);

  const handleDownloadPdf = async () => {
    const surface = window.document.querySelector('.gp-print-surface') as HTMLElement | null;
    if (!surface || isDownloading) return;

    setIsDownloading(true);
    try {
      await window.document.fonts?.ready;
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf')
      ]);
      const canvas = await html2canvas(surface, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true
      });
      const pdf = new jsPDF('p', 'pt', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgData = canvas.toDataURL('image/png');
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      let remainingHeight = imgHeight;
      let y = 0;

      pdf.addImage(imgData, 'PNG', 0, y, pageWidth, imgHeight);
      remainingHeight -= pageHeight;
      while (remainingHeight > 0) {
        y -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, y, pageWidth, imgHeight);
        remainingHeight -= pageHeight;
      }

      pdf.save(`${getSafeFileName(document.documentType)}-${getSafeFileName(document.referenceId)}.pdf`);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-black/80 p-4 backdrop-blur-sm print:static print:overflow-visible print:bg-white print:p-0">
      <style>
        {`
          @media print {
            @page { size: A4; margin: 12mm; }
            html, body, #root { background: #ffffff !important; color: #000000 !important; }
            body * { visibility: hidden; }
            .gp-print-surface, .gp-print-surface * { visibility: visible; }
            .gp-print-surface {
              position: absolute !important;
              inset: 0 auto auto 0 !important;
              width: 100% !important;
              max-width: none !important;
              border: 0 !important;
              box-shadow: none !important;
            }
          }
        `}
      </style>

      <div className="mx-auto flex min-h-full max-w-5xl items-center justify-center print:block print:min-h-0 print:max-w-none">
        <div className="w-full overflow-hidden rounded-lg border border-gp-border bg-gp-panel shadow-2xl print:overflow-visible print:rounded-none print:border-0 print:bg-white print:shadow-none">
          <div className="flex items-center justify-between border-b border-gp-border bg-gp-dark px-4 py-3 print:hidden">
            <div>
              <h2 className="font-display text-lg font-black uppercase tracking-wider text-gp-text-main">{documentLabel} Ready</h2>
              <p className="text-xs text-gp-text-muted">{document.referenceId}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleDownloadPdf}
                disabled={isDownloading}
                className="rounded-md border border-gp-red bg-gp-panel px-4 py-2 text-xs font-black uppercase tracking-wider text-gp-red transition-colors hover:bg-gp-red hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDownloading ? 'Preparing PDF' : 'Download PDF'}
              </button>
              <button
                onClick={() => window.print()}
                className="rounded-md bg-gp-red px-4 py-2 text-xs font-black uppercase tracking-wider text-white transition-colors hover:bg-red-700"
              >
                Print
              </button>
              <button
                onClick={onClose}
                className="rounded-md border border-gp-border bg-gp-input px-4 py-2 text-xs font-black uppercase tracking-wider text-gp-text-main transition-colors hover:bg-gp-border"
              >
                Close
              </button>
            </div>
          </div>

          <article className="gp-print-surface bg-white p-8 font-sans text-black print:bg-white print:p-0 print:text-black">
            <header className="grid gap-6 md:grid-cols-[1fr_1.15fr_1fr] md:items-start">
              <div className="flex justify-center md:justify-start">
                <img
                  src={gpLogo}
                  alt="GP Tyres & Mags"
                  className="mt-3 h-auto w-60 max-w-full"
                />
              </div>

              <div className="text-[15px] leading-6 text-gray-950">
                <p className="font-bold uppercase">{BUSINESS_DETAILS.legalName}</p>
                <p className="font-bold uppercase">{BUSINESS_DETAILS.tradingName}</p>
                {BUSINESS_DETAILS.addressLines.map(line => (
                  <p key={line}>{line}</p>
                ))}
                <p>{BUSINESS_DETAILS.phone}</p>
                <p>{BUSINESS_DETAILS.email}</p>
                <p>{BUSINESS_DETAILS.website}</p>
                <p>Business ID No. {BUSINESS_DETAILS.businessId}</p>
              </div>

              <div className="text-left md:text-right">
                <p className="text-3xl font-bold text-gp-red">
                  {documentLabel} <span className="ml-2">{documentNumber}</span>
                </p>
                <p className="mt-2 text-xs font-bold uppercase tracking-wider text-gray-500">{statusLabel}</p>
              </div>
            </header>

            <section className="mt-8 border-t-4 border-gp-red pt-2">
              <div className="grid gap-6 md:grid-cols-[1fr_0.95fr]">
                <div className="text-[15px] leading-6">
                  <p className="text-xs font-bold uppercase text-gray-950">Bill To</p>
                  <p>{document.customer.fullName}</p>
                  <p>{document.customer.contactDetail}</p>
                  {document.customer.vehicleDetails && <p>{document.customer.vehicleDetails}</p>}
                  <p>Terminal: {document.terminalId}</p>
                  {document.staffName && <p>Staff: {document.staffName}</p>}
                </div>

                <div className="grid grid-cols-3 overflow-hidden border-b border-gp-red text-center text-gp-red">
                  <div className="bg-red-100 px-3 py-8">
                    <p className="text-sm font-medium uppercase">Date</p>
                    <p className="mt-2 text-sm">{createdAt.toLocaleDateString('en-ZA')}</p>
                  </div>
                  <div className="bg-gp-red px-3 py-8 text-white">
                    <p className="text-sm font-medium uppercase">Please Pay</p>
                    <p className="mt-2 text-sm font-bold">{formatInvoiceCurrency(document.grandTotal, true)}</p>
                  </div>
                  <div className="bg-red-100 px-3 py-8">
                    <p className="text-sm font-medium uppercase">{document.documentType === 'QUOTE' ? 'Valid Until' : 'Due Date'}</p>
                    <p className="mt-2 text-sm">{dueDate.toLocaleDateString('en-ZA')}</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-20">
              <table className="w-full border-collapse text-left text-[15px]">
                <thead>
                  <tr className="border-y border-gray-300 text-xs font-bold uppercase text-gray-950">
                    <th className="w-[15%] py-3 pr-3">Date</th>
                    <th className="w-[20%] px-3 py-3">Activity</th>
                    <th className="px-3 py-3">Description</th>
                    <th className="w-[8%] px-3 py-3 text-center">Qty</th>
                    <th className="w-[12%] px-3 py-3 text-right">Rate</th>
                    <th className="w-[14%] py-3 pl-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {document.items.map(item => (
                    <tr key={item.id} className="border-b border-gray-300 align-top">
                      <td className="py-3 pr-3">{createdAt.toLocaleDateString('en-ZA')}</td>
                      <td className="px-3 py-3 font-bold text-gray-950">{item.activityCode}</td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-gray-950">{item.title}</p>
                        {item.description && <p className="mt-1 text-xs text-gray-600">{item.description}</p>}
                      </td>
                      <td className="px-3 py-3 text-center">{item.cartQuantity}</td>
                      <td className="px-3 py-3 text-right">{formatInvoiceCurrency(getDiscountedUnit(item))}</td>
                      <td className="py-3 pl-3 text-right">{formatInvoiceCurrency(getDiscountedUnit(item) * item.cartQuantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="mt-3 grid gap-8 md:grid-cols-[1fr_0.95fr]">
              <div className="text-[15px] leading-7">
                <p className="uppercase">Banking Details</p>
                <p>NAME: MAGNOOR TYRES AND MAGS PTY LTD</p>
                <p>BANK: {BUSINESS_DETAILS.bankName}</p>
                <p>BRANCH: {BUSINESS_DETAILS.branchCode}</p>
                <p>ACCOUNT NUMBER: {BUSINESS_DETAILS.accountNumber}</p>
                <p>VAT NO: {BUSINESS_DETAILS.vatNumber}</p>
              </div>

              <div className="text-[15px]">
                <div className="grid grid-cols-[1fr_120px] gap-4 py-1">
                  <span className="font-medium uppercase text-gp-red">Includes Tax</span>
                  <span className="text-right">{formatInvoiceCurrency(includedTax)}</span>
                </div>
                {document.totalDiscount > 0 && (
                  <div className="grid grid-cols-[1fr_120px] gap-4 py-1">
                    <span className="font-medium uppercase text-gp-red">Discount</span>
                    <span className="text-right">{formatInvoiceCurrency(document.totalDiscount)}</span>
                  </div>
                )}
                <div className="grid grid-cols-[1fr_120px] gap-4 py-1">
                  <span className="font-medium uppercase text-gp-red">Total</span>
                  <span className="text-right">{formatInvoiceCurrency(document.grandTotal)}</span>
                </div>
                <div className="mt-8 border-y border-gp-red py-3">
                  <div className="grid grid-cols-[1fr_160px] items-end gap-4">
                    <span className="font-medium uppercase text-gp-red">Total Due</span>
                    <span className="text-right text-3xl text-gp-red">{formatInvoiceCurrency(document.grandTotal, true)}</span>
                  </div>
                </div>
                <p className="mt-4 text-right text-sm uppercase text-gp-red">Thank you.</p>
              </div>
            </section>

            <footer className="mt-10 text-xs leading-5 text-gray-600">
              {document.documentType === 'QUOTE' ? (
                <p>This quote is issued for pricing only. Stock quantities remain unchanged until a sale is processed.</p>
              ) : (
                <p>This invoice confirms the sale was processed by GP Tyres & Mags.</p>
              )}
            </footer>
          </article>
        </div>
      </div>
    </div>
  );
};
