import {Inflate} from 'fflate';

export const ZIP_LIMITS = {archive: 2 * 1024 ** 3, expanded: 4 * 1024 ** 3, entries: 50000, directory: 16 * 1024 ** 2};
const damaged = () => new Error('The ZIP archive is damaged or unsupported. Extract it and choose the Takeout folder instead.');
const unsafe = () => new Error('ZIP exceeds the safe import limits or contains invalid paths.');
const crcTable = Uint32Array.from({length: 256}, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
export function importPath(value) {
  const name = String(value).replaceAll('\\', '/').replace(/^\.\//, '');
  if (!name || name.length > 4096 || name.startsWith('/') || /^[a-z]:/i.test(name) || name.includes('\0') || name.split('/').includes('..')) throw unsafe();
  return name;
}
async function range(file, start, length, signal) {
  signal?.throwIfAborted();
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 0 || start + length > file.size) throw damaged();
  const bytes = new Uint8Array(await file.slice(start, start + length).arrayBuffer());
  signal?.throwIfAborted();
  if (bytes.length !== length) throw damaged();
  return bytes;
}
const view = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const nameFrom = bytes => {try{return new TextDecoder('utf-8', {fatal: true}).decode(bytes);}catch{throw damaged();}};

// Read the central directory with Blob slices, then expand only requested files.
export async function openZipArchive(file, {signal} = {}) {
  if (file.size > ZIP_LIMITS.archive) throw new Error('ZIP archives must be 2 GB or smaller. Extract the archive and choose the Takeout folder instead.');
  if (file.size < 22 || typeof file.slice !== 'function') throw damaged();
  const tailStart = Math.max(0, file.size - 65557), tail = await range(file, tailStart, file.size - tailStart, signal), end = view(tail);
  let position = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (end.getUint32(i, true) === 0x06054b50 && i + 22 + end.getUint16(i + 20, true) === tail.length) { position = i; break; }
  }
  if (position < 0) throw damaged();
  const count = end.getUint16(position + 10, true), size = end.getUint32(position + 12, true), offset = end.getUint32(position + 16, true);
  if (end.getUint16(position + 4, true) || end.getUint16(position + 6, true) || end.getUint16(position + 8, true) !== count) throw damaged();
  // ZIP64/multidisk exports remain importable through their extracted folder.
  if (count === 65535 || size === 0xffffffff || offset === 0xffffffff) throw damaged();
  if (count > ZIP_LIMITS.entries || size > ZIP_LIMITS.directory) throw unsafe();
  if (offset + size > tailStart + position) throw damaged();
  const directory = await range(file, offset, size, signal), header = view(directory), entries = new Map();
  let cursor = 0, expanded = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > directory.length || header.getUint32(cursor, true) !== 0x02014b50) throw damaged();
    const flags = header.getUint16(cursor + 8, true), method = header.getUint16(cursor + 10, true), crc = header.getUint32(cursor + 16, true);
    const compressed = header.getUint32(cursor + 20, true), original = header.getUint32(cursor + 24, true), local = header.getUint32(cursor + 42, true);
    const nameLength = header.getUint16(cursor + 28, true), extraLength = header.getUint16(cursor + 30, true), commentLength = header.getUint16(cursor + 32, true);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > directory.length || header.getUint16(cursor + 34, true) || [compressed, original, local].includes(0xffffffff)) throw damaged();
    if (flags & 0x41 || ![0, 8].includes(method)) throw damaged();
    if (method === 0 && compressed !== original) throw damaged();
    const rawName = nameFrom(directory.subarray(cursor + 46, cursor + 46 + nameLength));
    const name = importPath(rawName);
    expanded += original;
    if (expanded > ZIP_LIMITS.expanded || entries.has(name)) throw unsafe();
    if (local + 30 > offset || local + 30 + compressed > offset) throw damaged();
    if (!name.endsWith('/')) entries.set(name, {
      size: original,
      async read({maxBytes = 16 * 1024 ** 2, signal: readSignal = signal} = {}) {
        readSignal?.throwIfAborted();
        if (original > maxBytes || compressed > maxBytes * 2 + 1024) throw new Error('One import file exceeds the safe per-file limit.');
        const localBytes = await range(file, local, 30, readSignal), localHeader = view(localBytes);
        if (localHeader.getUint32(0, true) !== 0x04034b50 || localHeader.getUint16(8, true) !== method || localHeader.getUint16(6, true) !== flags) throw damaged();
        const localNameLength = localHeader.getUint16(26, true), localExtraLength = localHeader.getUint16(28, true);
        const localName = await range(file, local + 30, localNameLength, readSignal);
        if (nameFrom(localName) !== rawName) throw damaged();
        const start = local + 30 + localNameLength + localExtraLength;
        if (start + compressed > offset) throw damaged();
        const output = new Uint8Array(original);
        let written = 0, checksum = 0xffffffff;
        const accept = chunk => {
          if (written + chunk.length > original || written + chunk.length > maxBytes) throw damaged();
          output.set(chunk, written); written += chunk.length;
          for (const byte of chunk) checksum = crcTable[(checksum ^ byte) & 255] ^ (checksum >>> 8);
        };
        const inflate = method === 8 ? new Inflate(accept) : null;
        for (let consumed = 0; consumed < compressed; consumed += 32768) {
          const length = Math.min(32768, compressed - consumed), chunk = await range(file, start + consumed, length, readSignal);
          try {if (inflate) inflate.push(chunk, consumed + length === compressed); else accept(chunk);}catch{throw damaged();}
        }
        if (inflate && !compressed) inflate.push(new Uint8Array(), true);
        readSignal?.throwIfAborted();
        if (written !== original || ((checksum ^ 0xffffffff) >>> 0) !== crc) throw damaged();
        return output;
      }
    });
    cursor = next;
  }
  if (cursor !== directory.length) throw damaged();
  return entries;
}

export const isTakeoutArchive = entries => !entries.has('backup.json') && [...entries.keys()].some(name => /\.json$/i.test(name));
