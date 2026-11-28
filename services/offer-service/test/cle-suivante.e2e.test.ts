import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * A KEY CHANGES WITH NO GAP — every key this Worker CHECKS, on real workerd
 * (Execution Contract §11, « overlapping windows »).
 *
 * The offer Worker checks three keys, all presented as Bearer:
 *   · SUPPLY_READ_SECRET        — Shop+'s supply reads;
 *   · FULFILLMENT_WRITE_SECRET  — Shop+'s order, delivery and hold intakes;
 *   · FULFILLMENT_OPS_SECRET    — the founder's own doors.
 * Each also accepts `X_NEXT` while it is set, so a key changes in four steps
 * with nothing refused in between: set X_NEXT beside X · move the sender · put
 * the new value in X · delete X_NEXT.
 *
 * EVERY gated door is walked, one by one, because each door names its key
 * separately: one door reading the wrong `_NEXT` would open to another key's
 * next value, and only that door's own row would see it. At every door:
 *   · during a change, X and X_NEXT get the SAME answer (status and body);
 *   · any other value, an empty one, none, and both values of the two OTHER
 *     keys get the one identical 401 — X_NEXT opens X's doors and no others;
 *   · after the change, the old value gets the 401 and the new one passes.
 * The bodies are no-op ones (a malformed command, a list read): every door
 * answers past its gate without changing anything, so asking twice gives the
 * same answer. One act is then asked of the ledger: a code minted with the
 * founder's next value is in the book his current value reads.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const UN_401 = JSON.stringify({ error: 'unauthorized' });

type NomCle = 'lecture' | 'intake' | 'fondateur';

const CLES: Record<NomCle, { readonly env: string; readonly ancienne: string; readonly nouvelle: string }> = {
  lecture: { env: 'SUPPLY_READ_SECRET', ancienne: 'test-lecture-ancienne-b11', nouvelle: 'test-lecture-nouvelle-b11' },
  intake: { env: 'FULFILLMENT_WRITE_SECRET', ancienne: 'test-intake-ancienne-b11', nouvelle: 'test-intake-nouvelle-b11' },
  fondateur: { env: 'FULFILLMENT_OPS_SECRET', ancienne: 'test-fondateur-ancienne-b11', nouvelle: 'test-fondateur-nouvelle-b11' },
};

interface Porte {
  readonly methode: 'GET' | 'POST' | 'PUT';
  readonly chemin: string;
}

/** Every door that calls a key gate, by the key it names (worker/index.ts). */
const PORTES: Record<NomCle, readonly Porte[]> = {
  lecture: [
    { methode: 'POST', chemin: '/supply-grouping' },
    { methode: 'GET', chemin: '/supply-projection/pv-b11-inconnu' },
    { methode: 'GET', chemin: '/supply-projections' },
  ],
  intake: [
    { methode: 'POST', chemin: '/fulfillment/order-confirmed' },
    { methode: 'POST', chemin: '/fulfillment/delivered' },
    { methode: 'POST', chemin: '/fulfillment/delivery-refused' },
    { methode: 'POST', chemin: '/fulfillment/stock-hold' },
    { methode: 'POST', chemin: '/fulfillment/stock-hold/release' },
  ],
  fondateur: [
    { methode: 'GET', chemin: '/fulfillment/orders' },
    { methode: 'GET', chemin: '/fulfillment/order-evidence' },
    { methode: 'GET', chemin: '/fulfillment/repere-audio' },
    { methode: 'POST', chemin: '/fulfillment/supplier-contact' },
    { methode: 'GET', chemin: '/fulfillment/supplier-contacts' },
    { methode: 'POST', chemin: '/fulfillment/relance' },
    { methode: 'POST', chemin: '/fulfillment/order/retirer' },
    { methode: 'POST', chemin: '/fulfillment/order/annuler' },
    { methode: 'GET', chemin: '/offers/inventaire' },
    { methode: 'POST', chemin: '/offers/stock' },
    { methode: 'GET', chemin: '/offers/stock/attente' },
    { methode: 'POST', chemin: '/offers/prolonger' },
    { methode: 'GET', chemin: '/offers/journal' },
    { methode: 'GET', chemin: '/fulfillment/supplier-codes' },
    { methode: 'POST', chemin: '/fulfillment/supplier-code' },
    { methode: 'POST', chemin: '/fulfillment/supplier/effacer' },
    { methode: 'POST', chemin: '/fulfillment/supplier-code/revoke' },
    { methode: 'POST', chemin: '/fulfillment/supplier-acces/suite' },
    { methode: 'POST', chemin: '/fulfillment/supplier-code/reveal' },
    // The write gate in front of every remaining write:
    { methode: 'POST', chemin: '/offers' },
    { methode: 'POST', chemin: '/offers/assets' },
    { methode: 'POST', chemin: '/offers/delete' },
    { methode: 'PUT', chemin: '/offers' },
    { methode: 'GET', chemin: '/offers' },
  ],
};

const NOMS: readonly NomCle[] = ['lecture', 'intake', 'fondateur'];
const dossiers: string[] = [];

