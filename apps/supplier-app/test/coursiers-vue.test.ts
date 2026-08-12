import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COURSIERS_IDLE,
  acteDemarre,
  acteRegle,
  avisCode,
  avisCodeKey,
  codePillule,
  coursiersVue,
  etatPillule,
  motifRefusRetrait,
  oublierCode,
  refuserActe,
  retraitCoursierAnnule,
  retraitCoursierDemande,
  type CoursiersUi,
} from '../src/coursiers/view';
import { coursierRows } from '../src/coursiers/service';
import type { CoursierRow } from '../src/coursiers/service';
import { t } from '../src/i18n';

const row = (riderId: string, hasCode: boolean, extra?: Partial<CoursierRow>): CoursierRow => ({
  riderId, displayName: riderId, hasCode, certified: true, enService: true, assignable: true, revelable: hasCode, ...extra,
});

describe('SE-LIVE-4e-B+ — what the coursiers desk shows', () => {
  it('has a designed state for every answer, never a blank list', () => {
    expect(coursiersVue({ kind: 'chargement' })?.kind).toBe('chargement');
    expect(coursiersVue({ kind: 'echec' })?.kind).toBe('echec');
    expect(coursiersVue({ kind: 'ok', coursiers: [] })?.kind).toBe('vide');
    expect(coursiersVue({ kind: 'ok', coursiers: [row('r1', false)] })?.kind).toBe('liste');
  });

  it('a refused key never renders as a section — the zone escalates whole', () => {
    expect(coursiersVue({ kind: 'cle_refusee' })).toBeNull();
  });

  it('every message it names is a real catalog string', () => {
    for (const read of [{ kind: 'chargement' }, { kind: 'echec' }, { kind: 'ok', coursiers: [] }] as const) {
      const v = coursiersVue(read);
      const m = v !== null && 'message' in v ? v.message : '';
      expect(t(m), m).not.toBe(m);
    }
    for (const a of ['pret', 'remplace', 'inconnu'] as const) {
      expect(t(avisCodeKey(a))).not.toBe(avisCodeKey(a));
    }
    for (const has of [true, false]) {
      const label = codePillule(row('r', has)).label;
      expect(t(label)).not.toBe(label);
    }
    for (const r of [row('r', false, { certified: false }), row('r', false, { enService: false }), row('r', false)]) {
      const label = etatPillule(r).label;
      expect(t(label)).not.toBe(label);
    }
  });
});

describe('COURSIER-EN-SERVICE — the state pill names the ONE step that unblocks (founder: « aucun coursier disponible » with no reason anywhere)', () => {
  it('not certified leads, whatever the shift says — certification is the founder\'s own act on this desk', () => {
    expect(etatPillule(row('r', false, { certified: false, enService: true }))).toEqual({
      label: 'coursiers.pas_certifie', ton: 'attente',
    });
    expect(etatPillule(row('r', false, { certified: false, enService: false })).label).toBe('coursiers.pas_certifie');
  });

  it('certified but off shift → the rider\'s own act, named', () => {
    expect(etatPillule(row('r', false, { enService: false }))).toEqual({
      label: 'coursiers.pas_en_service', ton: 'attente',
    });
  });

  it('certified and on shift → ready for a course', () => {
    expect(etatPillule(row('r', false))).toEqual({ label: 'coursiers.pret_course', ton: 'ok' });
  });
});

