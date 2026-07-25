/**
 * COMBINED SLICE — ProductAssets ASSEMBLY, pure. Upload outcomes in, a canon-
 * shaped assets object (or an honest null) out. The screen decides nothing; the
 * service re-validates at its boundary (`ProductAssetsSchema.parse` in
 * offer-core) — this mirrors the shape locally because app code may not import
 * `@platform/contracts` at runtime (Metro law).
 *
 * CROPS, NOT EXTRA CAPTURES (founder-confirmed shape): his Studio flow takes
 * THREE photographs — héro · preuve · détail. Canon `ProductAssets` requires
 * FOUR refs (heroSquare, heroVertical, proof) plus details and the private
 * master. The gap closes with two CROPS of the ONE hero capture — square and
 * vertical — rendered on-device, so his flow keeps exactly three shots and no
 * new capture screen exists.
 *
 * THE LONGEST-COMPLETE-PREFIX RULE (founder ruling: "a missing hero means NO
 * hero", never a promotion): canon's schema is strict — masterRef, heroSquare,
 * heroVertical and proof are all REQUIRED, so there is no such thing as a
 * partial ProductAssets. The wire order is [heroSquare, heroVertical, proof,
 * ...detail]; assembly emits the longest complete prefix of the roles that is
 * expressible:
 *   · every REQUIRED role uploaded  → assets, with as many details as arrived
 *     (a failed DETAIL upload drops only the suffix from that detail on — the
 *     prefix that got through still ships);
 *   · any REQUIRED role missing    → NO assets at all ({ ok: false }), and the
 *     product publishes with `assetRefs: []` — the honest empty. A detail is
 *     NEVER promoted into a hero slot; a detail that arrived without its
 *     required prefix does not ship out of order.
 * The completion path (`POST /offers/assets`) then attaches the full set later
 * without republishing.
 */

/** Mirrors canon `MediaRef` — {ref, sha256 (64 hex), mimeType}. */
export interface MediaRefInput {
  readonly ref: string;
  readonly sha256: string;
  readonly mimeType: string;
}

/** Mirrors canon `ProductAssets` (§5.6) — strict, master private. */
export interface ProductAssetsInput {
  readonly masterRef: MediaRefInput;
  readonly heroSquare: MediaRefInput;
  readonly heroVertical: MediaRefInput;
  readonly proof: MediaRefInput;
  readonly detail: readonly MediaRefInput[];
  readonly hashes: readonly string[];
  readonly processingVersion: string;
}

/** One shot's upload outcome — a ref that made it, or the role that did not. */
export type RoleUpload =
  | { readonly ok: true; readonly ref: MediaRefInput }
  | { readonly ok: false };

export interface AssemblyInput {
  readonly master: RoleUpload;
  readonly heroSquare: RoleUpload;
  readonly heroVertical: RoleUpload;
  readonly proof: RoleUpload;
  /** In capture order; a failed one cuts the suffix (prefix rule), never reorders. */
  readonly detail: readonly RoleUpload[];
  readonly processingVersion: string;
}

export type AssemblyOutcome =
  | { readonly ok: true; readonly assets: ProductAssetsInput }
  | {
      readonly ok: false;
      /** The REQUIRED roles that did not arrive — what the completion path must re-upload. */
      readonly missing: readonly ('master' | 'heroSquare' | 'heroVertical' | 'proof')[];
    };

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** A ref is usable only if it is shaped like one — a malformed hash never ships. */
function usable(u: RoleUpload): u is { ok: true; ref: MediaRefInput } {
  return u.ok && u.ref.ref.length > 0 && SHA256_HEX.test(u.ref.sha256) && u.ref.mimeType.length > 0;
}

export function assembleAssets(input: AssemblyInput): AssemblyOutcome {
  const required = [
    ['master', input.master],
    ['heroSquare', input.heroSquare],
    ['heroVertical', input.heroVertical],
    ['proof', input.proof],
  ] as const;
  const missing = required.filter(([, u]) => !usable(u)).map(([role]) => role);
  if (missing.length > 0) return { ok: false, missing };

  // Details: the longest complete PREFIX in capture order. A failure cuts the
  // suffix — later successes do not ship out of order, because order is the
  // founder's (index 0 hero, his sequence after) and reordering silently would
  // misrepresent which photograph is which.
  const detail: MediaRefInput[] = [];
  for (const u of input.detail) {
    if (!usable(u)) break;
    detail.push(u.ref);
  }

  const master = (input.master as { ok: true; ref: MediaRefInput }).ref;
  const heroSquare = (input.heroSquare as { ok: true; ref: MediaRefInput }).ref;
  const heroVertical = (input.heroVertical as { ok: true; ref: MediaRefInput }).ref;
  const proof = (input.proof as { ok: true; ref: MediaRefInput }).ref;
  return {
    ok: true,
    assets: {
      masterRef: master,
      heroSquare,
      heroVertical,
      proof,
      detail,
      // every SHIPPED ref's hash, in wire order, master included (canon `hashes`)
      hashes: [master.sha256, heroSquare.sha256, heroVertical.sha256, proof.sha256, ...detail.map((d) => d.sha256)],
      processingVersion: input.processingVersion,
    },
  };
}
