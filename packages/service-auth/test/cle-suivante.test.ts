import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BEARER_HEADER,
  BEARER_PREFIX,
  WRITE_KEY_HEADER,
  bearerAuthorizedAgainst,
  keyAuthorizedAgainst,
  rejectUnauthorizedBearer,
  rejectUnauthorizedWriteAgainst,
  unauthorized,
} from '../src/index.js';

/**
 * A KEY CHANGES WITH NO GAP (Execution Contract §11, « overlapping windows »).
 *
 * Every gate checks its key `X` and, while it is set, `X_NEXT`: the presented
 * value passes iff (X non-empty AND equal) OR (X_NEXT non-empty AND equal).
 * The change is: set X_NEXT beside X · move the sender · put the new value in
 * X · delete X_NEXT. Nothing stops at any step.
 *
 * Locked here for BOTH shared gates (the X-Write-Key one and the Bearer one),
 * because every Worker door is one of the two:
 *   · the truth table, step by step through a change;
 *   · BOTH compares run on every call, whatever the first one found — counted
 *     at the platform's HMAC, the host boundary the compare test already uses;
 *   · the next compare is the same constant-time fold, byte by byte;
 *   · one identical 401, whichever value was wrong.
 */

const ANCIENNE = 'test-cle-ancienne-b11';
const NOUVELLE = 'test-cle-nouvelle-b11';
const AUTRE = 'test-cle-autre-b11';

type Gate = (request: Request, secret: string | undefined, next: string | undefined) => Promise<boolean>;
type Rejet = (request: Request, secret: string | undefined, next: string | undefined) => Promise<Response | null>;

interface Porte {
  readonly nom: string;
  /** `null` = no header at all. */
  readonly avec: (valeur: string | null) => Request;
  readonly autorise: Gate;
  readonly rejette: Rejet;
}

const PORTES: readonly Porte[] = [
  {
    nom: 'the X-Write-Key gate',
    avec: (v) =>
      new Request('https://svc.test/x', { method: 'POST', body: 'x', ...(v === null ? {} : { headers: { [WRITE_KEY_HEADER]: v } }) }),
    autorise: keyAuthorizedAgainst,
    rejette: rejectUnauthorizedWriteAgainst,
  },
  {
    nom: 'the Bearer gate',
    avec: (v) => new Request('https://svc.test/x', v === null ? {} : { headers: { [BEARER_HEADER]: `${BEARER_PREFIX}${v}` } }),
    autorise: bearerAuthorizedAgainst,
    rejette: rejectUnauthorizedBearer,
  },
];

/** [what is presented (null = no header), X, X_NEXT, passes?] */
type Ligne = readonly [string | null, string | undefined, string | undefined, boolean];

const PENDANT: Record<string, Ligne> = {
  'during a change, the old value passes': [ANCIENNE, ANCIENNE, NOUVELLE, true],
  'during a change, the next value passes': [NOUVELLE, ANCIENNE, NOUVELLE, true],
  'during a change, any other value is refused': [AUTRE, ANCIENNE, NOUVELLE, false],
  'during a change, a prefix of the next value is refused': [NOUVELLE.slice(0, -1), ANCIENNE, NOUVELLE, false],
  'during a change, the next value with one more character is refused': [`${NOUVELLE}x`, ANCIENNE, NOUVELLE, false],
  'during a change, an empty value is refused': ['', ANCIENNE, NOUVELLE, false],
  'during a change, no header is refused': [null, ANCIENNE, NOUVELLE, false],
  'a next value STORED with a newline never matches (the header is trimmed, the env is not)': [NOUVELLE, ANCIENNE, `${NOUVELLE}\n`, false],
};

const VIDES: Record<string, Ligne> = {
  'X unset, X_NEXT set: the next value passes': [NOUVELLE, undefined, NOUVELLE, true],
  'X empty, X_NEXT set: the next value passes': [NOUVELLE, '', NOUVELLE, true],
  'X unset, X_NEXT set: an empty value is refused': ['', undefined, NOUVELLE, false],
  'X empty, X_NEXT set: an empty value is refused': ['', '', NOUVELLE, false],
  'X set, X_NEXT unset: an empty value is refused': ['', ANCIENNE, undefined, false],
  'X set, X_NEXT empty: an empty value is refused': ['', ANCIENNE, '', false],
  'X set, X_NEXT unset: no header is refused': [null, ANCIENNE, undefined, false],
  'both unset: an empty value is refused': ['', undefined, undefined, false],
  'both empty: an empty value is refused': ['', '', '', false],
  'both unset: no header is refused': [null, undefined, undefined, false],
  'both unset: a plausible value is refused': [ANCIENNE, undefined, undefined, false],
};

