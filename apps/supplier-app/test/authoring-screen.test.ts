import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
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
    // `money` joined this line under the founder rounding ruling (2026-07-25):
    // the wizard's seller-net figures are computed by the wrapper through the
    // CANON waterfall, never by the wizard — and under the floor ruling
    // (same day) it is `null` below the publish floor rather than a number for
    // an offer that cannot exist. Both asserted by value in
    // test/preview-rounding.test.ts; asserted here as the wiring.
    expect(lister).toMatch(
      /return <S20Wizard st=\{st\} d=\{dd\} money=\{money\} heroUri=\{captures\.current\?\.heroSquare\.uri\} \/>;/,
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
    expect(shell).toMatch(/if \(a\.t === 'OPEN_WIZ'\) \{\s*\n\s*captures\.current = null;\s*\n\s*listing\.current = \{ codeTouched: false, suffixBytes: null \};/);
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

  it('the step-4 aperçu shows the REAL heroSquare when one exists — demo chrome makes no claim over real photos', () => {
    expect(lister).toMatch(/heroUri=\{captures\.current\?\.heroSquare\.uri\}/);
    expect(screens2).toMatch(/heroUri !== undefined \? \(/);
  });
});

describe('THE INTERCEPTOR — the real publish, and the frozen rules never reached', () => {
  it('WIZ_NEXT at step 4 runs the REAL publish and never reaches the machine (no demo board write)', () => {
    expect(lister).toMatch(/a\.t === 'WIZ_NEXT' && st\.wiz\.step === 4/);
    expect(lister).toMatch(/void onPublish\(\);\s*\/\/ the REAL write/);
  });

  it('the machine still gates step 1 on an EMPTY NAME and EMPTY ZONE — §9.5 unreachable via the footer', () => {
    expect(machine).toMatch(/s\.wiz\.step === 1 && \(s\.wiz\.name\.trim\(\) === '' \|\| s\.wiz\.zone\.trim\(\) === ''\)/);
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

  it('collects the ZONE — he chooses it per listing (founder reversal), label from his design family', () => {
    expect(screens2).toMatch(/tr\('publier\.champ_zone'\)/);
    expect(screens2).toMatch(/patch: \{ zone: t \}/);
    const entry = catalog.find((e) => e.key === 'publier.champ_zone');
    expect((entry as { fr: string }).fr).toBe('Quartier'); // the onboarding's own label family
  });

  it('the wizard still has FIVE steps — nothing grew', () => {
    expect(screens2).toMatch(/wizardCounter=\{`\$\{w\.step \+ 1\}\/5`\}/);
    expect(screens2).toMatch(/<ProgressDots total=\{5\} step=\{w\.step\} \/>/);
  });
});

describe('PHOTOGRAPHS — honest all the way through', () => {
  it('the master is HASHED FROM ITS OWN BYTES and never uploaded (open read route vs « master private »)', () => {
    expect(lister).toMatch(/await sha256Hex\(await new File\(set\.hero\.masterUri\)\.bytes\(\)\)/);
    expect(lister).toMatch(/private\/device\/\$\{bytes\.masterSha256\}/);
    // the derivative is never passed off as the master
    expect(lister).not.toMatch(/masterSha256: await sha256Hex\(derivativeBytesFromUri\(set\.hero/);
  });

  it('what uploads is what he SAW — proof/detail bytes decode from the previewed data URI', () => {
    expect(lister).toMatch(/derivativeBytesFromUri\(set\.proof\.derivative\.uri\)/);
    expect(lister).toMatch(/derivativeBytesFromUri\(set\.detail\.derivative\.uri\)/);
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

  it('the studio crops the ONE hero into square + vertical during REAL processing — no fourth capture', () => {
    // THE DIMENSIONS ARE THE FINDING (verifier, HIGH): a rect computed from the
    // DERIVATIVE's dimensions but applied to the master ships an off-centre
    // corner fragment on every real camera. The crop MUST be computed from the
    // master's OWN dimensions — pinned to the exact argument text.
    expect(studio).toMatch(/renderCropDerivative\(hero\.masterUri, heroSquareCrop\(hero\.master\.width, hero\.master\.height\)\)/);
    expect(studio).toMatch(/renderCropDerivative\(hero\.masterUri, heroVerticalCrop\(hero\.master\.width, hero\.master\.height\)\)/);
    expect(studio).not.toMatch(/heroSquareCrop\(hero\.derivative/);
    expect(studio).toMatch(/<CameraView ref=\{camera\}/); // a REAL camera in his C39 frame
    expect(studio).not.toMatch(/STUDIO_CAPTURE/); // the demo's simulated capture is not dispatched
  });

  it('studio approval goes through the MACHINE’s own STUDIO_APPROVE — §4 owns the transition', () => {
    expect(studio).toMatch(/onApproved\(phase\.set\);\s*\n\s*d\(\{ t: 'STUDIO_APPROVE' \}\);/);
  });
});

describe('every user-facing string on the new surfaces is catalog-backed', () => {
  it('every t(...) key used by the wrapper and the studio exists in the catalog', () => {
    const used = [
      ...[...lister.matchAll(/[^r]t\('([^']+)'\)/g)].map((m) => m[1] as string),
      ...[...studio.matchAll(/[^r]t\('([^']+)'\)/g)].map((m) => m[1] as string),
    ];
    expect(used.length).toBeGreaterThan(12);
    const missing = used.filter((k) => !keys.has(k));
    expect(missing, `missing catalog keys: ${missing.join(', ')}`).toEqual([]);
  });

  it('every FieldError maps to a real catalog string', () => {
    const mapBlock = lister.slice(lister.indexOf('const ERROR_KEY'), lister.indexOf('};', lister.indexOf('const ERROR_KEY')));
    for (const member of ['name_required', 'product_code_required', 'category_required', 'zone_required', 'base_price_invalid', 'base_price_below_floor', 'commission_invalid', 'available_invalid']) {
      const m = new RegExp(`${member}:\\s*'([^']+)'`).exec(mapBlock);
      expect(m, member).not.toBeNull();
      expect(keys.has((m as RegExpExecArray)[1] as string), member).toBe(true);
    }
  });

  it('only the http cause claims the service answered; network and device get their own designed states', () => {
    expect(lister).toMatch(/pub\.cause === 'network' \?[\s\S]{0,120}t\('publier\.echec_reseau'\)/);
    expect(lister).toMatch(/pub\.cause === 'device' \?[\s\S]{0,120}t\('publier\.echec_appareil'\)/);
    expect(lister).toMatch(/pub\.cause === 'http' \? 'publier\.echec' : 'publier\.echec_illisible'/);
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