describe('THE DESK IS A JOIN OF TWO ROUTES (the bug the seam test caught)', () => {
  // `GET /ops/riders` carries the registry and NO code state; a separate
  // `GET /ops/rider-codes` says who holds a live code. Reading `hasCode` off
  // the first — which is what I first wrote — marks every rider as codeless and
  // tells the founder minting is safe when it destroys a working code.
  const riders = { riders: [{ riderId: 'rider-issa', displayName: 'Issa', certified: true }] };

  it('marks a rider WITH a live code from the codes projection', () => {
    const out = coursierRows(riders, { codes: [{ riderId: 'rider-issa', mintedAt: '2026-08-08T10:00:00.000Z' }] });
    expect(out[0]?.hasCode).toBe(true);
    expect(out[0]?.mintedAt).toBe('2026-08-08T10:00:00.000Z');
  });

  it('and absent from that projection is FALSE, never « probably yes »', () => {
    expect(coursierRows(riders, { codes: [] })[0]?.hasCode).toBe(false);
  });

  it('reads the shift and assignability the roster route has always sent — absent or odd is FALSE', () => {
    const out = coursierRows(
      { riders: [
        { riderId: 'r-on', certified: true, shift: { status: 'on_shift', startedAt: 'x', confirmedBy: 'server' }, assignable: true },
        { riderId: 'r-off', certified: true, shift: { status: 'off_shift' }, assignable: false },
        { riderId: 'r-naked', certified: true },
      ] },
      { codes: [] },
    );
    expect(out.map((r) => [r.riderId, r.enService, r.assignable])).toEqual([
      ['r-on', true, true],
      ['r-off', false, false],
      ['r-naked', false, false],
    ]);
  });

  it('drops rows that name no rider rather than rendering ghosts', () => {
    const out = coursierRows({ riders: [{ displayName: 'sans id' }, { riderId: '' }] }, { codes: [] });
    expect(out).toEqual([]);
  });

  it('survives a malformed answer instead of blanking the desk', () => {
    for (const bad of [null, 'nope', 42, {}, { riders: 'no' }]) {
      expect(coursierRows(bad, null)).toEqual([]);
    }
  });
});

describe('the warning comes BEFORE the tap', () => {
  const roster = [row('rider-issa', true), row('rider-awa', false)];

  it('says a new code kills the one the rider is using', () => {
    // A rider mid-course whose code is replaced cannot verify a pickup or
    // register a seal — they are locked out of their own custody acts.
    expect(avisCode(roster, 'rider-issa')).toBe('remplace');
    expect(t(avisCodeKey('remplace'))).toContain('remplace');
  });

  it('names an unregistered id before the server has to refuse it', () => {
    expect(avisCode(roster, 'rider-typo')).toBe('inconnu');
  });

  it('and tolerates the whitespace a paste actually carries', () => {
    expect(avisCode(roster, '  rider-awa  ')).toBe('pret');
  });
});

describe('a live one-time code blocks every other act', () => {
  it('refuses the next act while the code is on screen, and says why', () => {
    const showing = acteRegle(
      acteDemarre(COURSIERS_IDLE, 'mint') as never,
      'mint',
      { ok: true, riderId: 'rider-awa', code: 'SR-AAAA-BBBB-CCCC' },
    );
    expect(showing.nouveau?.code).toBe('SR-AAAA-BBBB-CCCC');
    expect(refuserActe(showing)).toBe('coursiers.notez_dabord');
    expect(acteDemarre(showing, 'revoke:rider-issa')).toBeNull();
    expect(refuserActe(oublierCode(showing))).toBeNull();
  });

  it('refuses a second act while one is in flight', () => {
    const busy = acteDemarre(COURSIERS_IDLE, 'mint') as never;
    expect(refuserActe(busy)).toBe('coursiers.un_acte');
    expect(acteDemarre(busy, 'mint')).toBeNull();
  });

  it('a late answer cannot resurrect a card he already dismissed', () => {
    const busy = acteDemarre(COURSIERS_IDLE, 'mint') as never;
    const gone = oublierCode(acteRegle(busy, 'mint', { ok: true, riderId: 'r', code: 'SR-1' }));
    expect(acteRegle(gone, 'mint', { ok: true, riderId: 'r', code: 'SR-1' }).nouveau).toBeNull();
  });

  it('a failure names its own act, so the wrong card cannot light up', () => {
    const busy = acteDemarre(COURSIERS_IDLE, 'revoke:mint') as never;
    expect(acteRegle(busy, 'revoke:mint', { ok: false }).echec).toBe('revoke:mint');
  });
});

