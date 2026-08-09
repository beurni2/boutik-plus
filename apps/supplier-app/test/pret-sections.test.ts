import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { telEnPaires } from '../src/commandes/telephone';

/**
 * PRET-SECTIONS + TEL-PAIRES (founder order 2026-08-09) — « on the prêt à
 * livrer screen … put each one in its section instead of leaving repère
 * section empty from repère information buyer gave and do not make them
 * editable. And also on the phone make spaced after 2 numbers like this
 * 76 16 02 55. »
 *
 * The DEFECT these pins hold shut: the compose fold used to seed zone/repère
 * with `useState(buyer?.contact?.… )` — but it mounts while the buyer row is
 * still loading (DetailPret passes null until its fetch lands), and useState
 * never re-seeds, so the buyer's repère arrived AFTER the seed and the section
 * stayed empty for ever. The fix is structural (no copy into state at all), so
 * the pins assert the STRUCTURE, per this repo's source-discipline idiom.
 */

const appDir = join(import.meta.dirname, '..');
const read = (f: string): string => readFileSync(join(appDir, f), 'utf8');

describe('TEL-PAIRES — the founder’s exact example, displayed', () => {
  it('formats his example verbatim, and pairs partials the same way', () => {
    expect(telEnPaires('76160255')).toBe('76 16 02 55');
    expect(telEnPaires('761602')).toBe('76 16 02');
    expect(telEnPaires('7616025')).toBe('76 16 02 5');
  });

  it('is idempotent and normalizing — an already-spaced number (the PWA now sends them) renders identically', () => {
    expect(telEnPaires('76 16 02 55')).toBe('76 16 02 55');
    expect(telEnPaires('76-16-02-55')).toBe('76 16 02 55');
    expect(telEnPaires('+22676160255').startsWith('+')).toBe(true);
  });
});

describe('PRET-SECTIONS — the buyer’s words reach their sections, read-only, and cannot go stale', () => {
  const confier = read('src/commandes/confier.tsx');
  const screen = read('src/commandes/screen.tsx');

  it('the stale seed is GONE — nothing copies the buyer’s fields into useState', () => {
    // Scanned over CODE, not prose: the comment at the fix quotes the banned
    // pattern on purpose (the same law as the rider app's call-form pin).
    const code = confier.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // eager AND lazy forms — useState(() => buyer…) seeds exactly as stalely
    expect(code).not.toMatch(/useState\((\(\)\s*=>\s*)?buyer/);
  });

  it('what she GAVE derives from the prop at render time — arriving late still lands in its section', () => {
    expect(confier).toMatch(/quartierBrut = buyer\?\.contact\?\.quartier\.trim\(\) \?\? ''/);
    expect(confier).toMatch(/repereDeLaCliente = buyer\?\.contact\?\.repere\.trim\(\) \?\? ''/);
  });

  it('VILLE (founder 2026-08-09) — her quartier carries « , Ouagadougou » unless she named the city herself', () => {
    expect(confier).toMatch(
      /quartierBrut === '' \? '' : \/ouaga\/i\.test\(quartierBrut\) \? quartierBrut : `\$\{quartierBrut\}, Ouagadougou`/,
    );
  });

  it('PRET-SECTIONS-2 (founder 2026-08-09) — the Cliente block keeps the phone and her voice note ONLY', () => {
    // quartier/repère/zoneTo left the block: they live in their own labelled
    // sections in the compose fold; one fact on one card lives in one place.
    const bloc = screen.slice(screen.indexOf("t('commandes.cliente_titre')"), screen.indexOf("etape === 'en_route'"));
    expect(bloc).toContain('telEnPaires(buyer.contact.phone)');
    expect(bloc).toContain('EcouterRepere');
    expect(bloc).not.toContain('buyer.contact.quartier');
    expect(bloc).not.toContain('buyer.contact.repere');
    expect(bloc).not.toContain('row.zoneTo');
  });

  it('a given field renders as TEXT in its labelled section — never an editable Input', () => {
    // the read-only branch: label + value as Text
    // labelled through the SAME Overline idiom the Input uses — one label
    // voice per card, never a snowflake (verifier minor, fixed in-build)
    expect(confier).toMatch(
      /zoneDeLaCliente !== '' \? \(\s*<View style=\{\{ gap: 8 \}\}>\s*<Overline level="card">\{t\('confier\.zone'\)\}<\/Overline>\s*<Text style=\{TITRE\}>\{zoneDeLaCliente\}<\/Text>/,
    );
    expect(confier).toMatch(
      /repereDeLaCliente !== '' \? \(\s*<View style=\{\{ gap: 8 \}\}>\s*<Overline level="card">\{t\('confier\.repere'\)\}<\/Overline>\s*<Text style=\{TITRE\}>\{repereDeLaCliente\}<\/Text>/,
    );
    // and no Input is ever bound to the buyer's own values
    expect(confier).not.toMatch(/<Input[^>]*value=\{zoneDeLaCliente\}/);
    expect(confier).not.toMatch(/<Input[^>]*value=\{repereDeLaCliente\}/);
  });

  it('the typed fallback exists ONLY for what she did not give (voice-only repère; contact-less order)', () => {
    expect(confier).toMatch(/<Input label=\{t\('confier\.zone'\)\} value=\{zoneSaisie\}/);
    expect(confier).toMatch(/<Input label=\{t\('confier\.repere'\)\} value=\{repereSaisi\}/);
  });

  it('the composed task carries the effective values — hers when given, his only in her absence', () => {
    expect(confier).toMatch(/const zone = zoneDeLaCliente !== '' \? zoneDeLaCliente : zoneSaisie;/);
    expect(confier).toMatch(/const repere = repereDeLaCliente !== '' \? repereDeLaCliente : repereSaisi;/);
    // composer still sends zone/landmark from exactly these
    expect(confier).toMatch(/zone: zone\.trim\(\)/);
    expect(confier).toMatch(/landmark: repere\.trim\(\)/);
  });

  it('B1 — the fold is HANDED the live buyer row: the prop the whole fix turns on is pinned at its call site', () => {
    // The verifier mutated this exact prop to `buyer={null}` and 840 tests
    // stayed green while the founder's defect returned in full. The law this
    // file quotes — assert CALL SITES — applied to the one input that matters.
    expect(screen).toMatch(/<ConfierCoursier\s+row=\{row\}\s+buyer=\{typeof buyer === 'object' \? buyer : null\}/);
  });

  it('the cliente phone renders THROUGH the pair formatter (call site, not the function’s existence)', () => {
    expect(screen).toMatch(/<Text style=\{TITRE\}>\{telEnPaires\(buyer\.contact\.phone\)\}<\/Text>/);
    expect(screen).toMatch(/import \{ telEnPaires \} from '\.\/telephone';/);
  });
});
