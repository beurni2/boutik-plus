import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { initialState, reduce } from '../src/v2/machine';
import { SUPPLIER_ZONE } from '../src/supply/service';
import { catalog } from '../src/i18n';

/**
 * COMBINED SLICE — the REAL listing flow, asserted at the source level (this
 * suite has no RN renderer; the pattern is df2-device-review.test.ts's).
 *
 * The architecture under test, founder-ruled: HIS five-step wizard is the flow;
 * `SListerReal` wraps the untouched `S20Wizard` with the real plumbing through
 * an INTERCEPTED dispatcher; the Studio is his S26 design over a real camera;
 * `publier.tsx` is DELETED — one path, his.
 */

const appDir = join(import.meta.dirname, '..');
const lister = readFileSync(join(appDir, 'src/v2/lister-real.tsx'), 'utf8');
const studio = readFileSync(join(appDir, 'src/v2/studio-real.tsx'), 'utf8');
const shootNative = readFileSync(join(appDir, 'src/v2/studio-shoot.tsx'), 'utf8');
const shootWeb = readFileSync(join(appDir, 'src/v2/studio-shoot.web.tsx'), 'utf8');
const shell = readFileSync(join(appDir, 'src/v2/AppV2.tsx'), 'utf8');
const screens2 = readFileSync(join(appDir, 'src/v2/screens2.tsx'), 'utf8');
const machine = readFileSync(join(appDir, 'src/v2/machine.ts'), 'utf8');
const keys = new Set(catalog.map((e) => e.key));

