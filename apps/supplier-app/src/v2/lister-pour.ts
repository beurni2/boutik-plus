/**
 * LISTER-POUR-1b — « pour quel fournisseur » : the founder's pen, aimed.
 *
 * FOUNDER ORDER (2026-08-02): he lists FOR other suppliers; each supplier then
 * watches his own products through his own webapp. The studio therefore gains
 * one field on the recap step, and these two decisions are PURE so the rules
 * hold without a renderer:
 *
 *   · An empty or blank field means HIMSELF — the default publish is exactly
 *     yesterday's publish, and no flow he already knows changes under him.
 *   · The service refuses an id the book does not know (LISTER-POUR-1a',
 *     `unknown_supplier` — a typo must not strand a product on a ghost
 *     supplier no screen will ever show). That refusal reaches him in HIS
 *     words, not as a bare JSON tail.
 *
 * WHY A TYPED FIELD AND NOT A PICKER: the known-supplier list rides the
 * founder's ops credential (`GET /fulfillment/supplier-codes`), and that
 * secret is his ALONE — never bundled. A picker here would mean shipping it.
 * The server-side gate is what makes free text safe: the wrong id refuses
 * loudly instead of landing quietly.
 */

/** The id a publication is FOR: his own unless he names someone else. */
export function supplierPourPublication(saisi: string, sien: string): string {
  const net = saisi.trim();
  return net === '' ? sien : net;
}

/**
 * The catalog key for an HTTP publish failure. `unknown_supplier` is the one
 * refusal this slice TAUGHT the service, so it is the one this maps to its
 * own sentence; everything else keeps the generic frame it always had.
 *
 * WHOSE CODE IS MISSING CHANGES THE SENTENCE (founder report 2026-08-03: he
 * published for himself and read « Ce fournisseur n'est pas encore connu
 * ici » — true, and wrong in his mouth: he is not « ce fournisseur »). The
 * refusal body names the id verbatim, so the two cases are distinguishable
 * without guessing: his OWN id ⇒ « vous n'avez pas encore de code
 * personnel »; anyone else ⇒ the sentence about that supplier.
 *
 * AN UNREADABLE BODY FALLS BACK TO THE OTHER-SUPPLIER SENTENCE, never his:
 * telling him HIS code is missing when it is not would send him to mint a
 * code he already holds — and a re-mint invalidates the one he is using.
 */
export function cleEchecHttp(
  reason: string,
  sien: string,
): 'publier.err_mon_code_absent' | 'publier.err_fournisseur_inconnu' | 'publier.echec' {
  if (!reason.includes('unknown_supplier')) return 'publier.echec';
  const nomme = /"supplierId":"([^"]*)"/.exec(reason);
  return nomme !== null && nomme[1] === sien ? 'publier.err_mon_code_absent' : 'publier.err_fournisseur_inconnu';
}
