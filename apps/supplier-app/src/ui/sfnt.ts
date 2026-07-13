/**
 * WO-6.7 (🟢, CTO-assigned) — a PURE-TS sfnt reader, so the WO-5.1
 * name-table-collision guard NEVER skips (the old font-embedding test returned
 * early when python/fontTools was absent — green while asserting nothing, on the
 * exact defect that already shipped). Reads a TrueType/OpenType font's `name`
 * table (nameID 1 = family) and `OS/2` usWeightClass straight from the bytes.
 * Enough of the format for the embedding identity check; not a general parser.
 * All reads are bounds-checked → a malformed font throws, never mis-reads.
 */

export interface SfntIdentity {
  /** name table, nameID 1 (family). Windows (platform 3) preferred, else Mac. */
  family: string;
  /** OS/2 usWeightClass (400/500/700/800/900 for the shipped Archivo set). */
  weightClass: number;
}

function u16(b: Uint8Array, o: number): number {
  if (o + 2 > b.length) throw new Error(`sfnt: u16 out of bounds at ${o}`);
  return (b[o]! << 8) | b[o + 1]!;
}
function u32(b: Uint8Array, o: number): number {
  if (o + 4 > b.length) throw new Error(`sfnt: u32 out of bounds at ${o}`);
  return ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
}
function tag(b: Uint8Array, o: number): string {
  return String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);
}

/** Read the family name (nameID 1) + OS/2 weight class from a font's bytes. */
export function readSfntIdentity(bytes: Uint8Array): SfntIdentity {
  if (bytes.length < 12) throw new Error('sfnt: too short for a table directory');
  const numTables = u16(bytes, 4);
  let nameOff = -1;
  let os2Off = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const t = tag(bytes, rec);
    if (t === 'name') nameOff = u32(bytes, rec + 8);
    else if (t === 'OS/2') os2Off = u32(bytes, rec + 8);
  }
  if (nameOff < 0) throw new Error('sfnt: no name table');
  if (os2Off < 0) throw new Error('sfnt: no OS/2 table');
  return { family: readFamily(bytes, nameOff), weightClass: u16(bytes, os2Off + 4) };
}

/** A parsed cmap: answer whether a codepoint is mapped to a glyph. */
export interface CmapLookup {
  has(cp: number): boolean;
}

/**
 * WO-6.8 — read the `cmap` table and answer `has(codepoint)` from the real
 * bytes (so the money-separator paint check never depends on python/fontTools).
 * Resolves the Unicode format-4 (BMP) and format-12 (full) subtables; a
 * codepoint is covered if ANY Unicode subtable maps it to a non-zero glyph.
 * All reads bounds-checked → a malformed cmap throws, never mis-reports.
 */
export function readCmap(bytes: Uint8Array): CmapLookup {
  if (bytes.length < 12) throw new Error('sfnt: too short for a table directory');
  const numTables = u16(bytes, 4);
  let cmapOff = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (tag(bytes, rec) === 'cmap') cmapOff = u32(bytes, rec + 8);
  }
  if (cmapOff < 0) throw new Error('sfnt: no cmap table');
  const n = u16(bytes, cmapOff + 2);
  const checkers: ((cp: number) => boolean)[] = [];
  for (let i = 0; i < n; i++) {
    const rec = cmapOff + 4 + i * 8;
    const platformID = u16(bytes, rec);
    const encodingID = u16(bytes, rec + 2);
    // Unicode subtables: platform 0 (Unicode), or 3 (Windows) enc 1 (BMP) / 10 (UCS-4).
    const unicode = platformID === 0 || (platformID === 3 && (encodingID === 1 || encodingID === 10));
    if (!unicode) continue;
    const sub = cmapOff + u32(bytes, rec + 4);
    const format = u16(bytes, sub);
    if (format === 4) checkers.push(parseFormat4(bytes, sub));
    else if (format === 12) checkers.push(parseFormat12(bytes, sub));
  }
  if (checkers.length === 0) throw new Error('sfnt: no format-4/12 Unicode cmap subtable');
  return { has: (cp: number) => checkers.some((c) => c(cp)) };
}

function i16(b: Uint8Array, o: number): number {
  const v = u16(b, o);
  return v >= 0x8000 ? v - 0x10000 : v;
}

/** cmap format 4 (segment mapping to delta values) — BMP only. */
function parseFormat4(b: Uint8Array, off: number): (cp: number) => boolean {
  const segX2 = u16(b, off + 6);
  const segCount = segX2 / 2;
  const endOff = off + 14;
  const startOff = off + 16 + segX2;
  const deltaOff = off + 16 + 2 * segX2;
  const rangeOff = off + 16 + 3 * segX2;
  return (cp: number): boolean => {
    if (cp < 0 || cp > 0xffff) return false;
    for (let i = 0; i < segCount; i++) {
      const end = u16(b, endOff + i * 2);
      if (cp > end) continue;
      const start = u16(b, startOff + i * 2);
      if (cp < start) return false; // in the gap before this segment
      const ro = u16(b, rangeOff + i * 2);
      let g: number;
      if (ro === 0) {
        g = (cp + i16(b, deltaOff + i * 2)) & 0xffff;
      } else {
        const addr = rangeOff + i * 2 + ro + (cp - start) * 2;
        g = u16(b, addr);
        if (g !== 0) g = (g + i16(b, deltaOff + i * 2)) & 0xffff;
      }
      return g !== 0;
    }
    return false;
  };
}

/** cmap format 12 (segmented coverage) — full Unicode range. */
function parseFormat12(b: Uint8Array, off: number): (cp: number) => boolean {
  const nGroups = u32(b, off + 12);
  const groupsOff = off + 16;
  return (cp: number): boolean => {
    for (let i = 0; i < nGroups; i++) {
      const g = groupsOff + i * 12;
      const start = u32(b, g);
      const end = u32(b, g + 4);
      if (cp >= start && cp <= end) return true; // format-12 groups map to real glyphs
    }
    return false;
  };
}

function readFamily(b: Uint8Array, nameOff: number): string {
  const count = u16(b, nameOff + 2);
  const storageOff = nameOff + u16(b, nameOff + 4);
  let winName: string | null = null;
  let macName: string | null = null;
  for (let i = 0; i < count; i++) {
    const rec = nameOff + 6 + i * 12;
    const platformID = u16(b, rec);
    const nameID = u16(b, rec + 6);
    const len = u16(b, rec + 8);
    const off = u16(b, rec + 10);
    if (nameID !== 1) continue; // family only
    const start = storageOff + off;
    if (start + len > b.length) throw new Error('sfnt: name string out of bounds');
    const s = b.subarray(start, start + len);
    if (platformID === 3 || platformID === 0) {
      // Windows / Unicode → UTF-16BE
      let out = '';
      for (let j = 0; j + 1 < s.length; j += 2) out += String.fromCharCode((s[j]! << 8) | s[j + 1]!);
      winName = out;
    } else if (platformID === 1) {
      // Macintosh Roman → treat as Latin1 (ASCII family names)
      macName = String.fromCharCode(...s);
    }
  }
  const name = winName ?? macName;
  if (name === null) throw new Error('sfnt: no family (nameID 1) record');
  return name;
}
