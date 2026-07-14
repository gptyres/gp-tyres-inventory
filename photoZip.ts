export interface PhotoZipFile {
  name: string;
  bytes: Uint8Array;
}

let crcTable: number[] | null = null;

const getCrcTable = () => {
  if (crcTable) return crcTable;
  crcTable = Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });
  return crcTable;
};

const crc32 = (bytes: Uint8Array) => {
  const table = getCrcTable();
  let value = 0xffffffff;
  for (const byte of bytes) value = table[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

const dosDateTime = (date = new Date()) => ({
  time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
});

export const createPhotoZip = (files: PhotoZipFile[]) => {
  const encoder = new TextEncoder();
  const encodedNames = files.map((file) => encoder.encode(file.name));
  const localSize = files.reduce((sum, file, index) => sum + 30 + encodedNames[index].length + file.bytes.length, 0);
  const centralSize = files.reduce((sum, _file, index) => sum + 46 + encodedNames[index].length, 0);
  const output = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(output.buffer);
  const timestamp = dosDateTime();
  const localOffsets: number[] = [];
  const checksums = files.map((file) => crc32(file.bytes));
  let offset = 0;
  const write16 = (value: number) => { view.setUint16(offset, value, true); offset += 2; };
  const write32 = (value: number) => { view.setUint32(offset, value >>> 0, true); offset += 4; };
  const writeBytes = (bytes: Uint8Array) => { output.set(bytes, offset); offset += bytes.length; };

  files.forEach((file, index) => {
    const name = encodedNames[index];
    localOffsets.push(offset);

    write32(0x04034b50);
    write16(20);
    write16(0x0800);
    write16(0);
    write16(timestamp.time);
    write16(timestamp.date);
    write32(checksums[index]);
    write32(file.bytes.length);
    write32(file.bytes.length);
    write16(name.length);
    write16(0);
    writeBytes(name);
    writeBytes(file.bytes);
  });

  const centralOffset = offset;
  files.forEach((file, index) => {
    const name = encodedNames[index];
    write32(0x02014b50);
    write16(20);
    write16(20);
    write16(0x0800);
    write16(0);
    write16(timestamp.time);
    write16(timestamp.date);
    write32(checksums[index]);
    write32(file.bytes.length);
    write32(file.bytes.length);
    write16(name.length);
    write16(0);
    write16(0);
    write16(0);
    write16(0);
    write32(0);
    write32(localOffsets[index]);
    writeBytes(name);
  });

  write32(0x06054b50);
  write16(0);
  write16(0);
  write16(files.length);
  write16(files.length);
  write32(offset - centralOffset);
  write32(centralOffset);
  write16(0);
  return new Blob([output], { type: 'application/zip' });
};
