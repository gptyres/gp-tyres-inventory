import { TECHNICIANS, WorkshopJob, WorkshopTechnicianBreak } from './workshopTracker';

export type WorkshopReportPeriod = 'DAILY' | 'WEEKLY';
export type WorkshopReportAction = 'DOWNLOAD' | 'PRINT';

interface WorkshopReportOptions {
  action: WorkshopReportAction;
  period: WorkshopReportPeriod;
  reportDate: string;
  jobs: WorkshopJob[];
  breaks: WorkshopTechnicianBreak[];
  logoUrl: string;
}

interface WorkshopReportRange {
  start: string;
  end: string;
  label: string;
}

const dateFromKey = (key: string) => new Date(`${key}T12:00:00`);
const localDateKey = (value: Date) => {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
};
const formatDate = (key: string) => new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(dateFromKey(key));
const formatTime = (value: string | null) => value ? new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }).format(new Date(value)) : 'Not started';
const duration = (start: string | null, end: string | null) => {
  if (!start) return 'Not started';
  const seconds = Math.max(0, Math.floor(((end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()) / 1000));
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}`;
};
const technicianList = (job: WorkshopJob) => job.technicians?.length ? job.technicians : job.technician ? [job.technician] : [];
const breakLabel = (type: WorkshopTechnicianBreak['break_type']) => ({ TEA_1: 'Tea 1', TEA_2: 'Tea 2', LUNCH: 'Lunch', TYRE_COLLECTION: 'Tyre collection', MISC_TASK: 'Misc task', ABSENT: 'Absent' }[type]);

export const getWorkshopReportRange = (period: WorkshopReportPeriod, reportDate: string): WorkshopReportRange => {
  if (period === 'DAILY') return { start: reportDate, end: reportDate, label: formatDate(reportDate) };
  const start = dateFromKey(reportDate);
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const startKey = localDateKey(start);
  const endKey = localDateKey(end);
  return { start: startKey, end: endKey, label: `${formatDate(startKey)} - ${formatDate(endKey)}` };
};

export const getWorkshopReportFileName = (period: WorkshopReportPeriod, range: WorkshopReportRange) => (
  `gp-tyres-workshop-${period.toLowerCase()}-report-${range.start}${period === 'WEEKLY' ? `-to-${range.end}` : ''}.pdf`
);

const toDataUrl = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('The GP Tyres logo could not be loaded for this report.');
  const blob = await response.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
};

export const createWorkshopReport = async ({ period, reportDate, jobs, breaks, logoUrl }: Omit<WorkshopReportOptions, 'action'>) => {
  const [{ jsPDF }, logoData] = await Promise.all([import('jspdf'), toDataUrl(logoUrl)]);
  const range = getWorkshopReportRange(period, reportDate);
  const reportJobs = jobs.filter((job) => job.job_date >= range.start && job.job_date <= range.end)
    .sort((left, right) => left.job_date.localeCompare(right.job_date) || left.created_at.localeCompare(right.created_at));
  const reportBreaks = breaks.filter((entry) => {
    const key = localDateKey(new Date(entry.started_at));
    return key >= range.start && key <= range.end;
  });
  const completed = reportJobs.filter((job) => job.status === 'COLLECTED').length;
  const active = reportJobs.filter((job) => !['COLLECTED', 'CANCELLED'].includes(job.status)).length;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;
  let y = 0;

  const pageHeader = () => {
    doc.setFillColor(17, 17, 17);
    doc.rect(0, 0, pageWidth, 72, 'F');
    doc.addImage(logoData, 'PNG', margin, 13, 106, 42);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(`WORKSHOP ${period === 'DAILY' ? 'DAILY' : 'WEEKLY'} REPORT`, pageWidth - margin, 28, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(220, 220, 220);
    doc.text(range.label, pageWidth - margin, 45, { align: 'right' });
    y = 91;
  };

  const nextPage = () => {
    doc.addPage();
    pageHeader();
  };

  const ensureSpace = (height: number) => {
    if (y + height > pageHeight - 36) nextPage();
  };

  const sectionTitle = (title: string) => {
    ensureSpace(24);
    doc.setFillColor(238, 26, 32);
    doc.roundedRect(margin, y, 5, 15, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text(title.toUpperCase(), margin + 12, y + 11);
    y += 23;
  };

  const summaryCard = (x: number, label: string, value: string, tone: [number, number, number]) => {
    doc.setFillColor(248, 248, 248);
    doc.roundedRect(x, y, 130, 44, 5, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(95, 95, 95);
    doc.text(label.toUpperCase(), x + 10, y + 14);
    doc.setTextColor(...tone);
    doc.setFontSize(18);
    doc.text(value, x + 10, y + 34);
  };

  const table = (headers: string[], widths: number[], rows: string[][]) => {
    const drawHeader = () => {
      ensureSpace(19);
      let x = margin;
      doc.setFillColor(32, 32, 32);
      doc.rect(margin, y, widths.reduce((total, width) => total + width, 0), 18, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      headers.forEach((header, index) => {
        doc.text(header.toUpperCase(), x + 4, y + 12);
        x += widths[index];
      });
      y += 18;
    };
    drawHeader();
    rows.forEach((row, rowIndex) => {
      const lines = row.map((cell, index) => doc.splitTextToSize(cell || '-', widths[index] - 8) as string[]);
      const rowHeight = Math.max(19, ...lines.map((cellLines) => cellLines.length * 8 + 8));
      if (y + rowHeight > pageHeight - 36) {
        nextPage();
        drawHeader();
      }
      let x = margin;
      doc.setFillColor(rowIndex % 2 ? 250 : 244, rowIndex % 2 ? 250 : 244, rowIndex % 2 ? 250 : 244);
      doc.rect(margin, y, widths.reduce((total, width) => total + width, 0), rowHeight, 'F');
      doc.setDrawColor(225, 225, 225);
      doc.rect(margin, y, widths.reduce((total, width) => total + width, 0), rowHeight);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(35, 35, 35);
      lines.forEach((cellLines, index) => {
        doc.text(cellLines, x + 4, y + 10);
        x += widths[index];
      });
      y += rowHeight;
    });
    y += 12;
  };

  pageHeader();
  const cardGap = 14;
  summaryCard(margin, 'Jobs logged', String(reportJobs.length), [238, 26, 32]);
  summaryCard(margin + 130 + cardGap, 'Completed', String(completed), [5, 128, 79]);
  summaryCard(margin + (130 + cardGap) * 2, 'Still active', String(active), [191, 114, 0]);
  summaryCard(margin + (130 + cardGap) * 3, 'Tech activities', String(reportBreaks.length), [39, 92, 154]);
  y += 62;

  sectionTitle('Technician performance and availability');
  const technicianRows = TECHNICIANS.map((technician) => {
    const technicianJobs = reportJobs.filter((job) => technicianList(job).includes(technician));
    const technicianBreaks = reportBreaks.filter((entry) => entry.technician === technician);
    const totalMinutes = technicianJobs.reduce((total, job) => {
      if (!job.started_at) return total;
      const end = job.completed_at ? new Date(job.completed_at).getTime() : Date.now();
      return total + Math.max(0, Math.round((end - new Date(job.started_at).getTime()) / 60_000));
    }, 0);
    const jobTime = `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
    const activities = technicianBreaks.length ? technicianBreaks.map((entry) => entry.break_type === 'ABSENT' ? 'Absent (all day)' : `${breakLabel(entry.break_type)} ${duration(entry.started_at, entry.ended_at)}`).join(' | ') : 'No availability activity logged';
    return [technician, String(technicianJobs.length), String(technicianJobs.filter((job) => job.status === 'COLLECTED').length), jobTime, activities];
  });
  table(['Technician', 'Jobs', 'Done', 'Job time', 'Breaks / tasks'], [150, 55, 55, 90, 390], technicianRows);

  sectionTitle('Job card detail');
  const jobRows = reportJobs.length ? reportJobs.map((job) => [
    formatDate(job.job_date),
    job.ticket_number || job.job_number,
    `${job.customer_name}\n${job.vehicle_details}${job.registration ? ` (${job.registration})` : ''}`,
    `${job.service_type}\n${job.tyre_quantity || 0} tyres${job.wheel_fitment ? ' + wheels' : ''}`,
    technicianList(job).join(', ') || 'Unassigned',
    `${formatTime(job.started_at)}\n${duration(job.started_at, job.completed_at)}`,
    job.status.replace('_', ' '),
    job.paid_by || 'Not recorded'
  ]) : [['-', '-', 'No workshop jobs were recorded for this reporting period.', '-', '-', '-', '-', '-']];
  table(['Date', 'Ticket', 'Customer / vehicle', 'Service', 'Technicians', 'Time in / elapsed', 'Status', 'Paid by'], [58, 60, 185, 95, 120, 105, 70, 70], jobRows);

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(225, 225, 225);
    doc.line(margin, pageHeight - 24, pageWidth - margin, pageHeight - 24);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(95, 95, 95);
    doc.text('GP Tyres & Mags - Workshop Tracker', margin, pageHeight - 12);
    doc.text(`Page ${page} of ${pages}`, pageWidth - margin, pageHeight - 12, { align: 'right' });
  }

  return { doc, fileName: getWorkshopReportFileName(period, range) };
};

export const generateWorkshopReport = async ({ action, period, reportDate, jobs, breaks, logoUrl }: WorkshopReportOptions) => {
  const { doc, fileName } = await createWorkshopReport({ period, reportDate, jobs, breaks, logoUrl });
  if (action === 'DOWNLOAD') {
    doc.save(fileName);
  } else {
    doc.autoPrint();
    const printWindow = window.open(doc.output('bloburl'), '_blank', 'noopener,noreferrer');
    printWindow?.focus();
  }
};