const APRES: Record<string, Ligne> = {
  'after the change (new value in X, X_NEXT deleted), the old value is refused': [ANCIENNE, NOUVELLE, undefined, false],
  'after the change, the new value passes': [NOUVELLE, NOUVELLE, undefined, true],
  'step 3 of the change (new value in both), the new value passes': [NOUVELLE, NOUVELLE, NOUVELLE, true],
  'step 3 of the change, the old value is refused': [ANCIENNE, NOUVELLE, NOUVELLE, false],
};

afterEach(() => {
  vi.restoreAllMocks();
});

for (const porte of PORTES) {
  describe(`${porte.nom} — the truth table of a key change`, () => {
    for (const [titre, [presente, x, suivante, attendu]] of Object.entries({ ...PENDANT, ...VIDES, ...APRES })) {
      it(titre, async () => {
        expect(await porte.autorise(porte.avec(presente), x, suivante)).toBe(attendu);
      });
    }

    it('the gate steps aside (null) for the next value, and answers the one 401 otherwise', async () => {
      expect(await porte.rejette(porte.avec(NOUVELLE), ANCIENNE, NOUVELLE)).toBeNull();
      expect(await porte.rejette(porte.avec(ANCIENNE), ANCIENNE, NOUVELLE)).toBeNull();
      expect((await porte.rejette(porte.avec(AUTRE), ANCIENNE, NOUVELLE))?.status).toBe(401);
    });
  });

  describe(`${porte.nom} — one identical 401, whichever value was wrong`, () => {
    it('a wrong value, an empty value, no header, unset keys and a value that is only ANOTHER key’s next value give byte-identical answers', async () => {
      const refus = await Promise.all([
        porte.rejette(porte.avec(AUTRE), ANCIENNE, NOUVELLE),
        porte.rejette(porte.avec(''), ANCIENNE, NOUVELLE),
        porte.rejette(porte.avec(null), ANCIENNE, NOUVELLE),
        porte.rejette(porte.avec(ANCIENNE), undefined, undefined),
        porte.rejette(porte.avec(NOUVELLE), undefined, undefined),
        porte.rejette(porte.avec('test-cle-suivante-d-une-autre-porte'), ANCIENNE, NOUVELLE),
      ]);
      const corps = await Promise.all(refus.map((r) => r!.text()));
      expect(refus.map((r) => r!.status)).toEqual([401, 401, 401, 401, 401, 401]);
      expect(new Set(corps).size).toBe(1);
      expect(corps[0]).toBe(await unauthorized().text());
    });
  });

  describe(`${porte.nom} — BOTH compares run on every call, whatever the first one found`, () => {
    // Each compare signs both sides once: two compares = four HMAC signatures.
    // A gate that skipped the second compare once the first matched would let
    // timing say which value matched — and whether a next value is set at all.
    const CAS: Record<string, readonly [string | null, string | undefined, string | undefined]> = {
      'the old value (the first compare matches)': [ANCIENNE, ANCIENNE, NOUVELLE],
      'the next value (the second compare matches)': [NOUVELLE, ANCIENNE, NOUVELLE],
      'a wrong value (neither matches)': [AUTRE, ANCIENNE, NOUVELLE],
      'no next value set': [ANCIENNE, ANCIENNE, undefined],
      'no key set at all': [ANCIENNE, undefined, undefined],
      'no header': [null, ANCIENNE, NOUVELLE],
    };
    for (const [titre, [presente, x, suivante]] of Object.entries(CAS)) {
      it(`${titre}: four signatures`, async () => {
        const sign = vi.spyOn(crypto.subtle, 'sign');
        await porte.autorise(porte.avec(presente), x, suivante);
        expect(sign).toHaveBeenCalledTimes(4);
      });
    }
  });

  describe(`${porte.nom} — the next compare is the same constant-time fold, byte by byte`, () => {
    /**
     * The first compare is made to fail (the presented value is not the old
     * one) and the second to differ from the next value in EXACTLY ONE digest
     * byte, k = 0…31. A next compare that ignored any byte — or a home-made
     * second compare beside the house one — admits one of them.
     */
    function digests(premiere: number | null, seconde: number | null): void {
      let appel = 0;
      vi.spyOn(crypto.subtle, 'sign').mockImplementation(async () => {
        const d = new Uint8Array(32).fill(0x5a);
        const k = appel < 2 ? premiere : seconde;
        if (appel % 2 === 1 && k !== null) d[k] = 0x5b;
        appel += 1;
        return d.buffer;
      });
    }

    it('control: the first compare fails, the second has identical digests → passes (the stand-in refuses nothing by itself)', async () => {
      digests(0, null);
      expect(await porte.autorise(porte.avec(NOUVELLE), ANCIENNE, NOUVELLE)).toBe(true);
    });

    for (let k = 0; k < 32; k += 1) {
      it(`the second compare differs at byte ${k} → refused`, async () => {
        digests(0, k);
        expect(await porte.autorise(porte.avec(NOUVELLE), ANCIENNE, NOUVELLE)).toBe(false);
      });
    }
  });
}
