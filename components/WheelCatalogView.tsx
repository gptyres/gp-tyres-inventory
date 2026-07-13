import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchLatestWheelCatalogSyncRun,
  fetchWheelCatalogItems,
  finalizeLocalWheelCatalogSync,
  importLocalWheelCatalogImage,
  LocalWheelCatalogImportPayload,
  replaceWheelCatalogFolder,
  startLocalWheelCatalogSync,
  syncGoogleDriveWheelCatalog,
  WHEEL_CATALOG_DRIVE_FOLDER_URL,
  WHEEL_CATALOG_SOURCE_LABEL,
  WHEEL_CATALOG_SOURCE_ROOT_ID,
  WHEEL_CATALOG_STAFF_UPLOAD_SOURCE_LABEL,
  WHEEL_CATALOG_STAFF_UPLOAD_SOURCE_ROOT_ID
} from '../wheelCatalogSync';
import { WheelCatalogItemRow, WheelCatalogSyncRunRow } from '../supabaseClient';
import { SOUTH_AFRICA_VEHICLE_PCD_MODELS } from '../vehiclePcdData';
import { itemMatchesWheelSearch, wheelMatchesVehiclePcd } from '../wheelCatalogSearch';

interface WheelCatalogViewProps {
  searchQuery?: string;
  isAdmin?: boolean;
}

type ClipboardWindow = typeof window & {
  ClipboardItem?: typeof ClipboardItem;
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandleLike>;
};

interface FileSystemDirectoryHandleLike {
  kind: 'directory';
  name: string;
  values: () => AsyncIterable<FileSystemHandleLike>;
}

type FileSystemHandleLike = FileSystemDirectoryHandleLike | {
  kind: 'file';
  name: string;
  getFile: () => Promise<File>;
};

interface LocalCatalogFile {
  file: File;
  relativePath: string;
}

interface SyncProgress {
  scanned: number;
  uploaded: number;
  skipped: number;
  failed: number;
  deactivated: number;
  total: number;
}

type AnalysisFilter = 'ALL' | 'ANALYZED' | 'REVIEW';
type CatalogFilterKey = 'SEARCH' | 'ANALYSIS' | 'SIZE' | 'PCD' | 'FOLDER' | 'VEHICLE';

const buttonBase = 'min-h-11 rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider transition-all disabled:cursor-not-allowed disabled:opacity-50';
const chipBase = 'min-h-9 rounded-lg border px-3 py-2 text-xs font-bold uppercase transition-colors';
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
const CATEGORY_FOLDER_PATTERN = /^(1[3-9]|2[0-6])\s+[456]X\d{3}(?:\.\d)?$/i;
const SYNC_CONCURRENCY = 4;
const WHEEL_CATALOG_REPLACE_FOLDER_PIN = '786';
const QUICK_WHEEL_SEARCHES = [
  { label: 'Model code', value: 'model' },
  { label: 'Black', value: 'black' },
  { label: 'Machined face', value: 'machined face' },
  { label: 'Offset ET', value: 'ET' },
  { label: 'Centre bore', value: 'CB' }
];

const normalizeText = (value: string) => value.trim().toLowerCase();
const normalizePath = (value: string) => value.replaceAll('\\', '/').split('/').map((part) => part.replace(/\s+/g, ' ').trim()).filter(Boolean).join('/');
const isIgnoredFolder = (value: string) => value.trim().startsWith('_');
const isUpdatedFolder = (value: string) => /^UPDATED(?:\b|\s|\()/i.test(value.trim());
const extensionFor = (fileName: string) => fileName.split('.').pop()?.toLowerCase() ?? '';

const sortSizes = (values: string[]) => {
  return [...values].sort((first, second) => (Number(first) || 0) - (Number(second) || 0));
};

const sortPcds = (values: string[]) => {
  return [...values].sort((first, second) => first.localeCompare(second, undefined, { numeric: true }));
};

const formatSyncTime = (value?: string | null) => {
  if (!value) return 'Not synced yet';
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
};

const copyTextToClipboard = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
};

const copyBlobToClipboard = async (blob: Blob) => {
  const ClipboardItemCtor = (window as ClipboardWindow).ClipboardItem;
  if (!navigator.clipboard?.write || !ClipboardItemCtor) {
    throw new Error('Image clipboard is not available in this browser.');
  }

  await navigator.clipboard.write([
    new ClipboardItemCtor({
      [blob.type || 'image/png']: blob
    })
  ]);
};

const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`Could not load ${url}`));
  image.src = url;
});

const canvasToBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new Error('Could not prepare image for clipboard.'));
  }, 'image/png');
});

const makeContactSheetBlob = async (items: WheelCatalogItemRow[]) => {
  const maxItems = items.slice(0, 12);
  const images = await Promise.all(maxItems.map((item) => loadImage(item.public_image_url)));
  const tileWidth = 360;
  const tileHeight = 420;
  const gap = 18;
  const columns = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(images.length))));
  const rows = Math.ceil(images.length / columns);
  const width = columns * tileWidth + (columns + 1) * gap;
  const height = rows * tileHeight + (rows + 1) * gap;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare contact sheet.');

  context.fillStyle = '#111827';
  context.fillRect(0, 0, width, height);
  context.font = '700 18px Arial';
  context.textBaseline = 'top';

  images.forEach((image, index) => {
    const item = maxItems[index];
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = gap + col * (tileWidth + gap);
    const y = gap + row * (tileHeight + gap);
    const imageHeight = tileHeight - 72;
    const ratio = Math.min(tileWidth / image.naturalWidth, imageHeight / image.naturalHeight);
    const drawWidth = image.naturalWidth * ratio;
    const drawHeight = image.naturalHeight * ratio;
    const drawX = x + (tileWidth - drawWidth) / 2;
    const drawY = y + (imageHeight - drawHeight) / 2;

    context.fillStyle = '#ffffff';
    context.fillRect(x, y, tileWidth, tileHeight);
    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    context.fillStyle = '#111827';
    context.fillText(`${item.rim_size ?? '-'} inch ${item.pcd ?? ''}`.trim(), x + 14, y + imageHeight + 12);
    context.font = '500 14px Arial';
    context.fillStyle = '#4b5563';
    context.fillText(item.folder_path || item.file_name, x + 14, y + imageHeight + 38, tileWidth - 28);
    context.font = '700 18px Arial';
  });

  return canvasToBlob(canvas);
};

const makeSingleImageBlob = async (item: WheelCatalogItemRow) => {
  const image = await loadImage(item.public_image_url);
  const maxSide = 1600;
  const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare image.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas);
};

const formatWheelSpecs = (item: WheelCatalogItemRow) => [
  item.brand ?? '',
  item.model ? `Model ${item.model}` : '',
  item.wheel_size || (item.rim_size ? `${item.rim_size} inch` : 'Wheel'),
  item.pcd ?? '',
  ...(item.pcd_aliases ?? []),
  item.finish ?? '',
  item.wheel_offset ? `ET${item.wheel_offset}` : '',
  item.center_bore ? `CB${item.center_bore}` : '',
  item.load_rating ? `${item.load_rating}kg` : ''
].filter(Boolean).join(', ');

