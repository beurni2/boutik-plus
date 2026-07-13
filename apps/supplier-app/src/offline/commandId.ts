/**
 * WO-6.5 · B2.1 — the command_id seam.
 *
 * ⏳ CANON GAP (flagged to the founder — not filled by my judgement): the
 * Execution Contract §3 envelope CARRIES `command_id` (`EventEnvelopeSchema`:
 * `command_id: z.ZodString`) but canon is SILENT on HOW a client MINTS one —
 * no format, no generator, no idempotency-key rule anywhere in `contracts/` or
 * `/docs`. That rule belongs in `platform-contracts`, not here.
 *
 * What is NOT a judgement call — it is FORCED by offline-first + the founder's
 * own diagnosis ("reproducibility is the bug — the id collides because it is
 * RECOMPUTED after a reboot"): the id is minted CLIENT-side (there is no server
 * offline), minted exactly ONCE at the moment the command is created, and
 * PERSISTED with the entry — so it is NEVER recomputed and cannot collide with
 * itself across an app-kill/reboot. A wall-clock is wrong twice over (it is
 * recomputed, and on Android Go the RTC runs backwards).
 *
 * The safest-default FORMAT pending the founder's canon ruling: a v4-shaped,
 * 122-bit random token — the industry-standard idempotency key. It is an
 * idempotency key, NOT a security token, so a non-CSPRNG source is adequate for
 * collision-resistance (~2^-122 per pair). If canon prefers a different format
 * (ULID for sortability, a device-scoped persisted counter, a domain-derived
 * key), that is the founder's call — this is the single seam to change.
 */

/** Mint a fresh command_id ONCE, at command creation. The caller MUST persist
 * it (via the durable queue) and never recompute it. */
export function mintCommandId(): string {
  // v4 UUID shape (8-4-4-4-12), random bits from Math.random — sufficient for
  // an idempotency key (see the canon-gap note above; NOT a security token).
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out += '-';
    } else if (i === 14) {
      out += '4'; // version 4
    } else if (i === 19) {
      out += hex[(Math.floor(Math.random() * 16) & 0x3) | 0x8]!; // variant 10xx
    } else {
      out += hex[Math.floor(Math.random() * 16)]!;
    }
  }
  return out;
}