describe('RETIRER-COURSIER — the armed question, in the pure logic', () => {
  /**
   * The screen hides the armed question behind « Retrait en cours… » while the
   * act is in flight, so these rules are not visible to a walk. They are the
   * DEFENCE IN DEPTH this file already keeps for the code card: the same rule
   * held in the pure state, so a future branch that reads `demandeRetrait`
   * cannot resurrect a button that does nothing.
   */
  it('the removal closes ITS OWN question when the act starts — but not another rider’s', () => {
    const arme = retraitCoursierDemande(COURSIERS_IDLE, 'rider-boss') as CoursiersUi;
    expect(arme.demandeRetrait).toBe('rider-boss');

    const enVol = acteDemarre(arme, 'retire:rider-boss') as CoursiersUi;
    expect(enVol.busy).toBe('retire:rider-boss');
    expect(enVol.demandeRetrait, 'the armed « Oui, le retirer » survived its own act').toBeNull();

    // Another rider's question is not this act's business.
    const autre = acteDemarre(arme, 'retire:rider-issa') as CoursiersUi;
    expect(autre.demandeRetrait).toBe('rider-boss');
    const mint = acteDemarre(arme, 'mint') as CoursiersUi;
    expect(mint.demandeRetrait).toBe('rider-boss');
  });

  it('a refusal keeps the server’s own word, so the screen can name it', () => {
    const enVol = acteDemarre(retraitCoursierDemande(COURSIERS_IDLE, 'rider-boss') as CoursiersUi, 'retire:rider-boss') as CoursiersUi;
    const refuse = acteRegle(enVol, 'retire:rider-boss', { ok: false, motif: 'rider_carrying' });
    expect(refuse.motifRetrait).toBe('rider_carrying');
    expect(refuse.demandeRetrait, 'a refused removal must not leave the question armed').toBeNull();
    expect(motifRefusRetrait(refuse.motifRetrait ?? '')).toBe('coursiers.retrait_en_course');
    expect(motifRefusRetrait('unknown_rider')).toBe('coursiers.retrait_inconnu');
    // Anything the desk does not know a sentence for is still a removal
    // failure, never the carrying one — a wrong instruction is worse than a
    // plain one.
    expect(motifRefusRetrait('quelque_chose_de_neuf')).toBe('coursiers.retrait_echec');
  });

  it('the question cannot be armed while another act is in flight', () => {
    const busy = acteDemarre(COURSIERS_IDLE, 'mint') as CoursiersUi;
    expect(retraitCoursierDemande(busy, 'rider-boss')).toBeNull();
    expect(retraitCoursierAnnule(retraitCoursierDemande(COURSIERS_IDLE, 'rider-boss') as CoursiersUi).demandeRetrait).toBeNull();
  });

  it('the removal ASSERTS the custody bound — Séra refuses 428 without it', () => {
    // SE-I04: « task status alone MUST NOT be custody truth ». Clearing the
    // board erases the assignment row while the parcel stays in someone's
    // hands, so the door will not act on the book alone. The screen asks the
    // question; this is the call site that must carry his answer.
    const service = readFileSync(join(__dirname, '../src/coursiers/service.ts'), 'utf8');
    const appel = service.slice(service.indexOf("'/ops/riders/remove'"));
    expect(appel.slice(0, 200), 'the removal call dropped the custody assertion').toContain('custodyNotBegun: true');
  });
});

