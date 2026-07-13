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
