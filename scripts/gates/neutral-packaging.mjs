#!/usr/bin/env node
import { runScanGate } from './scan.mjs';

/**
 * CI gate: neutral-packaging (WO Batch A · A2; B+3).
 * B+3: "no supplier branding/contact on the exterior; checked at pickup."
 * Boutik+ outer packaging is NEUTRAL/platform packaging — the physical exterior
 * of a colis MUST NOT carry the supplier's brand, shop name, logo, or contact.
 * The rider checks this at pickup; this gate bans the vocabulary that would
 * instruct or model such a label reaching the package exterior — in code AND in
 * copy (the ban binds UI wording as much as fields; B+3 has no French exception).
 *
 * The violation is CO-OCCURRENCE, on one line, of an exterior-packaging noun
 * (colis · emballage · paquet · extérieur · exterior · outer pack) with a
 * supplier branding/contact token (logo · marque · enseigne · nom de la/votre
 * boutique · coordonnées · téléphone · contact). Either order fails; a compound
 * identifier (colisLogo, exteriorBranding) fails too.
 *
 * Scoped so legitimate lines stay clean: "colis" alone (the word is everywhere),
 * a package tracking number, or a buyer delivery address never trip it — only
 * supplier IDENTITY on the EXTERIOR does. "package"/"packaging" (npm, and the
 * A1 reason-code identifier `not_neutral_packaging`) are NOT exterior tokens —
 * the app's real packaging copy is French (colis/emballage/paquet), so the
 * English word earns only false positives (A1 surfaced this on its own reason
 * codes). package.json is never a false positive.
 */
const EXT = String.raw`colis|emballages?|paquets?|ext[ée]rieur|exterior|outer[\s_-]?pack`;
const IDN = String.raw`logos?|marque|enseigne|coordonn[ée]es|t[ée]l[ée]phone|contact|nom\s+(?:de\s+)?(?:la\s+|votre\s+)?bouti(?:que|k)`;

runScanGate({
  gateName: 'neutral-packaging',
  invariant: 'B+3 neutral/platform packaging — no supplier branding/contact on the exterior',
  patterns: [
    { name: 'exterior→supplier branding/contact', regex: new RegExp(`(?:${EXT})[^\\n]{0,40}(?:${IDN})`, 'i') },
    { name: 'supplier branding/contact→exterior', regex: new RegExp(`(?:${IDN})[^\\n]{0,40}(?:${EXT})`, 'i') },
    { name: 'exterior-branding identifier', regex: /(exterior|ext[ée]rieur|colis|emballage|paquet)[_-]?(brand|logo|contact|phone|marque)/i },
  ],
});
