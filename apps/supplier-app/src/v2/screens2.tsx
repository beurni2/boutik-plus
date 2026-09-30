/**
 * WO-FP-PIXEL §5 — the five-step wizard (S20–S25). Composition only, styles
 * from styles.ts, machine-driven; `SListerReal` wraps it with the real writes.
 *
 * LISTER-VRAI-1 (founder 2026-09-30, « make room »): the demo sheets (S17/S19),
 * the demo Studio (S26–S31, replaced by the real one), Argent (S32), the
 * « Notre engagement » trust screen (S33), the sign-up walkthrough (S34–S39)
 * and the célébration (S40) are gone. S33 and S34 were the last two reachable
 * from his console; he chose to unlink them — nothing untrue is shown.
 */
import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { P, TILE_GRADIENT } from '../ui/v2/palette';
import { GEO } from '../ui/v2/tokens';
import { C21, C43, SCROLL, TNUM, role } from '../ui/v2/styles';
import { digitsToAmount, formatF } from './money';
import { RAYONS, detailChamps } from './categorie-details';
import { chipChoisi, pourFournisseurHintKey, type ChoixFournisseur, type FournisseursRead } from './lister-pour-choix';
import type { SellerNetLine } from '../supply/preview';
import { disabled, type A, type S } from './machine';
import { t as tr } from '../i18n';
import {
  Banner, BtnSoft, C07BtnPrimary, Card, ChipCategory, HeaderStacked, PhotoViewer,
  Icon, IconTile, Input, MoneyBreakdown, Overline,
  ProgressDots, Stepper, WizardFooter,
} from './components';

type D = (a: A) => void;

/** VIDEO-PRODUIT-1c — the picked clip's three honest states, decided by the
 *  wrapper (`supply/video.ts`); this frozen screen renders what it is handed. */
export type VideoEtat =
  | { readonly kind: 'aucune' }
  | { readonly kind: 'choisie'; readonly durationSec: number }
  | { readonly kind: 'refusee'; readonly key: string };
const wizScroll = SCROLL.wizard;