const buildFallbackText = (items: WheelCatalogItemRow[]) => {
  return items.map((item) => [
    formatWheelSpecs(item),
    item.folder_path,
    item.public_image_url
  ].filter(Boolean).join('\n')).join('\n\n');
};

const normalizePcdForMatch = (value: string) => (
  value.toUpperCase().replace(/\//g, 'X').replace(/\s+/g, '')
);

const normalizeStaffUploadPcd = (value: string) => normalizePcdForMatch(value).replace(/^([456])(\d{3})/, '$1X$2');
const STAFF_UPLOAD_RIM_SIZES = Array.from({ length: 14 }, (_, index) => String(index + 13));

const sanitizeName = (value: string) => value.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim() || 'wheel';

const makeZipPath = (item: WheelCatalogItemRow, index: number) => {
  const folder = sanitizeName(item.folder_path || 'Unsorted');
  const prefix = sanitizeName([item.rim_size ? `${item.rim_size}IN` : '', item.pcd ?? ''].filter(Boolean).join(' '));
  const fileName = sanitizeName(item.file_name || `wheel-${index + 1}.jpg`);
  return `${folder}/${prefix ? `${prefix} - ` : ''}${fileName}`;
};

let crcTable: number[] | null = null;

const getCrcTable = () => {
  if (crcTable) return crcTable;
  crcTable = Array.from({ length: 256 }, (_, tableIndex) => {
    let value = tableIndex;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });
  return crcTable;
};

const crc32 = (bytes: Uint8Array) => {
  const table = getCrcTable();
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = table[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
};

const writeUInt16 = (target: number[], value: number) => {
  target.push(value & 0xff, (value >>> 8) & 0xff);
};

const writeUInt32 = (target: number[], value: number) => {
  target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
};

const getDosDateTime = () => {
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  return { date, time };
};

const makeZipBlob = async (items: WheelCatalogItemRow[]) => {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  const { date, time } = getDosDateTime();
  let offset = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const response = await fetch(item.public_image_url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not download ${item.file_name}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const nameBytes = encoder.encode(makeZipPath(item, index));
    const checksum = crc32(bytes);
    const localHeader: number[] = [];

    writeUInt32(localHeader, 0x04034b50);
    writeUInt16(localHeader, 20);
    writeUInt16(localHeader, 0);
    writeUInt16(localHeader, 0);
    writeUInt16(localHeader, time);
    writeUInt16(localHeader, date);
    writeUInt32(localHeader, checksum);
    writeUInt32(localHeader, bytes.length);
    writeUInt32(localHeader, bytes.length);
    writeUInt16(localHeader, nameBytes.length);
    writeUInt16(localHeader, 0);
    chunks.push(new Uint8Array(localHeader), nameBytes, bytes);

    const centralHeader: number[] = [];
    writeUInt32(centralHeader, 0x02014b50);
    writeUInt16(centralHeader, 20);
    writeUInt16(centralHeader, 20);
    writeUInt16(centralHeader, 0);
    writeUInt16(centralHeader, 0);
    writeUInt16(centralHeader, time);
    writeUInt16(centralHeader, date);
    writeUInt32(centralHeader, checksum);
    writeUInt32(centralHeader, bytes.length);
    writeUInt32(centralHeader, bytes.length);
    writeUInt16(centralHeader, nameBytes.length);
    writeUInt16(centralHeader, 0);
    writeUInt16(centralHeader, 0);
    writeUInt16(centralHeader, 0);
    writeUInt16(centralHeader, 0);
    writeUInt32(centralHeader, 0);
    writeUInt32(centralHeader, offset);
    centralDirectory.push(new Uint8Array(centralHeader), nameBytes);

    offset += localHeader.length + nameBytes.length + bytes.length;
  }

  const centralOffset = offset;
  const centralSize = centralDirectory.reduce((total, chunk) => total + chunk.length, 0);
  const endRecord: number[] = [];
  writeUInt32(endRecord, 0x06054b50);
  writeUInt16(endRecord, 0);
  writeUInt16(endRecord, 0);
  writeUInt16(endRecord, items.length);
  writeUInt16(endRecord, items.length);
  writeUInt32(endRecord, centralSize);
  writeUInt32(endRecord, centralOffset);
  writeUInt16(endRecord, 0);

  return new Blob([...chunks, ...centralDirectory, new Uint8Array(endRecord)], { type: 'application/zip' });
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
};

const hexFromBuffer = (buffer: ArrayBuffer) => {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const sha256Hex = async (value: ArrayBuffer | string) => {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return hexFromBuffer(await crypto.subtle.digest('SHA-256', bytes));
};

const cleanSelectedRelativePath = (value: string) => {
  const normalized = normalizePath(value);
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length > 1 && !CATEGORY_FOLDER_PATTERN.test(parts[0]) && !isIgnoredFolder(parts[0])) {
    return parts.slice(1).join('/');
  }
  return normalized;
};

const mimeFor = (file: File) => {
  if (file.type) return file.type;
  const extension = extensionFor(file.name);
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  return 'image/jpeg';
};

const parseCatalogMetadata = (folderPathParts: string[], fileName: string) => {
  const text = [...folderPathParts, fileName].join(' ').replace(/\u00d7/g, 'x').replace(/\s+/g, ' ').trim();
  const rimMatch = text.match(/\b(1[3-9]|2[0-6])\s*(?:inch|inches|in|")?\b/i);
  const pcdMatch = text.match(/\b([456])\s*x\s*(\d{3}(?:\.\d)?)\b/i) ?? text.match(/\b([456])(\d{3})\b/i);
  const tags = Array.from(new Set(
    [...folderPathParts, fileName.replace(/\.[^.]+$/, '')]
      .flatMap((part) => part.replace(/\s+/g, ' ').trim().split(/[\s_-]+/))
      .map((tag) => tag.replace(/[^a-z0-9.]+/gi, '').toUpperCase())
      .filter((tag) => tag.length > 1 && tag !== 'UPDATED' && tag !== 'INCH')
  ));

  return {
    rimSize: rimMatch ? rimMatch[1] : null,
    pcd: pcdMatch ? `${pcdMatch[1]}X${pcdMatch[2]}`.toUpperCase() : null,
    category: folderPathParts.find((part) => !isUpdatedFolder(part)) || null,
    tags
  };
};

const collectDirectoryFiles = async (directory: FileSystemDirectoryHandleLike, prefix = ''): Promise<LocalCatalogFile[]> => {
  const files: LocalCatalogFile[] = [];
  for await (const handle of directory.values()) {
    const relativePath = prefix ? `${prefix}/${handle.name}` : handle.name;
    if (handle.kind === 'directory') {
      files.push(...await collectDirectoryFiles(handle, relativePath));
    } else {
      files.push({ file: await handle.getFile(), relativePath });
    }
  }
  return files;
};

export const WheelCatalogView: React.FC<WheelCatalogViewProps> = ({ searchQuery = '', isAdmin = false }) => {
  const [items, setItems] = useState<WheelCatalogItemRow[]>([]);
  const [syncRun, setSyncRun] = useState<WheelCatalogSyncRunRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isStaffUploadModalOpen, setIsStaffUploadModalOpen] = useState(false);
  const [isStaffUploading, setIsStaffUploading] = useState(false);
  const [staffUploadFiles, setStaffUploadFiles] = useState<File[]>([]);
  const [staffUploadRimSize, setStaffUploadRimSize] = useState('');
  const [staffUploadPcd, setStaffUploadPcd] = useState('');
  const [staffUploadToken, setStaffUploadToken] = useState(WHEEL_CATALOG_REPLACE_FOLDER_PIN);
  const [driveSyncToken, setDriveSyncToken] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [selectedSize, setSelectedSize] = useState('ALL');
  const [selectedPcd, setSelectedPcd] = useState('ALL');
  const [selectedFolder, setSelectedFolder] = useState('ALL');
  const [selectedVehicleBrand, setSelectedVehicleBrand] = useState('ALL');
  const [selectedVehicleModel, setSelectedVehicleModel] = useState('ALL');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [analysisFilter, setAnalysisFilter] = useState<AnalysisFilter>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({ scanned: 0, uploaded: 0, skipped: 0, failed: 0, deactivated: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const staffUploadInputRef = useRef<HTMLInputElement | null>(null);
  const syncTokenRef = useRef('');
  const driveSyncSubmittingRef = useRef(false);
  const deferredCatalogSearch = useDeferredValue(catalogSearch);

  const loadCatalog = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [rows, latestSyncRun] = await Promise.all([
        fetchWheelCatalogItems(),
        fetchLatestWheelCatalogSyncRun()
      ]);
      setItems(rows);
      setSyncRun(latestSyncRun);
      setStatus(rows.length ? `${rows.length} catalog images ready.` : 'No imported catalog images yet.');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load wheel catalog.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadCatalog();
  }, []);

  useEffect(() => {
    setSelectedVehicleModel('ALL');
  }, [selectedVehicleBrand]);

  const sizes = useMemo(() => sortSizes(Array.from(new Set(items.map((item) => item.rim_size).filter(Boolean) as string[]))), [items]);
  const pcds = useMemo(() => sortPcds(Array.from(new Set(items.map((item) => item.pcd).filter(Boolean) as string[]))), [items]);
  const folders = useMemo(() => (
    Array.from(new Set(items.map((item) => item.folder_path || 'Unsorted catalog'))).sort((first, second) => first.localeCompare(second, undefined, { numeric: true }))
  ), [items]);
  const vehicleBrands = useMemo(() => (
    Array.from(new Set(SOUTH_AFRICA_VEHICLE_PCD_MODELS.map((vehicle) => vehicle.brand))).sort()
  ), []);
  const vehicleModels = useMemo(() => (
    SOUTH_AFRICA_VEHICLE_PCD_MODELS
      .filter((vehicle) => selectedVehicleBrand === 'ALL' || vehicle.brand === selectedVehicleBrand)
      .sort((first, second) => first.model.localeCompare(second.model))
  ), [selectedVehicleBrand]);
  const selectedVehicle = useMemo(() => (
    SOUTH_AFRICA_VEHICLE_PCD_MODELS.find((vehicle) => `${vehicle.brand}|||${vehicle.model}` === selectedVehicleModel) ?? null
  ), [selectedVehicleModel]);

  const analyzedItemsCount = useMemo(() => (
    items.filter((item) => item.image_analysis_status === 'completed' && Boolean(item.image_ocr_text)).length
  ), [items]);
  const reviewItemsCount = useMemo(() => items.filter((item) => item.needs_review).length, [items]);

  const filteredItems = useMemo(() => {
    const globalQuery = normalizeText(searchQuery);
    const localQuery = normalizeText(deferredCatalogSearch);
    return items.filter((item) => (
      (selectedSize === 'ALL' || item.rim_size === selectedSize)
      && (selectedPcd === 'ALL' || item.pcd === selectedPcd)
      && wheelMatchesVehiclePcd(item, selectedVehicle?.pcds ?? [])
      && (selectedFolder === 'ALL' || (item.folder_path || 'Unsorted catalog') === selectedFolder)
      && (analysisFilter === 'ALL' || (analysisFilter === 'ANALYZED' && item.image_analysis_status === 'completed') || (analysisFilter === 'REVIEW' && item.needs_review === true))
      && itemMatchesWheelSearch(item, globalQuery)
      && itemMatchesWheelSearch(item, localQuery)
    ));
  }, [analysisFilter, deferredCatalogSearch, items, searchQuery, selectedFolder, selectedPcd, selectedSize, selectedVehicle]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, WheelCatalogItemRow[]>();
    filteredItems.forEach((item) => {
      const group = item.folder_path || 'Unsorted catalog';
      groups.set(group, [...(groups.get(group) ?? []), item]);
    });
    return Array.from(groups.entries());
  }, [filteredItems]);

  const selectedItems = useMemo(() => items.filter((item) => selectedIds.has(item.id)), [items, selectedIds]);

  const toggleItem = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runLocalSync = async (localFiles: LocalCatalogFile[], importToken: string, sourceLabel = WHEEL_CATALOG_SOURCE_LABEL) => {
    const imageFiles = localFiles
      .map((entry) => ({ ...entry, relativePath: cleanSelectedRelativePath(entry.relativePath) }))
      .filter((entry) => IMAGE_EXTENSIONS.has(extensionFor(entry.file.name)));
    const importableFiles = imageFiles.filter((entry) => !entry.relativePath.split('/').slice(0, -1).some(isIgnoredFolder));
    const skipped = imageFiles.length - importableFiles.length;

    if (!importableFiles.length) {
      setStatus('No customer-ready wheel images found in that folder.');
      return;
    }

    setIsSyncing(true);
    setError('');
    setSelectedIds(new Set());
    setSyncProgress({ scanned: imageFiles.length, uploaded: 0, skipped, failed: 0, deactivated: 0, total: importableFiles.length });

    const seenDriveFileIds: string[] = [];
    const failedMessages: string[] = [];
    let uploaded = 0;
    let failed = 0;
    let nextIndex = 0;
    let importRunId = '';

    try {
      setStatus('Starting local catalog sync...');
      const startResult = await startLocalWheelCatalogSync(importToken, sourceLabel);
      if (!startResult.ok || !startResult.importRunId) {
        throw new Error(startResult.error || 'Could not start local wheel catalog sync.');
      }
      importRunId = startResult.importRunId;

      const worker = async () => {
        while (nextIndex < importableFiles.length) {
          const index = nextIndex;
          nextIndex += 1;
          const entry = importableFiles[index];
          const relativePath = entry.relativePath;
          const parts = relativePath.split('/');
          const rawFolderPathParts = parts.slice(0, -1);
          const folderPathParts = rawFolderPathParts.filter((part) => !isUpdatedFolder(part));
          const metadata = parseCatalogMetadata(rawFolderPathParts, entry.file.name);

          try {
            const buffer = await entry.file.arrayBuffer();
            const contentSha256 = await sha256Hex(buffer);
            const pathSha256 = await sha256Hex(relativePath);
            const extension = extensionFor(entry.file.name) || 'jpg';
            const payload: LocalWheelCatalogImportPayload = {
              importRunId,
              sourceRootFolderId: WHEEL_CATALOG_SOURCE_ROOT_ID,
              sourceLabel,
              driveFileId: `local-${pathSha256}`,
              driveFolderId: null,
              folderPath: folderPathParts.join(' / '),
              folderPathParts,
              category: metadata.category,
              rimSize: metadata.rimSize,
              pcd: metadata.pcd,
              tags: Array.from(new Set([
                ...metadata.tags,
                ...rawFolderPathParts.filter(isUpdatedFolder).map((part) => `folder:${part}`)
              ])),
              fileName: entry.file.name,
              driveUrl: `local://${relativePath}`,
              storagePath: `local-import/${pathSha256.slice(0, 24)}/${contentSha256}.${extension}`,
              mimeType: mimeFor(entry.file),
              localRelativePath: relativePath,
              sourceSizeBytes: entry.file.size,
              contentSha256,
              sourceModifiedAt: entry.file.lastModified ? new Date(entry.file.lastModified).toISOString() : null,
              base64: arrayBufferToBase64(buffer)
            };

            const importResult = await importLocalWheelCatalogImage(payload, importToken);
            if (!importResult.ok) throw new Error(importResult.error || 'Image upload failed.');
            seenDriveFileIds.push(payload.driveFileId);
            uploaded += 1;
          } catch (syncError) {
            failed += 1;
            failedMessages.push(`${relativePath}: ${syncError instanceof Error ? syncError.message : 'Upload failed'}`);
          } finally {
            setSyncProgress((current) => ({ ...current, uploaded, failed }));
            setStatus(`Syncing local folder... ${uploaded + failed}/${importableFiles.length} images processed.`);
          }
        }
      };

      await Promise.all(Array.from({ length: Math.min(SYNC_CONCURRENCY, importableFiles.length) }, () => worker()));
      const finalizeResult = await finalizeLocalWheelCatalogSync(importToken, importRunId, seenDriveFileIds, {
        filesScanned: imageFiles.length,
        filesUploaded: uploaded,
        filesSkipped: skipped,
        filesFailed: failed,
        errorMessage: failed ? failedMessages.slice(0, 3).join('\n') : null
      });

      setSyncProgress((current) => ({ ...current, deactivated: finalizeResult.deactivated ?? 0 }));
      await loadCatalog();
      if (failed) {
        setError(`${failed} image${failed === 1 ? '' : 's'} failed to sync. The rest were saved.`);
      } else {
        setStatus(`Sync complete. ${uploaded} images uploaded, ${skipped} skipped, ${finalizeResult.deactivated ?? 0} old rows deactivated.`);
      }
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Local wheel catalog sync failed.');
      if (importRunId) {
        await finalizeLocalWheelCatalogSync(importToken, importRunId, seenDriveFileIds, {
          filesScanned: imageFiles.length,
          filesUploaded: uploaded,
          filesSkipped: skipped,
          filesFailed: failed || 1,
          errorMessage: syncError instanceof Error ? syncError.message : 'Local wheel catalog sync failed.'
        }).catch(() => undefined);
      }
    } finally {
      setIsSyncing(false);
      syncTokenRef.current = '';
    }
  };

  const handleSyncClick = async () => {
    if (isSyncing || driveSyncSubmittingRef.current) return;
    const syncToken = driveSyncToken.trim();
    if (!syncToken) {
      setError('Enter the wheel catalog sync token/PIN before syncing Google Drive.');
      return;
    }

    driveSyncSubmittingRef.current = true;
    setIsSyncing(true);
    setError('');
    setStatus('Syncing public Google Drive wheel catalog...');
    setSyncProgress({ scanned: 0, uploaded: 0, skipped: 0, failed: 0, deactivated: 0, total: 0 });

    try {
      const result = await syncGoogleDriveWheelCatalog(syncToken);
      if (!result.ok) {
        throw new Error(result.error || result.errors?.join('\n') || 'Google Drive wheel catalog sync failed.');
      }

      const scanned = result.scanned ?? result.filesScanned ?? 0;
      const uploaded = result.imported ?? result.filesUploaded ?? 0;
      const skipped = result.skipped ?? result.filesSkipped ?? 0;
      setSyncProgress({
        scanned,
        uploaded,
        skipped,
        failed: result.filesFailed ?? 0,
        deactivated: result.deactivated ?? 0,
        total: scanned
      });
      setStatus(`Google Drive sync complete. ${uploaded} images imported, ${skipped} skipped, ${result.deactivated ?? 0} old rows deactivated.`);
      setDriveSyncToken('');
      await loadCatalog();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Google Drive wheel catalog sync failed.');
    } finally {
      driveSyncSubmittingRef.current = false;
      setIsSyncing(false);
    }
  };

  const submitDriveSync = (event: React.SyntheticEvent) => {
    event.preventDefault();
    void handleSyncClick();
  };

  const handleFallbackFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const importToken = syncTokenRef.current;
    event.target.value = '';
    if (!files.length || !importToken) return;

    await runLocalSync(files.map((file) => ({
      file,
      relativePath: cleanSelectedRelativePath((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name)
    })), importToken);
  };

  const resetStaffUpload = () => {
    setIsStaffUploadModalOpen(false);
    setStaffUploadFiles([]);
    setStaffUploadRimSize('');
    setStaffUploadPcd('');
    setStaffUploadToken(WHEEL_CATALOG_REPLACE_FOLDER_PIN);
  };

  const handleStaffUploadClick = () => {
    if (isSyncing || isStaffUploading) return;
    staffUploadInputRef.current?.click();
  };

  const handleStaffUploadFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) => IMAGE_EXTENSIONS.has(extensionFor(file.name)));
    event.target.value = '';

    if (!files.length) {
      setStatus('Choose one or more wheel image files to upload.');
      return;
    }

    setStaffUploadFiles(files);
    setStaffUploadRimSize(selectedSize !== 'ALL' ? selectedSize : '');
    setStaffUploadPcd(selectedPcd !== 'ALL' ? selectedPcd : '');
    setStaffUploadToken(WHEEL_CATALOG_REPLACE_FOLDER_PIN);
    setError('');
    setIsStaffUploadModalOpen(true);
  };

  const handleConfirmStaffUpload = async () => {
    const importToken = staffUploadToken.trim();
    const rimSize = staffUploadRimSize.trim();
    const pcd = normalizeStaffUploadPcd(staffUploadPcd);
    const uploadFiles = staffUploadFiles.filter((file) => IMAGE_EXTENSIONS.has(extensionFor(file.name)));

    if (!uploadFiles.length) {
      setError('Select one or more wheel image files before uploading.');
      return;
    }

    if (!rimSize || !STAFF_UPLOAD_RIM_SIZES.includes(rimSize)) {
      setError('Choose the wheel inch for this upload group.');
      return;
    }

    if (!/^[456]X\d{3}(?:\.\d)?$/.test(pcd)) {
      setError('Enter the wheel PCD in a format like 5X100, 5X112, 5X114.3 or 6X139.');
      return;
    }

    if (importToken !== WHEEL_CATALOG_REPLACE_FOLDER_PIN) {
      setError('Use the admin passcode before confirming.');
      return;
    }

    const oversized = uploadFiles.find((file) => file.size > 10 * 1024 * 1024);
    if (oversized) {
      setError(`${oversized.name} is larger than 10MB. Please resize it before uploading.`);
      return;
    }

    const folderPath = `${rimSize} ${pcd}`;
    const folderPathParts = [folderPath];
    const sourceLabel = `${WHEEL_CATALOG_STAFF_UPLOAD_SOURCE_LABEL} - ${folderPath}`;
    const importRunId = `staff-upload-${Date.now()}`;
    const folderSlug = sanitizeName(folderPath).replace(/\s+/g, '-').toUpperCase();
    const seenDriveFileIds: string[] = [];
    let uploaded = 0;
    let failed = 0;
    let nextIndex = 0;

    setIsStaffUploading(true);
    setError('');
    setSelectedIds(new Set());
    setSyncProgress({ scanned: uploadFiles.length, uploaded: 0, skipped: 0, failed: 0, deactivated: 0, total: uploadFiles.length });
    setStatus(`Uploading ${uploadFiles.length} wheel image${uploadFiles.length === 1 ? '' : 's'} to ${folderPath}...`);

    try {
      const worker = async () => {
        while (nextIndex < uploadFiles.length) {
          const index = nextIndex;
          nextIndex += 1;
          const file = uploadFiles[index];

          try {
            const buffer = await file.arrayBuffer();
            const contentSha256 = await sha256Hex(buffer);
            const idSha256 = await sha256Hex(`staff-upload/${folderPath}/${file.name}/${contentSha256}`);
            const extension = extensionFor(file.name) || 'jpg';
            const relativePath = `staff-upload/${folderPath}/${file.name}`;
            const tags = Array.from(new Set([
              'STAFF-UPLOAD',
              `${rimSize}IN`,
              pcd,
              folderPath,
              ...file.name.replace(/\.[^.]+$/, '').split(/[\s_-]+/).map((tag) => tag.replace(/[^a-z0-9.]+/gi, '').toUpperCase()).filter((tag) => tag.length > 1)
            ]));
            const payload: LocalWheelCatalogImportPayload = {
              importRunId,
              sourceRootFolderId: WHEEL_CATALOG_STAFF_UPLOAD_SOURCE_ROOT_ID,
              sourceLabel,
              driveFileId: `local-staff-${idSha256}`,
              driveFolderId: null,
              folderPath,
              folderPathParts,
              category: folderPath,
              rimSize,
              pcd,
              tags,
              fileName: file.name,
              driveUrl: `local://${relativePath}`,
              storagePath: `local-import/staff-upload/${folderSlug}/${idSha256.slice(0, 24)}/${contentSha256}.${extension}`,
              mimeType: mimeFor(file),
              localRelativePath: relativePath,
              sourceSizeBytes: file.size,
              contentSha256,
              sourceModifiedAt: file.lastModified ? new Date(file.lastModified).toISOString() : null,
              base64: arrayBufferToBase64(buffer)
            };

            const importResult = await importLocalWheelCatalogImage(payload, importToken);
            if (!importResult.ok) throw new Error(importResult.error || 'Image upload failed.');
            seenDriveFileIds.push(payload.driveFileId);
            uploaded += 1;
          } catch (uploadError) {
            failed += 1;
            console.error(uploadError);
          } finally {
            setSyncProgress((current) => ({ ...current, uploaded, failed }));
            setStatus(`Uploading ${folderPath}... ${uploaded + failed}/${uploadFiles.length} images processed.`);
          }
        }
      };

      await Promise.all(Array.from({ length: Math.min(3, uploadFiles.length) }, () => worker()));

      if (failed) {
        throw new Error(`${failed} image${failed === 1 ? '' : 's'} failed. The old ${folderPath} folder was not cleared.`);
      }

      const replaceResult = await replaceWheelCatalogFolder(importToken, folderPath, seenDriveFileIds);
      if (!replaceResult.ok) {
        throw new Error(replaceResult.error || 'The upload saved, but the old folder could not be cleared.');
      }

      setSyncProgress((current) => ({ ...current, deactivated: replaceResult.deactivated ?? 0 }));
      await loadCatalog();
      setSelectedSize(rimSize);
      setSelectedPcd(pcd);
      setSelectedFolder(folderPath);
      resetStaffUpload();
      setStatus(`${folderPath} replaced. Uploaded ${uploaded} image${uploaded === 1 ? '' : 's'} and removed ${replaceResult.deactivated ?? 0} previous image${replaceResult.deactivated === 1 ? '' : 's'} from that folder.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Wheel upload failed.');
    } finally {
      setIsStaffUploading(false);
      setStaffUploadToken(WHEEL_CATALOG_REPLACE_FOLDER_PIN);
    }
  };

  const handleCopySelected = async () => {
    if (!selectedItems.length) {
      setStatus('Select at least one image first.');
      return;
    }

    setError('');
    setStatus('Preparing image for clipboard...');
    try {
      if (selectedItems.length === 1) {
        const response = await fetch(selectedItems[0].public_image_url, { cache: 'no-store' });
        if (!response.ok) throw new Error('Image could not be fetched.');
        const sourceBlob = await response.blob();
        try {
          await copyBlobToClipboard(sourceBlob);
        } catch {
          await copyBlobToClipboard(await makeSingleImageBlob(selectedItems[0]));
        }
        setStatus('Image copied. Paste it into your customer chat.');
        return;
      }

      const sheetBlob = await makeContactSheetBlob(selectedItems);
      await copyBlobToClipboard(sheetBlob);
      setStatus(`${Math.min(selectedItems.length, 12)} images copied as one WhatsApp-ready sheet.`);
    } catch {
      await copyTextToClipboard(buildFallbackText(selectedItems));
      setStatus('Image clipboard was blocked, so image links were copied instead.');
    }
  };

  const handleDownloadSelected = async () => {
    if (!selectedItems.length) {
      setStatus('Select at least one image first.');
      return;
    }

    setError('');
    setStatus('Preparing ZIP download...');
    try {
      const zipBlob = await makeZipBlob(selectedItems);
      downloadBlob(zipBlob, `gp-tyres-wheel-catalog-${selectedItems.length}-images.zip`);
      setStatus(`${selectedItems.length} selected image${selectedItems.length === 1 ? '' : 's'} downloaded as a ZIP.`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Could not prepare ZIP download.');
    }
  };

  const handleSelectFiltered = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      filteredItems.forEach((item) => next.add(item.id));
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());
  const clearCatalogFilter = (key: CatalogFilterKey) => {
    if (key === 'SEARCH') setCatalogSearch('');
    if (key === 'ANALYSIS') setAnalysisFilter('ALL');
    if (key === 'SIZE') setSelectedSize('ALL');
    if (key === 'PCD') setSelectedPcd('ALL');
    if (key === 'FOLDER') setSelectedFolder('ALL');
    if (key === 'VEHICLE') {
      setSelectedVehicleBrand('ALL');
      setSelectedVehicleModel('ALL');
    }
  };
  const resetCatalogFilters = () => {
    setCatalogSearch('');
    setAnalysisFilter('ALL');
    setSelectedSize('ALL');
    setSelectedPcd('ALL');
    setSelectedFolder('ALL');
    setSelectedVehicleBrand('ALL');
    setSelectedVehicleModel('ALL');
  };
  const copyButtonLabel = selectedIds.size <= 1 ? 'Copy Image' : 'Copy Contact Sheet';
  const hasActiveFilters = Boolean(
    catalogSearch.trim()
    || analysisFilter !== 'ALL'
    || selectedSize !== 'ALL'
    || selectedPcd !== 'ALL'
    || selectedFolder !== 'ALL'
    || selectedVehicleModel !== 'ALL'
  );
  const activeFilters: Array<{ key: CatalogFilterKey; label: string }> = [
    ...(catalogSearch.trim() ? [{ key: 'SEARCH' as const, label: `Search: ${catalogSearch.trim()}` }] : []),
    ...(analysisFilter !== 'ALL' ? [{ key: 'ANALYSIS' as const, label: analysisFilter === 'ANALYZED' ? 'OCR analyzed' : 'Needs review' }] : []),
    ...(selectedSize !== 'ALL' ? [{ key: 'SIZE' as const, label: `${selectedSize} inch` }] : []),
    ...(selectedPcd !== 'ALL' ? [{ key: 'PCD' as const, label: selectedPcd }] : []),
    ...(selectedFolder !== 'ALL' ? [{ key: 'FOLDER' as const, label: selectedFolder }] : []),
    ...(selectedVehicle ? [{ key: 'VEHICLE' as const, label: `${selectedVehicle.brand} ${selectedVehicle.model}` }] : [])
  ];

  return (
    <div className="flex h-full min-h-[calc(100vh-80px)] flex-col bg-gp-black text-gp-text-main">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFallbackFilesSelected}
        {...{ webkitdirectory: 'true' }}
      />
      <input
        ref={staffUploadInputRef}
        type="file"
        multiple
        className="hidden"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleStaffUploadFilesSelected}
      />

      <header className="border-b border-gp-border bg-gp-panel px-4 py-4 md:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-gp-red shadow-[0_0_12px_rgba(255,0,0,0.8)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gp-text-muted">Google Drive Wheel Catalog</span>
              <span className="rounded border border-gp-border px-2 py-1 text-[10px] font-bold uppercase text-gp-text-muted">{items.length} images</span>
              <span className="rounded border border-green-800 bg-green-950/30 px-2 py-1 text-[10px] font-bold uppercase text-green-400">{analyzedItemsCount} OCR searchable</span>
            </div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-gp-text-main md:text-3xl">Customer Wheel Finder</h1>
            <p className="mt-1 max-w-3xl text-sm text-gp-text-muted">
              Search printed wheel specifications from Supabase, browse the public Google Drive folders, then copy or download customer-ready photos for WhatsApp.
            </p>
          </div>

          <div className="rounded-lg border border-gp-border bg-gp-black/60 p-3 text-xs text-gp-text-muted xl:min-w-[360px]">
            <form
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              onSubmit={submitDriveSync}
            >
              <div>
                <p className="font-black uppercase tracking-widest text-gp-text-muted">Supabase Google Drive Sync</p>
                <p className="mt-1">
                  Last sync: <span className="font-bold text-gp-text-main">{formatSyncTime(syncRun?.completed_at ?? syncRun?.started_at)}</span>
                </p>
                {syncRun?.status && (
                  <p className={syncRun.status === 'failed' ? 'font-bold text-gp-red' : syncRun.status === 'completed' ? 'font-bold text-green-400' : 'font-bold text-yellow-400'}>
                    {syncRun.status.toUpperCase()} | Uploaded {syncRun.files_uploaded} | Skipped {syncRun.files_skipped}
                  </p>
                )}
                <a
                  href={WHEEL_CATALOG_DRIVE_FOLDER_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 hover:text-blue-300"
                >
                  Open public Google Drive folder
                </a>
              </div>
              <button
                type="button"
                onClick={handleStaffUploadClick}
                disabled={isSyncing || isStaffUploading}
                className={`${buttonBase} border border-green-700 bg-gp-input text-green-400 hover:bg-green-950/40`}
              >
                {isStaffUploading ? 'Uploading...' : 'Upload Wheels'}
              </button>
              <label className="min-w-[190px]">
                <span className="sr-only">Google Drive sync token</span>
                <input
                  type="password"
                  value={driveSyncToken}
                  onChange={(event) => setDriveSyncToken(event.target.value)}
                  disabled={isSyncing || isStaffUploading}
                  placeholder="Sync token / PIN"
                  className="min-h-11 w-full rounded-lg border border-gp-border bg-gp-input px-3 py-2 text-xs font-bold text-gp-text-main outline-none transition-colors placeholder:text-gp-text-muted focus:border-gp-red"
                />
              </label>
              <button
                type="submit"
                onClick={submitDriveSync}
                onPointerDown={(event) => {
                  if (event.button === 0) submitDriveSync(event);
                }}
                disabled={isSyncing || isStaffUploading || !driveSyncToken.trim()}
                className={`${buttonBase} bg-gp-red text-white hover:bg-red-700`}
              >
                {isSyncing ? 'Syncing...' : 'Sync Google Drive'}
              </button>
            </form>
            {(isSyncing || isStaffUploading) && (
              <div className="mt-3 rounded border border-gp-border bg-gp-panel px-3 py-2 font-bold uppercase tracking-wider">
                Scanned {syncProgress.scanned} | Uploaded {syncProgress.uploaded}/{syncProgress.total} | Skipped {syncProgress.skipped} | Failed {syncProgress.failed}
              </div>
            )}
            <div className="mt-2 min-h-4 text-[11px]">
              {error ? <span className="whitespace-pre-line font-bold text-gp-red">{error}</span> : <span>{status}</span>}
            </div>
            {!isAdmin && <p className="mt-2 text-[11px]">Staff can browse, copy, download, upload wheel batches, and sync the public Google Drive catalog.</p>}
          </div>
        </div>
      </header>

      <section className="border-b border-gp-border bg-gp-bg px-4 py-4 md:px-6">
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1fr_1.2fr_1.4fr]">
          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-gp-text-muted">Size</p>
            <div className="flex flex-wrap gap-2">
              {['ALL', ...sizes].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setSelectedSize(size)}
                  className={`${chipBase} ${selectedSize === size ? 'border-gp-red bg-gp-red text-white' : 'border-gp-border bg-gp-input text-gp-text-main hover:border-gp-red'}`}
                >
                  {size === 'ALL' ? 'All' : `${size}"`}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-gp-text-muted">PCD</p>
            <div className="flex flex-wrap gap-2">
              {['ALL', ...pcds].map((pcd) => (
                <button
                  key={pcd}
                  type="button"
                  onClick={() => setSelectedPcd(pcd)}
                  className={`${chipBase} ${selectedPcd === pcd ? 'border-gp-red bg-gp-red text-white' : 'border-gp-border bg-gp-input text-gp-text-main hover:border-gp-red'}`}
                >
                  {pcd === 'ALL' ? 'All' : pcd}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-gp-text-muted" htmlFor="wheel-folder-filter">Folder</label>
            <select
              id="wheel-folder-filter"
              value={selectedFolder}
              onChange={(event) => setSelectedFolder(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-gp-border bg-gp-input px-3 py-2 text-sm font-bold text-gp-text-main outline-none focus:border-gp-red"
            >
              <option value="ALL">All folders</option>
              {folders.map((folder) => (
                <option key={folder} value={folder}>{folder}</option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-gp-text-muted">Vehicle Wheel Database</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                value={selectedVehicleBrand}
                onChange={(event) => setSelectedVehicleBrand(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-gp-border bg-gp-input px-3 py-2 text-sm font-bold text-gp-text-main outline-none focus:border-gp-red"
              >
                <option value="ALL">All brands</option>
                {vehicleBrands.map((brand) => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </select>
              <select
                value={selectedVehicleModel}
                onChange={(event) => setSelectedVehicleModel(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-gp-border bg-gp-input px-3 py-2 text-sm font-bold text-gp-text-main outline-none focus:border-gp-red"
              >
                <option value="ALL">All models</option>
                {vehicleModels.map((vehicle) => (
                  <option key={`${vehicle.brand}|||${vehicle.model}`} value={`${vehicle.brand}|||${vehicle.model}`}>
                    {vehicle.model} ({vehicle.pcdKey.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
            {selectedVehicle && (
              <div className="mt-2 space-y-1 text-[11px] font-bold uppercase tracking-wide">
                <p className="text-green-400">
                  Showing {selectedVehicle.pcdKey.toUpperCase()} wheels for {selectedVehicle.brand} {selectedVehicle.model}
                </p>
                <p className="text-gp-text-muted">
                  {selectedVehicle.segment} • {selectedVehicle.priorityLevel} priority • confirm bore, ET, width, hardware and load rating before fitting
                </p>
              </div>
            )}
          </div>
        </div>

      </section>

      <section className="sticky top-0 z-40 border-y border-gp-border bg-[#06101a]/95 px-4 py-3 shadow-2xl shadow-black/60 backdrop-blur-xl md:px-6">
        <div className="space-y-3">
          <div className="grid gap-2 xl:grid-cols-[minmax(360px,1fr)_220px_auto]">
            <label className="block rounded-lg border border-gp-border bg-gp-black/50 px-3 py-2 focus-within:border-gp-red">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gp-text-muted">Find by printed wheel specs</span>
              <input
                type="search"
                value={catalogSearch}
                onChange={(event) => setCatalogSearch(event.target.value)}
                placeholder="Try: 7192, 17x9J, 5/112, black, ET35 or CB73.1"
                className="min-h-8 w-full bg-transparent py-1 text-sm font-bold text-gp-text-main outline-none placeholder:font-medium placeholder:text-gp-text-muted"
              />
            </label>
            <label className="block">
              <span className="sr-only">Analysis status</span>
              <select
                value={analysisFilter}
                onChange={(event) => setAnalysisFilter(event.target.value as AnalysisFilter)}
                className="min-h-11 w-full rounded-lg border border-gp-border bg-gp-input px-3 py-2 text-sm font-bold text-gp-text-main outline-none focus:border-gp-red"
              >
                <option value="ALL">All catalog images</option>
                <option value="ANALYZED">OCR analyzed ({analyzedItemsCount})</option>
                <option value="REVIEW">Needs review ({reviewItemsCount})</option>
              </select>
            </label>
            <button
              type="button"
              onClick={resetCatalogFilters}
              disabled={!hasActiveFilters}
              className={`${buttonBase} border border-gp-border bg-transparent text-gp-text-muted hover:border-gp-red hover:text-gp-text-main`}
            >
              Clear All Filters
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-gp-text-muted">Quick find</span>
            {QUICK_WHEEL_SEARCHES.map((search) => (
              <button
                key={search.value}
                type="button"
                onClick={() => setCatalogSearch(search.value)}
                className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wide transition-colors ${normalizeText(catalogSearch) === normalizeText(search.value) ? 'border-gp-red bg-gp-red text-white' : 'border-gp-border bg-gp-input text-gp-text-muted hover:border-gp-red hover:text-gp-text-main'}`}
              >
                {search.label}
              </button>
            ))}
          </div>
          {(activeFilters.length > 0 || searchQuery.trim()) && (
            <div className="flex flex-wrap items-center gap-2 border-t border-gp-border/70 pt-3" aria-label="Active wheel catalog filters">
              <span className="text-[9px] font-black uppercase tracking-[0.18em] text-gp-text-muted">Active</span>
              {searchQuery.trim() && (
                <span className="rounded-full border border-blue-800 bg-blue-950/40 px-3 py-1 text-[10px] font-bold text-blue-300">
                  Portal: {searchQuery.trim()}
                </span>
              )}
              {activeFilters.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => clearCatalogFilter(filter.key)}
                  aria-label={`Remove ${filter.label} filter`}
                  className="rounded-full border border-gp-red/60 bg-gp-red/10 px-3 py-1 text-[10px] font-bold text-red-100 transition-colors hover:bg-gp-red hover:text-white"
                >
                  {filter.label} <span aria-hidden="true">x</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-h-5 text-sm">
              {error ? (
                <span className="whitespace-pre-line font-bold text-gp-red">{error}</span>
              ) : (
                <span className="text-gp-text-muted">
                  <strong className="text-gp-text-main">{filteredItems.length}</strong> of {items.length} images found
                  {selectedIds.size ? ` | ${selectedIds.size} selected` : ''}
                  {searchQuery.trim() ? ` | Portal search: ${searchQuery.trim()}` : ''}
                  {status ? ` | ${status}` : ''}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleStaffUploadClick}
                disabled={isSyncing || isStaffUploading}
                className={`${buttonBase} border border-green-700 bg-gp-input text-green-400 hover:bg-green-950/40`}
              >
                {isStaffUploading ? 'Uploading...' : 'Upload Wheels'}
              </button>
              <button
                type="button"
                onClick={handleSelectFiltered}
                disabled={!filteredItems.length}
                className={`${buttonBase} border border-gp-border bg-gp-input text-gp-text-main hover:border-gp-red`}
              >
                Select {filteredItems.length} Results
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={!selectedIds.size}
                className={`${buttonBase} border border-gp-border bg-transparent text-gp-text-muted hover:text-gp-text-main`}
              >
                Clear Selection
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadSelected()}
                disabled={!selectedIds.size}
                className={`${buttonBase} border border-green-700 bg-gp-input text-green-400 hover:bg-green-950/40`}
              >
                Download ZIP
              </button>
              <button
                type="button"
                onClick={() => void handleCopySelected()}
                disabled={!selectedIds.size}
                className={`${buttonBase} bg-green-600 text-white hover:bg-green-700`}
              >
                {copyButtonLabel}
              </button>
            </div>
          </div>
        </div>
      </section>

      <main className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
        {isLoading ? (
          <div className="flex min-h-[360px] items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="relative h-16 w-16">
                <div className="absolute inset-0 rounded-full border-4 border-gp-border" />
                <div className="absolute inset-0 animate-spin rounded-full border-4 border-gp-red border-t-transparent" />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-gp-text-muted">Loading catalog...</span>
            </div>
          </div>
        ) : groupedItems.length ? (
          <div className="space-y-8 pb-28">
            {groupedItems.map(([folder, groupItems]) => (
              <section key={folder} className="border-t border-gp-border pt-4">
                <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h2 className="text-lg font-black uppercase text-gp-text-main">{folder}</h2>
                    <p className="text-xs font-bold uppercase tracking-widest text-gp-text-muted">{groupItems.length} images</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedIds((current) => {
                      const next = new Set(current);
                      groupItems.forEach((item) => next.add(item.id));
                      return next;
                    })}
                    className="min-h-9 rounded-lg border border-gp-border bg-gp-input px-3 py-2 text-xs font-black uppercase tracking-wider text-gp-text-main hover:border-gp-red"
                  >
                    Select Folder
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
                  {groupItems.map((item) => {
                    const selected = selectedIds.has(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleItem(item.id)}
                        aria-label={`Select ${formatWheelSpecs(item) || item.file_name}`}
                        title={formatWheelSpecs(item) || item.file_name}
                        className={`group aspect-square overflow-hidden rounded-lg border text-left transition-all ${selected ? 'border-gp-red bg-gp-red/10 shadow-[0_0_0_1px_rgba(255,0,0,0.45)]' : 'border-gp-border bg-gp-panel hover:border-gp-red/70'}`}
                      >
                        <div className="relative h-full w-full bg-white">
                          <img
                            src={item.public_image_url}
                            alt={item.file_name}
                            loading="lazy"
                            className="h-full w-full object-contain"
                          />
                          <span className="absolute left-2 top-2 rounded border border-black/20 bg-white/90 px-2 py-1 text-[10px] font-black uppercase text-black">
                            {[item.rim_size ? `${item.rim_size}"` : '', item.pcd ?? ''].filter(Boolean).join(' ') || folder}
                          </span>
                          <span className={`absolute right-2 top-2 rounded border px-2 py-1 text-[10px] font-black uppercase ${selected ? 'border-gp-red bg-gp-red text-white' : 'border-black/20 bg-white/90 text-black'}`}>
                            {selected ? 'Selected' : 'Pick'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="flex min-h-[380px] items-center justify-center border border-dashed border-gp-border bg-gp-panel/50 px-4 text-center">
            <div className="max-w-md">
              <h2 className="text-2xl font-black uppercase text-gp-text-main">No catalog images found</h2>
              <p className="mt-2 text-sm text-gp-text-muted">
                {items.length ? 'Try clearing the filters or search text.' : 'Use Sync Google Drive to index the public Drive catalog into Supabase.'}
              </p>
              {items.length > 0 && hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetCatalogFilters}
                  className={`${buttonBase} mt-5 bg-gp-red text-white hover:bg-red-700`}
                >
                  Clear All Filters
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {isStaffUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-xl border border-gp-border bg-gp-panel shadow-2xl">
            <div className="border-b border-gp-border px-5 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-green-400">Supabase Wheel Upload</p>
              <h2 className="mt-1 text-2xl font-black uppercase text-gp-text-main">Replace Wheel Folder</h2>
              <p className="mt-2 text-sm text-gp-text-muted">
                Confirm the shared wheel specs for this batch. After upload, previous active images inside the same folder will be removed from the portal.
              </p>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gp-text-muted">Wheel Inch</span>
                  <select
                    value={staffUploadRimSize}
                    onChange={(event) => setStaffUploadRimSize(event.target.value)}
                    disabled={isStaffUploading}
                    className="mt-2 min-h-11 w-full rounded-lg border border-gp-border bg-gp-input px-3 py-2 text-sm font-bold text-gp-text-main outline-none focus:border-gp-red"
                  >
                    <option value="">Select inch</option>
                    {STAFF_UPLOAD_RIM_SIZES.map((size) => (
                      <option key={size} value={size}>{size}"</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gp-text-muted">Wheel PCD</span>
                  <input
                    list="wheel-upload-pcd-options"
                    value={staffUploadPcd}
                    onChange={(event) => setStaffUploadPcd(event.target.value.toUpperCase())}
                    onBlur={() => setStaffUploadPcd((value) => normalizeStaffUploadPcd(value))}
                    disabled={isStaffUploading}
                    placeholder="Example: 5X100"
                    className="mt-2 min-h-11 w-full rounded-lg border border-gp-border bg-gp-input px-3 py-2 text-sm font-bold uppercase text-gp-text-main outline-none focus:border-gp-red"
                  />
                  <datalist id="wheel-upload-pcd-options">
                    {pcds.map((pcd) => (
                      <option key={pcd} value={pcd} />
                    ))}
                  </datalist>
                </label>
              </div>

              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-gp-text-muted">Upload PIN</span>
                <input
                  type="password"
                  value={staffUploadToken}
                  onChange={(event) => setStaffUploadToken(event.target.value)}
                  disabled={isStaffUploading}
                  placeholder="Use admin passcode"
                  className="mt-2 min-h-11 w-full rounded-lg border border-gp-border bg-gp-input px-3 py-2 text-sm font-bold text-gp-text-main outline-none focus:border-gp-red"
                />
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">
                  REPLACE WHEEL FOLDER PIN: USE ADMIN PASSCODE
                </p>
              </label>

              <div className="rounded-lg border border-gp-border bg-gp-black/60 p-3 text-sm text-gp-text-muted">
                <p className="font-bold text-gp-text-main">{staffUploadFiles.length} image{staffUploadFiles.length === 1 ? '' : 's'} selected</p>
                <p className="mt-1">
                  Target folder: <span className="font-bold text-green-400">{staffUploadRimSize && staffUploadPcd ? `${staffUploadRimSize} ${normalizeStaffUploadPcd(staffUploadPcd)}` : 'Choose inch and PCD'}</span>
                </p>
                <div className="mt-2 max-h-28 overflow-y-auto text-xs">
                  {staffUploadFiles.slice(0, 8).map((file) => (
                    <p key={`${file.name}-${file.size}`} className="truncate">{file.name}</p>
                  ))}
                  {staffUploadFiles.length > 8 && <p>+{staffUploadFiles.length - 8} more</p>}
                </div>
              </div>

              <div className="rounded-lg border border-yellow-700/50 bg-yellow-950/20 p-3 text-xs font-bold uppercase tracking-wide text-yellow-200">
                This replaces the active portal images in the matching folder only. It does not run a full local-folder sync.
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-gp-border px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={resetStaffUpload}
                disabled={isStaffUploading}
                className={`${buttonBase} border border-gp-border bg-transparent text-gp-text-muted hover:text-gp-text-main`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmStaffUpload()}
                disabled={isStaffUploading}
                className={`${buttonBase} bg-gp-red text-white hover:bg-red-700`}
              >
                {isStaffUploading ? 'Uploading...' : 'Confirm Replace Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedItems.length > 0 && (
        <aside className="fixed bottom-0 left-0 right-0 z-40 border-t border-gp-border bg-gp-panel/95 px-4 py-3 shadow-2xl backdrop-blur md:left-72">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-black uppercase text-gp-text-main">{selectedItems.length} image{selectedItems.length === 1 ? '' : 's'} selected</p>
              <p className="text-xs text-gp-text-muted">
                {selectedItems.slice(0, 3).map((item) => `${item.rim_size ?? '-'} ${item.pcd ?? ''}`.trim()).join('  |  ')}
                {selectedItems.length > 3 ? `  |  +${selectedItems.length - 3} more` : ''}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={clearSelection}
                className={`${buttonBase} border border-gp-border bg-gp-input text-gp-text-main hover:border-gp-red`}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadSelected()}
                className={`${buttonBase} border border-green-700 bg-gp-input text-green-400 hover:bg-green-950/40`}
              >
                Download ZIP
              </button>
              <button
                type="button"
                onClick={() => void handleCopySelected()}
                className={`${buttonBase} bg-green-600 text-white hover:bg-green-700`}
              >
                {copyButtonLabel}
              </button>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
};
