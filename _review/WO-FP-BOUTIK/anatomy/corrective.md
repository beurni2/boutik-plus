# ANATOMY DERIVATION — Corriger (frame « Détail commande » refusal states)

**Frame:** `data-screen-label="Détail commande"`, the refusal states — `Boutik Plus - Redesign.dc.html`
lines **294–301** (photo-refused 294–296; **pickup-refused 298–301**, the corrective path).
**Implementation:** `apps/supplier-app/App.tsx` — `screen === 'corrective'` block.
**Dignified refusal (trust test): the refusal path is as dignified as the purchase path.** Rows
grep-evidenced from this frame only (no sibling import).

---

## Element-by-element (each row: `awk 'index($0,p)'` → line)

| # | Frame element (grepped verbatim) | → line | Implementation | Fidelity |
|---|---|---|---|---|
| 1 | Refusal **danger banner** `Refusé à l'enlèvement : {reason}. …` (bg danger, fg #7E1A15) | **299** | `<WarnNote tone="danger" text={t('refused.cause')…}>` — the new danger-tone banner (dangerBg/dangerFg, `refus` icon) | frame (kit: WarnNote gained `tone`) |
| 2 | `…La cliente est remboursée par le fonds de protection — corrigez, puis re-proposez le colis.` | **299** | `<NoteCard><Text>{t('corrective.protection')}</Text></NoteCard>` — « La cliente est déjà remboursée par le fonds de protection. Corrigez, puis re-proposez le colis. » | frame; **divergence A** (split into a calm reassurance card) |
| 3 | Corrective CTA `Corriger et re-proposer` | **300** | `<PrimaryButton label={t('refused.fix_action')} onPress={…markCorrected → enterReady → go('pret')}>` | frame; copy untouched (« Corriger et redire prêt ») |
| — | (photo-refused variant `Photo de préparation refusée…`) | 295 | the same corrective surface (E1 collapses the refusal variants to one correct-and-re-propose path) | **divergence B** |
| — | states law: no refusal to correct → designed « rien à corriger » | — | `refused === undefined ? <EmptyState icon="coche" title={t('corrective.rien')}>` | exact |

The countdown (`echeances.restant` on a `pending` StatusChip) preserves the 6-hour correction window;
`refused.new_code` states a fresh readiness code will be issued (never shown here).

---

## Lawful divergences (the complete list)

- **A — The Protection-Fund reassurance is a CALM card, not inside the red banner.** The frame packs
  reason + reassurance into one danger banner; the app puts the *problem* in danger (row 1) and the
  *reassurance* in a calm soft-accent card (row 2). This is the trust test applied — the money truth
  (« la cliente est **déjà** remboursée par le fonds de protection », B+I-12: the buyer refund is
  immediate and never gated on the seller / the Protection Fund) lands calm, not alarming. Same
  content, split by register.
- **B — One corrective path collapses the frame's refusal variants.** The frame shows distinct
  photo-refused (295) and pickup-refused (299) banners; at E1 the app routes both to a single
  correct-and-re-propose surface parameterised by `refused.refusedChecks`. The reason text is the
  actual refused checks; the CTA re-enters readiness (`go('pret')`). Fuller per-variant banners are a
  post-E1 refinement.

**The frame's refusal composition — a danger banner for the reason, the Protection-Fund reassurance,
the correct-and-re-propose CTA — is matched, with the buyer-protection invariant (immediate refund,
never gated on the seller) stated plainly and calmly.** Divergences are the register split and the E1
single-path collapse — neither weakens the refusal's dignity or the money truth.