// ── S20–S25 Wizard ────────────────────────────────────────────────────────────
// RAYONS-1: the flat eight-chip list became the aisled picker — the shelves
// and their categories live in categorie-details.ts (RAYONS), beside the
// per-category detail fields they decide.
// `heroUri` is ADDITIVE (combined slice, verifier finding): on the REAL flow the
// step-4 « Aperçu » card shows the REAL heroSquare instead of the demo glyph
// tile — frozen demo chrome must not make a claim about a listing that now has
// three real photographs. Undefined renders the frozen glyph tile, as before.
//
// `money` IS REQUIRED, NOT OPTIONAL (founder rounding ruling 2026-07-25). The
// figures shown on steps 2 and 4 are the seller's own net on a listing he is
// about to publish for real, so they come from the CANON waterfall
// (`supply/preview.ts` → RoundingLaw v1 floor), computed by the caller. It is
// required rather than defaulted so that a caller which forgets it FAILS TO
// COMPILE instead of silently falling back to the frozen demo `Math.round`
// math — a silent fallback to non-canon rounding on a money screen is precisely
// the divergence this ruling closes. `v2/money.ts` §3.4 is untouched; its
// `fee`/`net` have NO consumer left since the demo seed was deleted
// (LISTER-VRAI-1) — they stay as his FRAIS-ZERO construction.
// `money` CARRIES EITHER A FIGURE OR A NAMED REFUSAL (founder rulings
// 2026-07-25, two axes, neither of them an option I had offered).
//
// AXIS ONE — the price floor. The B stepper keeps its FULL designed range down
// to 500; his chrome is not changed. But the publish floor is 5 000, so the
// nine positions beneath it describe an offer that cannot exist.
//
// AXIS TWO — the commission. C is unbounded above and there is no ceiling
// anywhere, so B = 5 000 with C = 4 800 left a seller net of −50. The threshold
// is NON-POSITIVE, not negative (founder, explicitly): a net of exactly zero is
// as meaningless to publish as −50 and would slip a strictly-negative test.
//
// Both printed a net in the large green type this app reserves for money he
// RECEIVES — arithmetically true, commercially meaningless.
//
// The rule, one sentence: when no net may be stated, STATE NONE, show the
// reason, and block continue. Not a fabricated value, not a hidden control.
// The union rather than a number is how the absence is carried, so a screen
// cannot accidentally print one — and the reason travels with it, so this
// screen never has to assume which rule refused.
export function S20Wizard({ st, d, money, heroUri, photos, photosHint, fournisseur, video }: { st: S; d: D; money: SellerNetLine; heroUri?: string | undefined; photos?: readonly { readonly label: string; readonly uri: string; readonly onRole?: (() => void) | undefined }[] | undefined; photosHint?: string | undefined; fournisseur?: { readonly value: string; readonly onChange: (v: string) => void; readonly read: FournisseursRead; readonly chips: readonly ChoixFournisseur[]; readonly onRetry: () => void; readonly sienId: string } | undefined; video?: { readonly etat: VideoEtat; readonly onPick: () => void; readonly onRetirer: () => void } | undefined }) {
  const w = st.wiz;
  // The wrapper owns the publish rules AND the predicate (`authoring.ts`
  // `netLineRefusal`), so this frozen screen learns no product rule and no
  // threshold — it renders what it is handed and states the key it is given.
  //
  // TWO SPELLINGS OF ONE CONDITION — and the honest reason (CORRECTED after a
  // second verifier run). An earlier version of this comment claimed the render
  // sites MUST use the direct comparison because TypeScript narrows only from
  // it. That is false: TS 4.4+ aliased-condition narrowing handles `noNet` too
  // — measured with `tsc --strict`, not assumed.
  //
  // The real reason is readability at the point of use: the JSX branches read
  // better naming the case they render (`money.kind === 'refused'`), while the
  // footer reads better naming the state it disables on. `noNet` IS that same
  // comparison, defined on this line, so they cannot diverge without editing
  // it — and if the union ever grows a third case, the compiler will force
  // every direct comparison to be revisited while a boolean alias would not.
  const noNet = money.kind === 'refused';
  /** The verify step's full-screen photo inspection (founder ruling 2026-07-26). */
  const [viewing, setViewing] = useState<{ uri: string; label: string } | null>(null);
  const footerLabel = w.step === 4 ? "Publier — c'est gratuit" : w.step === 3 && !w.photos ? 'Photos requises' : 'Continuer';
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingTop: 16, paddingHorizontal: 20 }}>
        <HeaderStacked title="Nouveau produit" wizardCounter={`${w.step + 1}/5`} onBack={() => d({ t: 'BACK' })} />
        <ProgressDots total={5} step={w.step} />
      </View>
      <ScrollView contentContainerStyle={wizScroll} showsVerticalScrollIndicator={false}>
        {w.step === 0 && (
          <>
            <Text style={C43.titleStep}>Catégorie</Text>
            {/* RAYONS-1 (founder order 2026-08-23): the categories read like a
                real store — one shelf per rayon, his products' shelves first.
                The rayon is GROUPING only; what publishes is the category
                string, free by canon, exactly as before. */}
            {RAYONS.map((r) => (
              <View key={r.titre}>
                <Overline style={{ marginTop: 18 }}>{r.titre}</Overline>
                <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
                  {r.categories.map((c) => (
                    <ChipCategory key={c} label={c} active={w.cat === c} onPress={() => d({ t: 'WIZ_SET', patch: { cat: c } })} />
                  ))}
                </View>
              </View>
            ))}
          </>
        )}
        {w.step === 1 && (
          <>
            <Text style={C43.titleStep}>Détails & stock</Text>
            {/* The chosen category, restated — on a multi-diverse catalog the
                fields below CHANGE with it, so the screen says which product
                type it is asking about. Data, not a sentence. */}
            <Text style={[role({ f: 'IS', w: 600, s: 13 }, P.sub), { marginTop: 6 }]}>{w.cat}</Text>
            <View style={{ marginTop: 18 }}>
              <Input label="Nom du produit" value={w.name} onChangeText={(t) => d({ t: 'WIZ_SET', patch: { name: t } })} />
            </View>
            {/* COMBINED SLICE — the product code, DERIVED from the name and
                EDITABLE here (founder option (a)): the suggestion fills as he
                types the name on this same step, and stops the moment he edits
                it (the wrapper owns that logic; this is just his Input). */}
            <View style={{ marginTop: 16 }}>
              <Input label={tr('publier.champ_code')} value={w.code} onChangeText={(t) => d({ t: 'WIZ_SET', patch: { code: t } })} />
              <Text style={[role({ f: 'IS', w: 400, s: 12.5, lh: 1.55 }, P.sub), { marginTop: 6 }]}>{tr('publier.champ_code_aide')}</Text>
            </View>
            {/* QUARTIER REMOVED FROM THE LISTING FLOW (founder device ruling
                2026-07-26). It is a property of his BOUTIQUE, not of each
                product, and asking it once per listing was a tax on every
                product he adds. Canon still requires a zone on the
                ProductVersion, so the wrapper now supplies the seller-level
                value — see `SUPPLIER_ZONE` in `supply/service.ts`. */}
            {/* RAYONS-1 (extends CAPTURE-PAR-CATEGORIE-1) — the details are the
                CATEGORY'S OWN QUESTIONS: a car seat asks age/weight, brand and
                colours; a crib asks dimensions and material; the legacy eight
                keep their single shipped field. Free text in every field: the
                answers compose into the ONE canon `variantsNote`, no schema
                invented, nothing refused. */}
            {detailChamps(w.cat).map((c, i) => (
              <View key={`${c.labelKey}-${i}`} style={{ marginTop: 16 }}>
                <Input
                  label={tr(c.labelKey)}
                  value={w.details[i] ?? ''}
                  onChangeText={(t) => d({ t: 'WIZ_SET', patch: { details: detailChamps(w.cat).map((_, j) => (j === i ? t : w.details[j] ?? '')) } })}
                />
                <Text style={[role({ f: 'IS', w: 400, s: 12.5, lh: 1.55 }, P.sub), { marginTop: 6 }]}>{tr(c.exempleKey)}</Text>
              </View>
            ))}
            <Overline style={{ marginTop: 16 }}>Stock disponible</Overline>
            <View style={{ marginTop: 8 }}>
              <Stepper
                value={`${w.stock} unités`}
                onMinus={() => !disabled.wizStock(w) && d({ t: 'WIZ_SET', patch: { stock: w.stock - 1 } })}
                onPlus={() => d({ t: 'WIZ_SET', patch: { stock: w.stock + 1 } })}
              />
            </View>
          </>
        )}
        {w.step === 2 && (
          <>
            <Text style={C43.titleStep}>Prix & commission</Text>
            <Overline style={{ marginTop: 18 }}>Prix de base (ce que vaut le produit)</Overline>
            <View style={{ marginTop: 8 }}>
              <Stepper
                value={String(w.B)}
                onChangeText={(text) => d({ t: 'WIZ_SET', patch: { B: digitsToAmount(text) } })}
                onMinus={() => !disabled.wizB(w) && d({ t: 'WIZ_SET', patch: { B: w.B - 500 } })}
                onPlus={() => d({ t: 'WIZ_SET', patch: { B: w.B + 500 } })}
              />
            </View>
            <Overline style={{ marginTop: 16 }}>Commission revendeuse (vous la financez)</Overline>
            <View style={{ marginTop: 8 }}>
              <Stepper
                value={String(w.C)}
                onChangeText={(text) => d({ t: 'WIZ_SET', patch: { C: digitsToAmount(text) } })}
                onMinus={() => !disabled.wizC(w) && d({ t: 'WIZ_SET', patch: { C: w.C - 100 } })}
                onPlus={() => d({ t: 'WIZ_SET', patch: { C: w.C + 100 } })}
              />
            </View>
            <View style={{ marginTop: 16 }}>
              {money.kind === 'refused' ? (
                // The refusal takes the card's place rather than emptying it: a
                // breakdown with B and C but no fee and no total would be a
                // half-statement about an offer that cannot exist. C19
                // MoneyBreakdown is untouched — it is simply not rendered here.
                // The reason comes from the wrapper, so this screen states which
                // rule refused rather than assuming there is only one.
                <Banner tone="warn">{tr(money.reasonKey)}</Banner>
              ) : (
                <MoneyBreakdown
                  B={formatF(w.B)}
                  C={formatF(w.C)}
                  netV={formatF(money.net.sellerNetFcfa)}
                  netSize="XL"
                />
              )}
            </View>
            <Text style={[role({ f: 'IS', w: 400, s: 12.5, lh: 1.55 }, P.sub), { marginTop: 10 }]}>
              {tr('fp.cliente_paie_explication')}
            </Text>
          </>
        )}
        {w.step === 3 && (
          <>
            <Text style={C43.titleStep}>Photos — Studio</Text>
            <Text style={[role({ f: 'IS', w: 400, s: 14, lh: 1.55 }, P.inkSoft), { marginTop: 10 }]}>
              {tr('fp.studio_guide')}
            </Text>
            {w.photos ? (
              <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: GEO.r.banner, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: P.successBg }}>
                <Icon name="check" size={17} stroke={P.successFg} strokeWidth={2.2} />
                <Text style={[role({ f: 'IS', w: 400, s: 13, lh: 1.55 }, P.successFg), { flex: 1 }]}>
                  {tr('publier.photos_validees')}
                </Text>
              </View>
            ) : (
              <View style={{ marginTop: 14 }}>
                <C07BtnPrimary label="Ouvrir Boutik+ Studio" icon="camera" onPress={() => d({ t: 'OPEN_STUDIO' })} />
              </View>
            )}
            {/* VIDEO-PRODUIT-1c (founder order 2026-08-02: « a short video of
                like 6 second max ») — the OPTIONAL clip lives on the media
                step with the photos. Three honest states, decided by the
                wrapper: none yet (the quiet add control — photos stay the
                primary act of this screen), chosen (the calm « prête » — no
                number: the stored `durationSec` is canon's CEILING, and saying
                « 6 s » about a 5,3 s clip is a false measure — verifier minor
                2026-08-03), refused (the reason's own sentence and the control
                to try another). */}
            {video !== undefined && (
              <View style={{ marginTop: 18 }}>
                <Overline>{tr('publier.video_titre')}</Overline>
                {video.etat.kind === 'choisie' ? (
                  <>
                    <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: GEO.r.banner, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: P.successBg }}>
                      <Icon name="check" size={17} stroke={P.successFg} strokeWidth={2.2} />
                      <Text style={[role({ f: 'IS', w: 400, s: 13, lh: 1.55 }, P.successFg), { flex: 1 }]}>
                        {tr('publier.video_prete')}
                      </Text>
                    </View>
                    <View style={{ marginTop: 10 }}>
                      <BtnSoft label={tr('publier.video_retirer')} onPress={video.onRetirer} />
                    </View>
                  </>
                ) : (
                  <>
                    {video.etat.kind === 'refusee' && (
                      <View style={{ marginTop: 10 }}>
                        <Banner tone="warn">{tr(video.etat.key)}</Banner>
                      </View>
                    )}
                    <View style={{ marginTop: 10 }}>
                      <BtnSoft label={tr('publier.video_ajouter')} onPress={video.onPick} />
                    </View>
                    <Text style={[role({ f: 'IS', w: 400, s: 12.5, lh: 1.55 }, P.sub), { marginTop: 8 }]}>
                      {tr('publier.video_hint')}
                    </Text>
                  </>
                )}
              </View>
            )}
          </>
        )}
        {w.step === 4 && (
          <>
            <Text style={C43.titleStep}>Vérifiez, puis publiez</Text>
            {/* EVERYTHING WELL DETAILED (founder device ruling 2026-07-26).
                Every value he typed, on its own labelled row, so the last thing
                before publishing is a full statement rather than a summary. */}
            <Card style={{ marginTop: 16 }}>
              <Text style={role({ f: 'BG', w: 700, s: 16 }, P.ink)}>{w.name.trim() === '' ? 'Robe brodée bogolan' : w.name}</Text>
              <View style={{ height: 1, backgroundColor: P.borderCard, marginVertical: 13 }} />
              {([
                ['Catégorie', w.cat],
                ['Code produit', w.code.trim() === '' ? '—' : w.code],
                // One recap row PER detail question — « everything well
                // detailed » (founder ruling 2026-07-26) now that a category
                // can ask several.
                ...detailChamps(w.cat).map((c, i): readonly [string, string] => [
                  tr(c.labelKey),
                  (w.details[i] ?? '').trim() === '' ? '—' : (w.details[i] ?? '').trim(),
                ]),
                ['Stock disponible', `${w.stock}`],
                ['Prix de base', formatF(w.B)],
              ] as readonly (readonly [string, string])[]).map(([label, value]) => (
                <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, gap: 12 }}>
                  <Text style={role({ f: 'IS', w: 400, s: 14 }, P.sub)}>{label}</Text>
                  <Text style={[role({ f: 'IS', w: 700, s: 14 }, P.ink), TNUM, { flexShrink: 1, textAlign: 'right' }]} numberOfLines={2}>{value}</Text>
                </View>
              ))}
              <View style={{ height: 1, backgroundColor: P.borderCard, marginVertical: 13 }} />
              {/* Unreachable when no net may be stated — continue is blocked on
                  step 2 — but the type makes the case explicit rather than
                  letting a number be printed for an offer that cannot exist. */}
              {money.kind === 'refused' ? (
                <Banner tone="warn">{tr(money.reasonKey)}</Banner>
              ) : (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}>
                  <Text style={role({ f: 'IS', w: 400, s: 14 }, P.ink)}>Vous recevez / vente</Text>
                  <Text style={[role({ f: 'BG', w: 800, s: 16 }, P.greenDeep), TNUM]}>{formatF(money.net.sellerNetFcfa)}</Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}>
                <Text style={role({ f: 'IS', w: 400, s: 14 }, P.sub)}>Commission revendeuse</Text>
                <Text style={[role({ f: 'IS', w: 700, s: 14 }, P.sub), TNUM]}>{formatF(w.C)}</Text>
              </View>
            </Card>
            {/* LISTER-POUR-1b/2 — WHOM THIS PUBLICATION IS FOR (founder orders
                2026-08-02: « I want to be the one listing the products for
                other suppliers », then « show the list of the available active
                fournisseur and I select the one I want »). On the RECAP step
                deliberately: aiming a product at another supplier is part of
                « vérifiez », the last full statement before publishing.
                When the roster READ succeeded the choice is CHIPS — « Vous »
                first, one per other active supplier; every other read state
                falls back to the 1b typed field under an honestly NAMED hint
                (no key here / list unreadable / still loading), never an empty
                picker pretending there are no suppliers, and « n'a pas pu être
                lue » now carries its own RETRY rather than naming a failure he
                cannot act on. The typed field stays UNCONTROLLED
                (`defaultValue`) — it seeds from the wrapper's value and reports
                every keystroke up — and the MARKING is COMPUTED from that same
                value (`chipChoisi`), never from a second copy: that mismatch,
                where a typed id published under a « Vous » chip, is the
                verifier's BLOCKER of 2026-08-02. A wrong id cannot land in any
                case: the service refuses an unknown supplier by name
                (LISTER-POUR-1a'), shown in his words. */}
            {fournisseur !== undefined && (
              <Card style={{ marginTop: 12, padding: 16 }}>
                {fournisseur.read.kind === 'liste' ? (
                  <>
                    <Overline>{tr('publier.pour_fournisseur_label')}</Overline>
                    <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
                      {fournisseur.chips.map((c) => (
                        <ChipCategory
                          key={c.id === '' ? '(vous)' : c.id}
                          label={c.labelKey !== null ? tr(c.labelKey) : c.id}
                          active={chipChoisi(fournisseur.value, fournisseur.sienId) === c.id}
                          onPress={() => fournisseur.onChange(c.id)}
                        />
                      ))}
                    </View>
                  </>
                ) : (
                  <Input
                    label={tr('publier.pour_fournisseur_label')}
                    defaultValue={fournisseur.value}
                    onChangeText={fournisseur.onChange}
                  />
                )}
                <Text style={[role({ f: 'IS', w: 400, s: 12.5, lh: 1.55 }, P.sub), { marginTop: 6 }]}>
                  {tr(pourFournisseurHintKey(fournisseur.read, fournisseur.chips.length - 1, fournisseur.sienId))}
                </Text>
                {fournisseur.read.kind === 'echec' && (
                  <View style={{ marginTop: 12 }}>
                    <BtnSoft label={tr('publier.pour_reessayer')} onPress={fournisseur.onRetry} />
                  </View>
                )}
              </Card>
            )}
            {/* ALL THREE PHOTOGRAPHS, not just the hero (founder device ruling
                2026-07-26: *"able to see all photos taken"*). These are the
                SHIPPED bytes — the same data URIs the Studio previewed — so
                what he checks here is what uploads. The honest empty when the
                Studio has not run is the placeholder tile below. */}
            {photos !== undefined && photos.length > 0 && (
              <Card style={{ marginTop: 12, padding: 16 }}>
                <Overline level="card">Vos photos</Overline>
                {photosHint !== undefined && (
                  <Text style={[role({ f: 'IS', w: 400, s: 12, lh: 1.5 }, P.sub), { marginTop: 6 }]}>{photosHint}</Text>
                )}
                <View style={{ marginTop: 11, flexDirection: 'row', gap: 10 }}>
                  {/* TAPPABLE (founder device ruling 2026-07-26): a 100-point
                      thumbnail cannot be judged; the tap opens the full-screen
                      viewer over the SAME shipped bytes. */}
                  {photos.map((p, i) => (
                    <View key={`${i}-${p.uri.slice(-24)}`} style={{ flex: 1 }}>
                      <Pressable onPress={() => setViewing({ uri: p.uri, label: p.label })} accessibilityRole="button">
                        <Image source={{ uri: p.uri }} style={{ width: '100%', aspectRatio: 1, borderRadius: C21.preview.r }} resizeMode="cover" />
                      </Pressable>
                      {/* THE ROLE CHIP (STUDIO-BATCH-1, founder 2026-07-27:
                          "choose the hero photo, the preuve and the detail
                          from this screen"). Tapping it advances this photo to
                          the next role; the photo that held it takes this
                          one's — a swap, so the set always has exactly one of
                          each. Plain label when the flow has no role choice. */}
                      {p.onRole !== undefined ? (
                        <Pressable onPress={p.onRole} accessibilityRole="button" hitSlop={8} style={{ marginTop: 6, alignSelf: 'center', paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: P.borderCtl, backgroundColor: P.surface }}>
                          <Text style={role({ f: 'IS', w: 600, s: 11.5 }, P.ink)}>{p.label}</Text>
                        </Pressable>
                      ) : (
                        <Text style={[role({ f: 'IS', w: 400, s: 11.5, lh: 1.4 }, P.sub), { marginTop: 6, textAlign: 'center' }]}>{p.label}</Text>
                      )}
                    </View>
                  ))}
                </View>
              </Card>
            )}
            <Card style={{ marginTop: 12, padding: 16 }}>
              <Overline level="card">Aperçu — ce que verront les revendeuses</Overline>
              <View style={{ marginTop: 11, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {heroUri !== undefined ? (
                  <Image source={{ uri: heroUri }} style={{ width: C21.preview.size, height: C21.preview.size, borderRadius: C21.preview.r }} resizeMode="cover" />
                ) : (
                  <IconTile bg={TILE_GRADIENT.nouveau} glyph={'\u{1F9E5}'} size={C21.preview.size} radius={C21.preview.r} glyphSize={C21.preview.glyph} />
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={role({ f: 'IS', w: 700, s: 14 }, P.ink)}>{w.name.trim() === '' ? 'Robe brodée bogolan' : w.name}</Text>
                  <Text style={[role({ f: 'IS', w: 400, s: 12 }, P.sub), { marginTop: 2 }]}>{`${w.cat} · photo premium, sans prix incrusté`}</Text>
                  <Text style={[role({ f: 'IS', w: 700, s: 12.5 }, P.greenDeep), TNUM, { marginTop: 3 }]}>{`Commission revendeuse ${formatF(w.C)}`}</Text>
                </View>
              </View>
            </Card>
            <Text style={[role({ f: 'IS', w: 400, s: 12.5, lh: 1.55 }, P.sub), { marginTop: 12 }]}>
              {tr('fp.moderation_note')}
            </Text>
          </>
        )}
      </ScrollView>
      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />
      <WizardFooter>
        {/* THE BLOCK LIVES HERE, NOT IN THE REDUCER. `disabled.wizContinue` is
            the machine's own §4 predicate and stays untouched: the floor is a
            REAL-FLOW product rule, and putting it in machine.ts would put it
            inside the frozen §4 machine, which it has nothing to do with. This
            footer is the only dispatcher of WIZ_NEXT, so a disabled button here
            makes step 3 unreachable below the floor — and the core refuses it
            independently anyway (`base_price_below_floor`), which is the two
            independent refusals the empty-name block established.
            The label stays « Continuer »: the reason is stated in full, in his
            own existing words, in the card directly above — a long sentence
            crammed into a button truncates on a low-end Android and would say
            less, not more. */}
        <C07BtnPrimary
          label={footerLabel}
          disabled={disabled.wizContinue(st) || (w.step === 2 && noNet)}
          onPress={() => d({ t: 'WIZ_NEXT' })}
        />
      </WizardFooter>
    </View>
  );
}