describe('the Séra ops key is never bundled and never logged', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'src/coursiers/service.ts'), 'utf8');
  const zone = readFileSync(join(import.meta.dirname, '..', 'src/coursiers/zone.tsx'), 'utf8');

  it('there is no EXPO_PUBLIC_* for the key — only the public base URL', () => {
    // An EXPO_PUBLIC_* is inlined into the shipped bundle, and these repos are
    // public. SERA_OPS_SECRET opens the rider registry AND the SOS board.
    const publics = [...src.matchAll(/EXPO_PUBLIC_[A-Z0-9_]+/g)].map((m) => m[0]);
    expect([...new Set(publics)]).toEqual(['EXPO_PUBLIC_SERA_LOGISTICS_BASE']);
    expect(zone).not.toMatch(/EXPO_PUBLIC_SERA_OPS|EXPO_PUBLIC_.*SECRET/);
  });

  it('the key rides the Authorization header, never a query string', () => {
    expect(src).toMatch(/Authorization: `Bearer \$\{cle\}`/);
    expect(src, 'a key in the URL lands in logs and history').not.toMatch(/[?&](cle|key|token)=/);
  });

  it('nothing logs it', () => {
    for (const f of [src, zone]) expect(f).not.toMatch(/console\.\w+\(/);
  });

  it('unset base resolves to NOTHING, never a demo registry', () => {
    // A console showing invented riders would send him minting codes for
    // people who do not exist.
    expect(src).toMatch(/if \(trimmed === '' \|\| cle\.trim\(\) === ''\) return null;/);
    // Comments STRIPPED before the scan: the docblock says « never to demo »,
    // and prose describing the rule kept failing the rule. Same self-inflicted
    // trap as the rider app's; assert on code, never on what is written about it.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code, 'a demo fallback in the resolver').not.toMatch(/demo|sandbox|fixture/i);
  });
});

describe('the one-time code takes the whole screen (founder: « the screen becomes confusing »)', () => {
  // Comments STRIPPED first: the docblock explaining this fix quotes the very
  // pattern the scan forbids. Same self-inflicted trap as the resolver scan
  // above — assert on CODE, never on prose written about the code.
  const zone = readFileSync(join(import.meta.dirname, '..', 'src/coursiers/zone.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\/.*$/gm, '');

  const at = (needle: string): number => {
    const i = zone.indexOf(needle);
    // A mutation that did not apply is not a passing test: prove the anchor
    // matched before any index comparison is allowed to mean anything.
    expect(i, `anchor never matched, so this test proves nothing: ${needle}`).toBeGreaterThan(-1);
    return i;
  };

  it('returns early on a live code, before the roster or the form can render', () => {
    // The founder minted a code and got a screen with TWO full-width primary
    // greens: « C'est noté » and, right under it, « Donner un code » — which
    // would have destroyed the code he was holding. Now the desk steps aside.
    const early = at('if (ui.nouveau !== null) {');
    const noteButton = at("t('coursiers.note')");
    const roster = at('vue.coursiers.map(');
    const form = at("t('coursiers.inscrire_titre')");

    expect(zone.slice(early, early + 200), 'the guard must RETURN, not merely branch').toContain('return (');
    expect(noteButton, 'the code card belongs inside the early return').toBeGreaterThan(early);
    expect(roster, 'the roster must not render beside a live code').toBeGreaterThan(noteButton);
    expect(form, 'the registration form must not render beside a live code').toBeGreaterThan(noteButton);
  });

  it('no button dies in silence: the refusal is spoken, never an early return', () => {
    // Every onPress used to open with `if (bloque) return` — a tap that did
    // nothing and said nothing. `lancer` refuses through refuserActe, which
    // sets a banner the founder can read.
    expect(zone, 'a silent guard is what made the screen unreadable').not.toMatch(/if \(bloque\)/);
    expect(zone).not.toMatch(/const bloque =/);
    expect(zone, 'the spoken refusal path must still exist').toContain('refuserActe(ui)');
  });

  it('the registration form is cleared only when a code actually came back', () => {
    // A form still holding the name he just registered reads as « it did not
    // work » and invites a second submit — which destroys the fresh code.
    const clear = at("setNouvelId('')");
    const guard = zone.lastIndexOf("if (a.kind === 'ok')", clear);
    expect(guard, 'the clear must sit behind an ok check, never run unconditionally').toBeGreaterThan(-1);
  });
});