describe('ONE PATH, HIS — the wizard is the flow and the new screen is gone', () => {
  it('publier.tsx is DELETED, not left unrouted — no second publish path exists', () => {
    expect(() => readFileSync(join(appDir, 'src/v2/publier.tsx'), 'utf8')).toThrow();
    expect(shell).not.toMatch(/SPublier|from '\.\/publier'/);
  });

  it("view 'add' renders SListerReal, which renders HIS S20Wizard — not a new form", () => {
    expect(shell).toMatch(/v\.s === 'add' \?[\s\S]{0,600}<SListerReal st=\{st\} d=\{d\} captures=\{captures\}/);
    // `photos` joined the wizard's props under the founder device ruling
    // (2026-07-26: "able to see all photos taken") — the verify step shows all
    // three SHIPPED derivatives, not the hero alone.
    // `money` joined this line under the founder rounding ruling (2026-07-25):
    // the wizard's seller-net figures are computed by the wrapper through the
    // CANON waterfall, never by the wizard — and under the floor ruling
    // (same day) it is `null` below the publish floor rather than a number for
    // an offer that cannot exist. Both asserted by value in
    // test/preview-rounding.test.ts; asserted here as the wiring.
    expect(lister).toMatch(
      // PIN EVOLVED (LISTER-POUR-1b): the render grew the `fournisseur` aim
      // and went multi-line; the LAW is unchanged — view 'add' renders HIS
      // S20Wizard with his machine state, never a new form.
      /<S20Wizard[\s\S]{0,400}st=\{st\}[\s\S]{0,400}fournisseur=\{\{/,
    );
  });

  it("view 'studio' renders the REAL studio; the demo S26Studio is unrouted but intact", () => {
    expect(shell).toMatch(/v\.s === 'studio' \?[\s\S]{0,600}<S26StudioReal d=\{d\} onApproved=/);
    expect(shell).not.toMatch(/<S26Studio /);
    expect(screens2).toMatch(/export function S26Studio\(/); // the frozen demo survives, unrouted
  });

  it('the capture set AND the listing session are owned by the SHELL — studio and wizard are sibling views', () => {
    expect(shell).toMatch(/const captures = useRef<CaptureSet \| null>\(null\);/);
    expect(shell).toMatch(/const listing = useRef<ListingSession>/);
    expect(shell).toMatch(/onApproved=\{\(set\) => \{ captures\.current = set; \}\}/);
    // …and OPEN_WIZ genuinely clears both — the comment's claim is code now
    // PIN EVOLVED (LISTER-POUR-1b): the session gained `pourFournisseur`,
    // and the reset MUST cover it — product A aimed at another supplier must
    // not silently aim product B there too. The pin now asserts that.
    // PIN EVOLVED AGAIN (VIDEO-PRODUIT-1c): the session gained `video` — a clip
    // picked for product A must not ride product B, so it resets with the rest.
    expect(shell).toMatch(/if \(a\.t === 'OPEN_WIZ'\) \{[\s\S]{0,400}captures\.current = null;[\s\S]{0,400}listing\.current = \{ codeTouched: false, suffixBytes: null, pourFournisseur: '', video: null \};/);
  });

  it('ONE TAP leaves the outcome pane — never four dead taps then a destroyed completion path', () => {
    expect(lister).toMatch(/const exitToProduits = \(\): void => d\(\{ t: 'TAB', tab: 'produits' \}\);/);
    // the outcome pane never dispatches a raw BACK (which would step the hidden wizard four times)
    const pane = lister.slice(lister.indexOf('── the outcome pane'), lister.indexOf("if (pub?.kind === 'sending')"));
    expect(pane).not.toMatch(/d\(\{ t: 'BACK' \}\)/);
  });

  it('media unconfigured + photos taken is an HONEST banner, never silence under a success line', () => {
    expect(lister).toMatch(/mediaService === null \? \(/);
    expect(lister).toMatch(/t\('publier\.photos_non_config'\)/);
  });

  it('the aperçu shows the ASSIGNED hero when one exists — demo chrome makes no claim over real photos', () => {
    // STUDIO-BATCH-1: the square crop renders at PUBLISH (the hero is chosen on
    // the verify step), so the aperçu shows the assigned hero's whole
    // derivative — real bytes, never the glyph tile, never a master.
    expect(lister).toMatch(/const heroUri = set === null \|\| heroIdx === null \? undefined : set\.photos\[heroIdx\]\?\.derivative\.uri;/);
    expect(screens2).toMatch(/heroUri !== undefined \? \(/);
  });

  /**
   * FOUNDER DEVICE RULING 2026-07-26 — *"on vérifier et publier screen I want
   * everything well detailed and able to see all photos taken"*.
   */
  it('the verify step shows EVERY photograph with its ROLE CHIP, and they are the SHIPPED bytes', () => {
    // each photo renders its stripped derivative under its assigned role's
    // catalog label, with the swap callback — never a master, which never
    // leaves the phone (STUDIO-BATCH-1, founder 2026-07-27: roles chosen here).
    expect(lister).toMatch(/label: t\(roleChipKey\(assigned\[i\]!\)\)/);
    expect(lister).toMatch(/uri: p\.derivative\.uri/);
    expect(lister).toMatch(/onRole: \(\) => setRoles\(swapToNext\(assigned, i\)\)/);
    expect(lister).not.toMatch(/uri: p\.masterUri/);
    // and NOTHING is claimed when the Studio has not run
    expect(lister).toMatch(/set === null \|\| assigned === null\s*\?\s*undefined/);
    expect(screens2).toMatch(/photos !== undefined && photos\.length > 0/);
  });

  it('the verify step details every value he typed, each on its own labelled row', () => {
    for (const label of ['Catégorie', 'Code produit', 'Stock disponible', 'Prix de base']) {
      expect(screens2, `verify row missing: ${label}`).toContain(`'${label}'`);
    }
    // EVOLVED (CAPTURE-PAR-CATEGORIE-1): the variantes row no longer carries a
    // literal label — it wears the CATEGORY'S label (Pointures, Coupe ou
    // motif…), the same key the step-1 field uses, so recap and field can
    // never disagree about what the free text means.
    expect(screens2, 'verify variantes row missing').toContain(
      "[tr(varianteChamp(w.cat).labelKey), w.sizes.trim() === '' ? '—' : w.sizes]",
    );
    // AND the step-1 FIELD wears the same category label + its example
    // (verifier N1: pinning only the recap left « recap agrees with the field »
    // half-tested — a state where the two disagree was green).
    expect(screens2, 'step-1 variantes field is not category-aware').toContain(
      'label={tr(varianteChamp(w.cat).labelKey)}',
    );
    expect(screens2, 'step-1 variantes example is not category-aware').toContain(
      'tr(varianteChamp(w.cat).exempleKey)',
    );
  });
});

describe('THE INTERCEPTOR — the real publish, and the frozen rules never reached', () => {
  it('WIZ_NEXT at step 4 runs the REAL publish and never reaches the machine (no demo board write)', () => {
    expect(lister).toMatch(/a\.t === 'WIZ_NEXT' && st\.wiz\.step === 4/);
    expect(lister).toMatch(/void onPublish\(\);\s*\/\/ the REAL write/);
  });

  it('the machine still gates step 1 on an EMPTY NAME and EMPTY ZONE — §9.5 unreachable via the footer', () => {
    // BY VALUE, not by source shape (device incident 2026-07-26: the old
    // source regex asserted zone INSIDE the gate while the screen had lost the
    // only way to fill it — a Continue that could never enable, green in CI).
    // Drive the real reducer: name alone must open step 1; no zone anywhere.
    let s = reduce(initialState(), { t: 'OPEN_WIZ' }).s;
    s = reduce(s, { t: 'WIZ_NEXT' }).s; // step 0 → 1 (category has a default)
    expect(s.wiz.step).toBe(1);
    s = reduce(s, { t: 'WIZ_SET', patch: { name: 'Pagne jolie' } }).s;
    expect(s.wiz.zone.trim()).toBe(''); // the screen can no longer set it
    s = reduce(s, { t: 'WIZ_NEXT' }).s;
    expect(s.wiz.step).toBe(2); // Continue works WITHOUT a zone
    // and the name requirement still gates: an empty name stays on step 1
    let bare = reduce(initialState(), { t: 'OPEN_WIZ' }).s;
    bare = reduce(bare, { t: 'WIZ_NEXT' }).s;
    bare = reduce(bare, { t: 'WIZ_NEXT' }).s;
    expect(bare.wiz.step).toBe(1);
    // …and the frozen rule itself is UNEDITED
    expect(machine).toMatch(/'Robe brodée bogolan'/);
  });

  it('the product code fills from the name while untouched and stops on first edit', () => {
    expect(lister).toMatch(/a\.t === 'WIZ_SET' && 'code' in a\.patch[\s\S]{0,140}session\.current\.codeTouched = true/);
    expect(lister).toMatch(/suggestProductCode\(name, session\.current\.suffixBytes\)/);
    expect(lister).not.toMatch(/Math\.random/);
  });

  it('ids are minted once per attempt via retainIdentity — a retry cannot create a second product', () => {
    expect(lister).toMatch(/identity\.current = retainIdentity\(identity\.current, mintCommandId\)/);
    expect(lister).not.toMatch(/commandId: mintCommandId\(\)/);
  });

  it('the guard is a REF released in a finally — no dead button after a throw', () => {
    expect(lister).toMatch(/if \(inFlight\.current\) return;/);
    const releases = [...lister.matchAll(/inFlight\.current = false;/g)];
    expect(releases.length).toBeGreaterThanOrEqual(2); // publish + completion, each in a finally
    expect(lister).toMatch(/\} finally \{\s*\n\s*inFlight\.current = false;/);
  });
});

describe('WIZARD STEP 1 — the founder-ruled fields, inside his step, no sixth step', () => {
  it('collects the product code (derived, visible, editable) with the aide line', () => {
    expect(screens2).toMatch(/tr\('publier\.champ_code'\)/);
    expect(screens2).toMatch(/tr\('publier\.champ_code_aide'\)/);
    expect(screens2).toMatch(/patch: \{ code: t \}/);
  });

  /**
   * FOUNDER DEVICE RULING 2026-07-26 — *"in the product listing flow remove the
   * Quartier"*. This REVERSES the 2026-07-25 reversal: the zone is a property
   * of his BOUTIQUE, not of each product, and asking it once per listing taxed
   * every product he adds.
   */
  it('does NOT ask for the Quartier — it is boutique data, not per-product data', () => {
    expect(screens2).not.toMatch(/tr\('publier\.champ_zone'\)/);
    expect(screens2).not.toMatch(/patch: \{ zone: t \}/);
  });

  it('and the published record still CARRIES a zone — canon requires one, so it comes from the seller', () => {
    expect(lister).toMatch(/zone: SUPPLIER_ZONE/);
    expect(SUPPLIER_ZONE.trim().length).toBeGreaterThan(0);
  });

  it('the wizard still has FIVE steps — nothing grew', () => {
    expect(screens2).toMatch(/wizardCounter=\{`\$\{w\.step \+ 1\}\/5`\}/);
    expect(screens2).toMatch(/<ProgressDots total=\{5\} step=\{w\.step\} \/>/);
  });
});

describe('PHOTOGRAPHS — honest all the way through', () => {
  it('the master is HASHED FROM ITS OWN BYTES and never uploaded (open read route vs « master private »)', () => {
    // BOUTIK-WEB-W2: the read goes through the platform seam (`uri-bytes.ts` /
    // `.web.ts`) — same bytes, read by the platform's own reader.
    expect(lister).toMatch(/await sha256Hex\(await bytesFromUri\(hero\.masterUri\)\)/);
    expect(lister).toMatch(/private\/device\/\$\{bytes\.masterSha256\}/);
    // the derivative is never passed off as the master
    expect(lister).not.toMatch(/masterSha256: await sha256Hex\(derivativeBytesFromUri\(set\.hero/);
  });

  it('what uploads is what he SAW — proof/detail bytes decode from the previewed data URIs, by ASSIGNED role', () => {
    expect(lister).toMatch(/derivativeBytesFromUri\(set\.photos\[order\.preuve\]!\.derivative\.uri\)/);
    expect(lister).toMatch(/order\.details\.map\(\(i\) => derivativeBytesFromUri\(set\.photos\[i\]!\.derivative\.uri\)\)/);
  });

  it('partial uploads publish WITHOUT assets and the outcome pane offers completion — never a truncated set', () => {
    expect(lister).toMatch(/leftover = \{ uploads, bytes \}; \/\/ publish without photos; complete after/);
    expect(lister).toMatch(/t\('publier\.photos_manquantes'\)/);
    expect(lister).toMatch(/onCompletePhotos/);
  });

  it('completion retries ONLY the failed roles and attaches with a STABLE command id (idempotent)', () => {
    expect(lister).toMatch(/u\.ok \? u : uploadRole\(mediaService, bytes\)/);
    expect(lister).toMatch(/commandId: `\$\{identity\.current\.commandId\}-assets`/);
  });

  it('the ASSIGNED hero is cropped square + vertical AT PUBLISH — once, from the master\'s own dimensions', () => {
    // THE DIMENSIONS ARE THE FINDING (verifier, HIGH): a rect computed from the
    // DERIVATIVE's dimensions but applied to the master ships an off-centre
    // corner fragment on every real camera. The crop MUST be computed from the
    // master's OWN dimensions — pinned to the exact argument text. MOVED with
    // the crops (STUDIO-BATCH-1): they render in lister-real's publish, where
    // the assigned hero is finally known; the collect studio crops nothing.
    expect(lister).toMatch(/renderCropDerivative\(hero\.masterUri, heroSquareCrop\(hero\.master\.width, hero\.master\.height\)\)/);
    expect(lister).toMatch(/renderCropDerivative\(hero\.masterUri, heroVerticalCrop\(hero\.master\.width, hero\.master\.height\)\)/);
    expect(lister).not.toMatch(/heroSquareCrop\(hero\.derivative/);
    expect(studio).not.toMatch(/renderCropDerivative/);
    // BOUTIK-WEB-W2: the camera moved WITH its screen into the NATIVE shoot
    // file — the assertion moved with it, not away (the removal-turnaround law
    // applies to moves too).
    expect(shootNative).toMatch(/<CameraView ref=\{camera\}/); // a REAL camera in his C39 frame
    expect(studio).not.toMatch(/STUDIO_CAPTURE/); // the demo's simulated capture is not dispatched
  });

  /**
   * REWRITTEN 2026-07-25 — this used to match the SOURCE TEXT of the call pair
   * (`onApproved(phase.set); d({t:'STUDIO_APPROVE'})`). A source-shape
   * assertion breaks on any refactor and proves nothing about the transition,
   * which is the class the founder ruled against: *a decision that renders
   * differently should be a function that returns a value.* The transition IS
   * a value — it lives in the reducer — so it is asserted there, and the screen
   * is only checked for what a grep can honestly check: an ABSENCE.
   */
  it('§4 OWNS THE TRANSITION — the reducer, not the screen, sets wiz.photos and the return view', () => {
    const before = initialState();
    expect(before.wiz.photos).toBe(false);
    const after = reduce(before, { t: 'STUDIO_APPROVE' }).s;
    expect(after.wiz.photos).toBe(true);
    expect(after.wiz.step).toBe(3);
    expect(after.view).toEqual({ s: 'add' });
  });

  it('the studio DISPATCHES that action and keeps no parallel copy of the transition', () => {
    expect(studio).toMatch(/d\(\{ t: 'STUDIO_APPROVE' \}\)/);
    // it must never write the wizard's state itself — that is the parallel copy
    expect(studio).not.toMatch(/wiz\s*:/);
    expect(studio).not.toMatch(/photos\s*:\s*true/);
  });
});

describe('every user-facing string on the new surfaces is catalog-backed', () => {
  it('every t(...) key used by the wrapper and the studio exists in the catalog', () => {
    const used = [
      ...[...lister.matchAll(/[^r]t\('([^']+)'\)/g)].map((m) => m[1] as string),
      ...[...studio.matchAll(/[^r]t\('([^']+)'\)/g)].map((m) => m[1] as string),
      // BOUTIK-WEB-W2: the shooting screen split per platform — BOTH halves
      // stay under the catalog scan, or the web surface drifts out of Law 6.
      ...[...shootNative.matchAll(/[^r]t\('([^']+)'\)/g)].map((m) => m[1] as string),
      ...[...shootWeb.matchAll(/[^r]t\('([^']+)'\)/g)].map((m) => m[1] as string),
    ];
    expect(used.length).toBeGreaterThan(12);
    const missing = used.filter((k) => !keys.has(k));
    expect(missing, `missing catalog keys: ${missing.join(', ')}`).toEqual([]);
  });

  /**
   * DERIVED, NOT RESTATED (verifier finding, MEDIUM). This used to enumerate the
   * FieldError members as a hardcoded list — so when the commission ruling added
   * a ninth, the list silently covered 8 of 9 and a typo'd catalog key on the new
   * member would have passed. That matters: `t()` THROWS on a missing key
   * (`src/i18n.ts`), and there is no error boundary, so the failure is a blank
   * screen mid-listing rather than a wrong word.
   *
   * Now every member is read out of `ERROR_KEY` itself, and the union's own size
   * is pinned separately — so adding a member without a string, or with a bad
   * string, fails here rather than on his phone.
   */
  it('every FieldError maps to a real catalog string — members derived from the map, not restated', () => {
    const mapBlock = lister.slice(lister.indexOf('const ERROR_KEY'), lister.indexOf('};', lister.indexOf('const ERROR_KEY')));
    const pairs = [...mapBlock.matchAll(/^\s*(\w+):\s*'([^']+)',/gm)].map((m) => [m[1] as string, m[2] as string] as const);
    expect(pairs.length, 'ERROR_KEY entries found').toBeGreaterThan(0);
    for (const [member, key] of pairs) {
      expect(keys.has(key), `${member} -> ${key}`).toBe(true);
    }
    // and the map is EXHAUSTIVE over the union — the count is read from the
    // source of truth, so a member added to FieldError without a mapping fails
    const union = readFileSync(join(appDir, 'src/supply/authoring.ts'), 'utf8');
    const unionStart = union.indexOf('export type FieldError');
    const unionBlock = union.slice(unionStart, union.indexOf(';', unionStart));
    const members = [...unionBlock.matchAll(/^\s*\|\s*'(\w+)'/gm)].map((m) => m[1] as string);
    expect(members.length, 'FieldError members').toBeGreaterThan(1);
    expect(pairs.map(([m]) => m).sort()).toEqual(members.sort());
  });

  it('only the http cause claims the service answered; network and device get their own designed states', () => {
    expect(lister).toMatch(/pub\.cause === 'network' \?[\s\S]{0,120}t\('publier\.echec_reseau'\)/);
    expect(lister).toMatch(/pub\.cause === 'device' \?[\s\S]{0,120}t\('publier\.echec_appareil'\)/);
    // PIN EVOLVED (LISTER-POUR-1b): http failures now route through
    // `cleEchecHttp` so `unknown_supplier` speaks its own catalog sentence;
    // the LAW is unchanged — only the http cause claims the service answered.
    expect(lister).toMatch(/pub\.cause === 'http' \? cleEchecHttp\(pub\.reason\) : 'publier\.echec_illisible'/);
  });

  it('an idempotent answer does NOT render the plain success line', () => {
    expect(lister).toMatch(/pub\.alreadyRegistered \?[\s\S]{0,160}t\('publier\.deja_enregistre'\)/);
    expect([...lister.matchAll(/t\('publier\.publie'\)/g)]).toHaveLength(1);
  });

  it('« non configuré » is a CONDITION shown before he types, tone info, with a way back', () => {
    expect(lister).toMatch(/if \(offerService === null\) \{[\s\S]{0,700}<Banner tone="info">\{t\('publier\.non_configure'\)\}<\/Banner>/);
  });
});

describe('the demo adapter stays out of reach', () => {
  it('neither new surface imports the demo module', () => {
    expect(lister).not.toMatch(/from '\.\.\/supply\/demo'|DemoSupplyService/);
    expect(studio).not.toMatch(/from '\.\.\/supply\/demo'|DemoSupplyService/);
  });
});