function worker(bindings: Record<string, string>): Miniflare {
  const persist = mkdtempSync(join(tmpdir(), 'cle-suivante-'));
  dossiers.push(persist);
  return new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
    durableObjectsPersist: persist,
    bindings,
  });
}

/** During a change: every X and every X_NEXT set. */
const pendant = worker(
  Object.fromEntries(NOMS.flatMap((n) => [[CLES[n].env, CLES[n].ancienne], [`${CLES[n].env}_NEXT`, CLES[n].nouvelle]])),
);
/** After the change: the new value in X, every X_NEXT deleted. */
const apres = worker(Object.fromEntries(NOMS.map((n) => [CLES[n].env, CLES[n].nouvelle])));

afterAll(async () => {
  await pendant.dispose();
  await apres.dispose();
  for (const d of dossiers) rmSync(d, { recursive: true, force: true });
});

/** `null` = no Authorization header at all. */
async function frapper(mf: Miniflare, porte: Porte, autorisation: string | null, corps = '{}') {
  const res = await mf.dispatchFetch(`http://o${porte.chemin}`, {
    method: porte.methode,
    headers: {
      ...(porte.methode === 'GET' ? {} : { 'Content-Type': 'application/json' }),
      ...(autorisation === null ? {} : { Authorization: autorisation }),
    },
    ...(porte.methode === 'GET' ? {} : { body: corps }),
  });
  // Two list reads stamp the moment they answered; everything else is the answer.
  const texte = (await res.text()).replace(/"asOf":"[^"]*"/g, '"asOf":"…"');
  return { status: res.status, texte };
}

const bearer = (valeur: string): string => `Bearer ${valeur}`;

for (const nom of NOMS) {
  const cle = CLES[nom];
  const autres = NOMS.filter((n) => n !== nom);

  describe(`${cle.env} — during a change (${cle.env} and ${cle.env}_NEXT both set)`, () => {
    for (const porte of PORTES[nom]) {
      it(`${porte.methode} ${porte.chemin}: the next value gets exactly the answer the current value gets`, async () => {
        const actuelle = await frapper(pendant, porte, bearer(cle.ancienne));
        expect(actuelle.status, actuelle.texte).not.toBe(401);
        const suivante = await frapper(pendant, porte, bearer(cle.nouvelle));
        expect(suivante.status, suivante.texte).toBe(actuelle.status);
        expect(suivante.texte).toBe(actuelle.texte);
      });

      it(`${porte.methode} ${porte.chemin}: any other value, an empty one, none, and both values of the two other keys get the one 401`, async () => {
        const refusees: Array<[string, string | null]> = [
          ['another value', bearer('test-ni-ancienne-ni-nouvelle-b11')],
          ['an empty value', 'Bearer '],
          ['no header', null],
          ...autres.flatMap((a): Array<[string, string | null]> => [
            [`${CLES[a].env}`, bearer(CLES[a].ancienne)],
            [`${CLES[a].env}_NEXT`, bearer(CLES[a].nouvelle)],
          ]),
        ];
        for (const [quoi, autorisation] of refusees) {
          const r = await frapper(pendant, porte, autorisation);
          expect(r.status, `${quoi} → ${r.texte}`).toBe(401);
          expect(r.texte, quoi).toBe(UN_401);
        }
      });
    }
  });

  describe(`${cle.env} — after the change (the new value in ${cle.env}, ${cle.env}_NEXT deleted)`, () => {
    for (const porte of PORTES[nom]) {
      it(`${porte.methode} ${porte.chemin}: the old value, an empty one and none get the one 401; the new value passes`, async () => {
        for (const [quoi, autorisation] of [
          ['the old value', bearer(cle.ancienne)],
          ['an empty value', 'Bearer '],
          ['no header', null],
        ] as const) {
          const r = await frapper(apres, porte, autorisation);
          expect(r.status, `${quoi} → ${r.texte}`).toBe(401);
          expect(r.texte, quoi).toBe(UN_401);
        }
        const nouvelle = await frapper(apres, porte, bearer(cle.nouvelle));
        expect(nouvelle.status, nouvelle.texte).not.toBe(401);
      });
    }
  });
}

describe('the ledger, not the response: an act done with the next value is in the book', () => {
  it('a supplier code minted with the founder’s NEXT value is listed by his CURRENT value', async () => {
    const supplierId = 'supplier-b11-cle-suivante';
    const mint = await frapper(
      pendant,
      { methode: 'POST', chemin: '/fulfillment/supplier-code' },
      bearer(CLES.fondateur.nouvelle),
      JSON.stringify({ supplierId }),
    );
    expect(mint.status, mint.texte).toBe(200);
    const liste = await frapper(pendant, { methode: 'GET', chemin: '/fulfillment/supplier-codes' }, bearer(CLES.fondateur.ancienne));
    expect(liste.status, liste.texte).toBe(200);
    const codes = (JSON.parse(liste.texte) as { codes: { supplierId: string }[] }).codes;
    expect(codes.map((c) => c.supplierId)).toContain(supplierId);
  });
});
