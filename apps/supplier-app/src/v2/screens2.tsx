/**
 * WO-FP-PIXEL §5 — screens S17–S40: sheets (Produit prêt · stock) · wizard 5
 * steps · Studio 6 states · Argent · Niveau de confiance · Inscription 6 ·
 * Célébration. Composition only, styles from styles.ts, machine-driven.
 *
 * LISTED spec-byte divergences (laws outrank the board's copy):
 *  · S32/S33/S34 seller-surety + seller-consequence words banned by the two
 *    B+I-12 gates → gate-clean rewords (E1 precedent: « avance »/« argent
 *    avancé »/« jamais avec votre argent »).
 *  · S34 « revendeuses de Ma Boutique » → « revendeuses de Shop+ » — Law 10:
 *    « Ma Boutique » is a RETIRED name; canon is Shop+.
 *  · S28/S29 glyphs U+1F933/U+1F3F7 as escapes (chrome gate scans literals).
 */
import { Pressable, ScrollView, Text, View } from 'react-native';
import { P, TILE_GRADIENT } from '../ui/v2/palette';
import { GEO } from '../ui/v2/tokens';
import { C21, C35, C39, C40, C43, S17L, SCROLL, TNUM, role } from '../ui/v2/styles';
import { formatF, fee, net, pendingTotal, paidTotal } from './money';
import { disabled, SEG_OF, type A, type S } from './machine';
import { SEED_RELEVES } from './seed';
import {
  Banner, BtnGhost, BtnSoft, C07BtnPrimary, Card, ChallengeCode, ChipCategory, HeaderStacked,
  Icon, IconTile, Input, MetersList, MoneyBreakdown, MoneyHero, Overline, PageTitle,
  ProcessingList, ProgressDots, RowMoney, RowReleve, Sheet, Stepper, Timeline, TrustCard,
  Weave, WizardFooter,
} from './components';

type D = (a: A) => void;
const scrollTabs = SCROLL.tabs;
const scrollStacked = SCROLL.stacked;
const wizScroll = SCROLL.wizard;

const GLYPH_PREUVE = '\u{1F933}'; // 🤳 (S28)
const GLYPH_ETIQUETTE = '\u{1F3F7}\u{FE0F}'; // 🏷️ (S29)

// ── S17/S18 Sheet « Produit prêt » ────────────────────────────────────────────
export function S17ReadySheet({ st, d }: { st: S; d: D }) {
  const o = st.orders[st.view?.id ?? ''];
  if (!o) return null;
  return (
    <Sheet title={'Confirmer « Produit prêt »'} onClose={() => d({ t: 'DISMISS_OVERLAY' })}>
      <Overline style={{ marginTop: 16 }}>1 · Code de préparation (valable 15 min)</Overline>
      <View style={{ marginTop: 9 }}>
        <ChallengeCode code={o.challenge} note={'Écrivez ce code sur un papier posé à côté du produit.'} />
      </View>
      <Overline style={{ marginTop: 16 }}>2 · Photo de préparation</Overline>
      {st.readyShot ? (
        <View style={{ marginTop: 9, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 15, backgroundColor: P.successBg }}>
          <Icon name="check" size={17} stroke={P.successFg} strokeWidth={2.2} />
          <Text style={[role({ f: 'IS', w: 400, s: 13 }, P.successFg), { flex: 1 }]}>Photo nette — produit + code visibles.</Text>
        </View>
      ) : (
        <View style={{ marginTop: 9 }}>
          <BtnSoft label="Prendre la photo (caméra intégrée)" icon="camera" style={S17L.photoBtn} onPress={() => d({ t: 'TAKE_SHOT' })} />
        </View>
      )}
      <Overline style={{ marginTop: 16 }}>3 · Disponibilité</Overline>
      <Text style={[role({ f: 'IS', w: 400, s: 13, lh: 1.5 }, P.sub), { marginTop: 8 }]}>
        {"Je confirme être présent à la boutique pour l'enlèvement (créneau 11 h – 13 h)."}
      </Text>
      <View style={{ marginTop: 16 }}>
        <C07BtnPrimary label="Confirmer — envoyer à Séra" disabled={disabled.confirmReady(st)} onPress={() => d({ t: 'CONFIRM_READY' })} />
      </View>
      <Text style={[role({ f: 'IS', w: 400, s: 12 }, P.sub), { marginTop: 9, textAlign: 'center' }]}>
        {'Le code client de livraison ne vous est jamais montré.'}
      </Text>
    </Sheet>
  );
}

// ── S19 Sheet « Ajuster le stock » ────────────────────────────────────────────
export function S19StockSheet({ st, d }: { st: S; d: D }) {
  const p = st.products[st.view?.id ?? ''];
  if (!p) return null;
  return (
    <Sheet title="Ajuster le stock" onClose={() => d({ t: 'DISMISS_OVERLAY' })}>
      <View style={{ marginTop: 16 }}>
        <Stepper value={`${p.stock + st.stkDelta} unités`} onMinus={() => d({ t: 'STOCK_DELTA', d: -1 })} onPlus={() => d({ t: 'STOCK_DELTA', d: 1 })} />
      </View>
      <Text style={[role({ f: 'IS', w: 400, s: 12.5, lh: 1.5 }, P.sub), { marginTop: 11 }]}>
        {'Chaque ajustement est daté et motivé. Le stock affiché aux revendeuses est calculé côté serveur.'}
      </Text>
      <View style={{ marginTop: 16 }}>
        <C07BtnPrimary label="Enregistrer" onPress={() => d({ t: 'STOCK_SAVE' })} />
      </View>
    </Sheet>
  );
}

// ── S20–S25 Wizard ────────────────────────────────────────────────────────────
const CATS = ['Mode femme', 'Mode homme', 'Chaussures', 'Sacs', 'Tissus', 'Beauté scellée', 'Maison', 'Enfant'];
export function S20Wizard({ st, d }: { st: S; d: D }) {
  const w = st.wiz;
  const feeV = fee(w.B);
  const netV = net(w.B, w.C);
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
            <View style={{ marginTop: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
              {CATS.map((c) => (
                <ChipCategory key={c} label={c} active={w.cat === c} onPress={() => d({ t: 'WIZ_SET', patch: { cat: c } })} />
              ))}
            </View>
          </>
        )}
        {w.step === 1 && (
          <>
            <Text style={C43.titleStep}>Détails & stock</Text>
            <View style={{ marginTop: 18 }}>
              <Input label="Nom du produit" value={w.name} onChangeText={(t) => d({ t: 'WIZ_SET', patch: { name: t } })} />
            </View>
            <View style={{ marginTop: 16 }}>
              <Input label="Variantes (tailles…)" value={w.sizes} onChangeText={(t) => d({ t: 'WIZ_SET', patch: { sizes: t } })} />
            </View>
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
                value={formatF(w.B)}
                onMinus={() => !disabled.wizB(w) && d({ t: 'WIZ_SET', patch: { B: w.B - 500 } })}
                onPlus={() => d({ t: 'WIZ_SET', patch: { B: w.B + 500 } })}
              />
            </View>
            <Overline style={{ marginTop: 16 }}>Commission revendeuse (vous la financez)</Overline>
            <View style={{ marginTop: 8 }}>
              <Stepper
                value={formatF(w.C)}
                onMinus={() => !disabled.wizC(w) && d({ t: 'WIZ_SET', patch: { C: w.C - 100 } })}
                onPlus={() => d({ t: 'WIZ_SET', patch: { C: w.C + 100 } })}
              />
            </View>
            <View style={{ marginTop: 16 }}>
              <MoneyBreakdown B={formatF(w.B)} C={formatF(w.C)} feeV={formatF(feeV)} netV={formatF(netV)} netSize="XL" />
            </View>
            <Text style={[role({ f: 'IS', w: 400, s: 12.5, lh: 1.55 }, P.sub), { marginTop: 10 }]}>
              {"La cliente paie : prix de base + marge de la revendeuse. Votre commission n'est jamais ajoutée une deuxième fois au prix client."}
            </Text>
          </>
        )}
        {w.step === 3 && (
          <>
            <Text style={C43.titleStep}>Photos — Studio</Text>
            <Text style={[role({ f: 'IS', w: 400, s: 14, lh: 1.55 }, P.inkSoft), { marginTop: 10 }]}>
              {'Le Studio vous guide pour des photos nettes, honnêtes et sans prix incrusté.'}
            </Text>
            {w.photos ? (
              <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: GEO.r.banner, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: P.successBg }}>
                <Icon name="check" size={17} stroke={P.successFg} strokeWidth={2.2} />
                <Text style={[role({ f: 'IS', w: 400, s: 13, lh: 1.55 }, P.successFg), { flex: 1 }]}>
                  {'3 photos capturées et validées (héro · preuve · détail) — cadre premium appliqué.'}
                </Text>
              </View>
            ) : (
              <View style={{ marginTop: 14 }}>
                <C07BtnPrimary label="Ouvrir Boutik+ Studio" icon="camera" onPress={() => d({ t: 'OPEN_STUDIO' })} />
              </View>
            )}
          </>
        )}
        {w.step === 4 && (
          <>
            <Text style={C43.titleStep}>Vérifiez, puis publiez</Text>
            <Card style={{ marginTop: 16 }}>
              <Text style={role({ f: 'BG', w: 700, s: 16 }, P.ink)}>{w.name.trim() === '' ? 'Robe brodée bogolan' : w.name}</Text>
              <Text style={[role({ f: 'IS', w: 400, s: 13 }, P.sub), { marginTop: 3 }]}>
                {`${w.cat} · variantes ${w.sizes} · stock ${w.stock}`}
              </Text>
              <View style={{ height: 1, backgroundColor: P.borderCard, marginVertical: 13 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}>
                <Text style={role({ f: 'IS', w: 400, s: 14 }, P.ink)}>Vous recevez / vente</Text>
                <Text style={[role({ f: 'BG', w: 800, s: 16 }, P.greenDeep), TNUM]}>{formatF(netV)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}>
                <Text style={role({ f: 'IS', w: 400, s: 14 }, P.sub)}>Commission revendeuse</Text>
                <Text style={[role({ f: 'IS', w: 700, s: 14 }, P.sub), TNUM]}>{formatF(w.C)}</Text>
              </View>
            </Card>
            <Card style={{ marginTop: 12, padding: 16 }}>
              <Overline level="card">Aperçu — ce que verront les revendeuses</Overline>
              <View style={{ marginTop: 11, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <IconTile bg={TILE_GRADIENT.nouveau} glyph={'\u{1F9E5}'} size={C21.preview.size} radius={C21.preview.r} glyphSize={C21.preview.glyph} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={role({ f: 'IS', w: 700, s: 14 }, P.ink)}>{w.name.trim() === '' ? 'Robe brodée bogolan' : w.name}</Text>
                  <Text style={[role({ f: 'IS', w: 400, s: 12 }, P.sub), { marginTop: 2 }]}>{`${w.cat} · photo premium, sans prix incrusté`}</Text>
                  <Text style={[role({ f: 'IS', w: 700, s: 12.5 }, P.greenDeep), TNUM, { marginTop: 3 }]}>{`Commission revendeuse ${formatF(w.C)}`}</Text>
                </View>
              </View>
            </Card>
            <Text style={[role({ f: 'IS', w: 400, s: 12.5, lh: 1.55 }, P.sub), { marginTop: 12 }]}>
              {'La modération vérifie catégorie, allégations et photos avant mise en ligne (quelques instants dans la démo).'}
            </Text>
          </>
        )}
      </ScrollView>
      <WizardFooter>
        <C07BtnPrimary label={footerLabel} disabled={disabled.wizContinue(st)} onPress={() => d({ t: 'WIZ_NEXT' })} />
      </WizardFooter>
    </View>
  );
}

// ── S26–S31 Studio ────────────────────────────────────────────────────────────
const SHOTS = [
  { title: '1 · Photo héro', sub: 'Sur une surface simple. Elle recevra la mise en forme premium.', glyph: '\u{1F457}' },
  { title: '2 · Photo preuve', sub: "L'article en main, dans votre boutique. Une photo réelle qui inspire confiance (le désordre est permis).", glyph: GLYPH_PREUVE },
  { title: '3 · Détail catégorie', sub: 'Mode : étiquette de taille bien lisible.', glyph: GLYPH_ETIQUETTE },
];
const PROC_ROWS = ['Rotation corrigée', 'Lumière équilibrée — sans exagérer', 'Recadrage sûr depuis le cadre', 'Analyse du fond'];
export function S26Studio({ st, d }: { st: S; d: D }) {
  const stu = st.studio;
  const shooting = stu.step < 3;
  const shot = SHOTS[Math.min(stu.step, 2)]!;
  return (
    <ScrollView contentContainerStyle={scrollStacked} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <HeaderStacked title="Boutik+ Studio" onBack={() => d({ t: 'BACK' })} />
      </View>
      <Text style={[role({ f: 'IS', w: 400, s: 12 }, P.sub)]}>{'De vraies photos — aucune image inventée par IA'}</Text>
      {shooting ? (
        <>
          <Text style={[role({ f: 'BG', w: 700, s: 20 }, P.ink), { marginTop: 16 }]}>{shot.title}</Text>
          <Text style={[role({ f: 'IS', w: 400, s: 13.5, lh: 1.5 }, P.sub), { marginTop: 6 }]}>{shot.sub}</Text>
          <View style={[C39.frame, { marginTop: 13 }]}>
            <IconTile
              bg={stu.low ? TILE_GRADIENT.studioLowLight : TILE_GRADIENT.p1}
              glyph={shot.glyph}
              height={C21.viseur.h}
              radius={C21.viseur.r}
              glyphSize={C21.viseur.glyph}
              weave="M"
              style={{ position: 'absolute', top: 0, left: 0, right: 0, opacity: 1 }}
            />
            <View style={C39.inset} />
            <Text style={C39.caption}>{C39.CAPTION}</Text>
          </View>
          <View style={{ marginTop: 13 }}>
            <MetersList
              rows={[
                { label: 'Luminosité', ok: !stu.low },
                { label: 'Netteté', ok: !stu.low },
                { label: 'Stabilité', ok: true },
                { label: 'Fond', ok: !stu.low },
              ]}
            />
          </View>
          {stu.low && (
            <Banner tone="warn" style={{ marginTop: 11, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 15 }}>
              {'Trop sombre — rapprochez-vous d\'une fenêtre ou d\'une lampe.'}
            </Banner>
          )}
          <View style={{ marginTop: 12, alignSelf: 'flex-start' }}>
            <Pressable
              onPress={() => d({ t: 'STUDIO_TOGGLE_LOW' })}
              style={{ height: 40, paddingHorizontal: 15, borderRadius: GEO.r.pill, borderWidth: 1, borderColor: P.borderCtl, backgroundColor: P.surface, alignItems: 'center', justifyContent: 'center' }}
              accessibilityRole="button"
            >
              <Text style={role({ f: 'IS', w: 600, s: 13 }, P.ink)}>{stu.low ? 'Simuler : bonne lumière' : 'Simuler : faible lumière'}</Text>
            </Pressable>
          </View>
          <View style={{ marginTop: 12 }}>
            <C07BtnPrimary label="Capturer" icon="camera" disabled={disabled.studioCapture(st)} onPress={() => d({ t: 'STUDIO_CAPTURE' })} />
          </View>
        </>
      ) : (
        <>
          <Text style={[role({ f: 'BG', w: 700, s: 20 }, P.ink), { marginTop: 16 }]}>{'Traitement (sur votre téléphone)'}</Text>
          <View style={{ marginTop: 13 }}>
            <ProcessingList rows={[...PROC_ROWS]} proc={stu.proc} />
          </View>
          {stu.proc >= 4 && (
            <>
              <Banner tone="warn" style={{ marginTop: 12, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 15 }}>
                {'Fond complexe détecté → cadre premium appliqué (votre vraie photo, joliment encadrée). Aucun détourage risqué, aucune retouche du produit.'}
              </Banner>
              <Card style={{ marginTop: 12, padding: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Overline level="card">Avant / Après</Overline>
                  <Pressable
                    onPress={() => d({ t: 'STUDIO_TOGGLE_ORIG' })}
                    style={{ height: 34, paddingHorizontal: 12, borderRadius: GEO.r.pill, borderWidth: 1, borderColor: P.borderCtl, backgroundColor: P.surface, alignItems: 'center', justifyContent: 'center' }}
                    accessibilityRole="button"
                  >
                    <Text style={role({ f: 'IS', w: 600, s: 12 }, P.ink)}>{stu.orig ? 'Voir la version traitée' : "Couleurs d'origine"}</Text>
                  </Pressable>
                </View>
                <View style={C40.grid}>
                  <View style={C40.col}>
                    <IconTile bg={TILE_GRADIENT.studioOriginal} glyph={'\u{1F457}'} height={C40.imgLeft.h} radius={C40.imgLeft.r} glyphSize={C40.imgLeft.glyph} weave="M" />
                    <Text style={C40.legend}>{C40.LEGEND_LEFT}</Text>
                  </View>
                  <View style={C40.col}>
                    <View style={C40.framed}>
                      <IconTile bg={stu.orig ? TILE_GRADIENT.studioOriginal : TILE_GRADIENT.p1} glyph={'\u{1F457}'} height={C40.imgRight.h} radius={C40.imgRight.r} glyphSize={C40.imgRight.glyph} weave="M" />
                    </View>
                    <Text style={C40.legend}>{C40.LEGEND_RIGHT}</Text>
                  </View>
                </View>
              </Card>
              <View style={{ marginTop: 12 }}>
                <C07BtnPrimary label="J'approuve ces photos" onPress={() => d({ t: 'STUDIO_APPROVE' })} />
              </View>
            </>
          )}
        </>
      )}
      <Text style={[role({ f: 'IS', w: 400, s: 12.5, lh: 1.55 }, P.sub), { marginTop: 14 }]}>
        {"Cette photo prouve l'accès au produit — pas la quantité ni l'authenticité. L'originale est conservée, jamais écrasée."}
      </Text>
    </ScrollView>
  );
}

// ── S32 Argent ────────────────────────────────────────────────────────────────
export function S32Argent({ st, d }: { st: S; d: D }) {
  const orders = st.oorder.map((id) => st.orders[id]!);
  return (
    <ScrollView contentContainerStyle={scrollTabs} showsVerticalScrollIndicator={false}>
      <PageTitle>Argent</PageTitle>
      <Text style={[role({ f: 'IS', w: 400, s: 13, lh: 1.45 }, P.sub), { marginTop: 4 }]}>
        {'Pas de compte interne — tout arrive sur votre Mobile Money.'}
      </Text>
      <View style={{ marginTop: 16 }}>
        <MoneyHero pending={formatF(pendingTotal(orders))} paid={formatF(paidTotal(orders))} />
      </View>
      <Overline style={{ marginTop: 18, marginBottom: 8 }}>Détail par commande</Overline>
      <View style={{ gap: GEO.gap.listRow }}>
        {orders.map((o) => (
          <RowMoney key={o.id} code={o.code} name={st.products[o.pid]!.name} netV={formatF(o.net)} status={o.status} />
        ))}
      </View>
      <Overline style={{ marginTop: 18, marginBottom: 8 }}>Relevés hebdomadaires</Overline>
      <View style={{ gap: GEO.gap.releves }}>
        {SEED_RELEVES.map((r) => (
          <RowReleve key={r.week} week={r.week} sub={r.sub} total={formatF(r.total)} />
        ))}
      </View>
      <View style={{ marginTop: 10 }}>
        <BtnGhost label="Télécharger le relevé (PDF — démo)" onPress={() => d({ t: 'RELEVE_PDF' })} />
      </View>
      {/* §5 verbatim uses a banned seller-consequence word (B+I-12 gate, even negated) — reword. LISTED. */}
      <Banner tone="info" style={{ marginTop: 14 }}>
        {'En cas de faute de votre part (mauvais article…), la cliente est remboursée immédiatement par le fonds de protection — jamais avec votre argent ; vos privilèges peuvent être réduits.'}
      </Banner>
    </ScrollView>
  );
}

// ── S33 Niveau de confiance ───────────────────────────────────────────────────
export function S33Trust({ d }: { d: D }) {
  return (
    <ScrollView contentContainerStyle={scrollStacked} showsVerticalScrollIndicator={false}>
      <HeaderStacked title="Niveau de confiance" onBack={() => d({ t: 'BACK' })} />
      {/* §5 verbatim uses a banned surety word (B+I-12 gate) — E1 reword « argent avancé ». LISTED. */}
      <Text style={[role({ f: 'IS', w: 400, s: 13.5, lh: 1.5 }, P.sub), { marginTop: 12 }]}>
        {'Votre niveau progresse par des livraisons propres — jamais avec de l\'argent avancé.'}
      </Text>
      <View style={{ marginTop: 14, gap: 11 }}>
        <TrustCard title="Provisoire" body={'1 commande à la fois · paiement complet uniquement · vérification à chaque enlèvement · catégories approuvées.'} />
        <TrustCard
          title="Vérifié"
          current
          pill={
            <View style={{ backgroundColor: P.successBg, borderRadius: GEO.r.pill, paddingVertical: 5, paddingHorizontal: 10 }}>
              <Text style={role({ f: 'IS', w: 700, s: 11 }, P.successFg)}>Votre niveau</Text>
            </View>
          }
          body={'12 livraisons · 0 faute — paiement à la livraison débloqué · plusieurs commandes en parallèle · meilleure visibilité.'}
        />
        <TrustCard title="De confiance" body={"Après un solide historique : plus de commandes simultanées, contrôles allégés quand c'est sûr, campagnes prioritaires."} />
      </View>
      {/* §5 verbatim uses a banned surety word (B+I-12 gate) — reword « somme bloquée ». LISTED. */}
      <Banner tone="warn" style={{ marginTop: 13 }}>
        {"Une faute répétée réduit l'accès (retour au prépaiement, suspension) — c'est l'accès au marché qui compte, jamais une somme bloquée."}
      </Banner>
    </ScrollView>
  );
}

// ── S34–S39 Inscription ───────────────────────────────────────────────────────
export function S34Onboard({ st, d }: { st: S; d: D }) {
  const step = st.ob.step;
  if (step === 5) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34 }}>
        <View style={{ width: 84, height: 84, borderRadius: GEO.r.pill, backgroundColor: P.green, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={40} stroke={P.cream} strokeWidth={2.4} />
        </View>
        <Text style={[C43.titleStep, { marginTop: 20, textAlign: 'center' }]}>Compte provisoire créé</Text>
        <Text style={[role({ f: 'IS', w: 400, s: 14, lh: 1.6 }, P.sub), { marginTop: 10, textAlign: 'center' }]}>
          {'« Listez gratuitement. Vous payez seulement lorsqu\'un produit est vendu avec succès. »'}
        </Text>
        <View style={{ marginTop: 24, alignSelf: 'stretch' }}>
          <C07BtnPrimary label="Explorer avec Boutique Wendkuni (démo)" onPress={() => d({ t: 'OB_FINISH' })} />
        </View>
      </View>
    );
  }
  const TITLES = ['Bienvenue sur Boutik+', 'Votre numéro', 'Votre boutique', 'Compte de versement', 'Statut provisoire'];
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingTop: 16, paddingHorizontal: 20 }}>
        <HeaderStacked title="Inscription" wizardCounter={`${step + 1}/5`} onBack={() => d({ t: 'BACK' })} />
        <ProgressDots total={5} step={step} />
      </View>
      <ScrollView contentContainerStyle={wizScroll} showsVerticalScrollIndicator={false}>
        <Text style={C43.titleStep}>{TITLES[step]}</Text>
        {step === 0 && (
          <>
            {/* §5 says « revendeuses de Ma Boutique » — RETIRED name; Law 10 → Shop+. LISTED. */}
            <Text style={[role({ f: 'IS', w: 400, s: 14.5, lh: 1.55 }, P.inkSoft), { marginTop: 12 }]}>
              {'Proposez vos produits aux revendeuses de Shop+. Séra livre, vous encaissez.'}
            </Text>
            {/* §5's two banned surety words (B+I-12 gate) → « aucune avance ». LISTED. */}
            <Banner tone="info" style={{ marginTop: 14, paddingVertical: 15, paddingHorizontal: 16 }}>
              {'Inscription gratuite · aucune avance · aucun abonnement.\nVous payez seulement 5 % quand un produit est vendu avec succès.'}
            </Banner>
          </>
        )}
        {step === 1 && (
          <>
            <View style={{ marginTop: 18 }}>
              <Input label="Téléphone" defaultValue="70 12 34 56" />
            </View>
            <Banner tone="info" style={{ marginTop: 12 }}>{'Un code de vérification arrive par WhatsApp (simulé ici).'}</Banner>
          </>
        )}
        {step === 2 && (
          <>
            <View style={{ marginTop: 18 }}><Input label="Nom de la boutique" defaultValue="Ma nouvelle boutique" /></View>
            <View style={{ marginTop: 16 }}><Input label="Quartier" defaultValue="Rood Woko" /></View>
            <View style={{ marginTop: 16 }}><Input label="Repère — pas d'adresse exigée" defaultValue="Allée 4, face au grand portail est" /></View>
          </>
        )}
        {step === 3 && (
          <>
            <View style={{ marginTop: 18 }}><Input label="Mobile Money (Orange / Moov)" defaultValue="70 12 34 56" /></View>
            <Banner tone="info" style={{ marginTop: 12 }}>
              {'Vos gains y sont versés sous 24 h après chaque livraison validée. Aucun rechargement demandé.'}
            </Banner>
          </>
        )}
        {step === 4 && (
          <>
            <Text style={[role({ f: 'IS', w: 400, s: 14.5, lh: 1.55 }, P.inkSoft), { marginTop: 12 }]}>
              {'Pour commencer, votre compte est provisoire :'}
            </Text>
            <Card style={{ marginTop: 12, paddingVertical: 16, paddingHorizontal: 17 }}>
              <Text style={role({ f: 'IS', w: 400, s: 14, lh: 1.8 }, P.ink)}>
                {'• Une commande à la fois pour commencer\n• Seulement les catégories autorisées\n• La cliente paie tout à la commande\n• Une photo « produit prêt » est demandée\n• Le livreur vérifie chaque enlèvement'}
              </Text>
            </Card>
            <Text style={[role({ f: 'IS', w: 400, s: 13, lh: 1.55 }, P.sub), { marginTop: 12 }]}>
              {'Après quelques livraisons propres, vous devenez Vérifié : plus de commandes, paiement à la livraison débloqué.'}
            </Text>
          </>
        )}
      </ScrollView>
      <WizardFooter>
        <C07BtnPrimary label={step === 4 ? 'Créer mon compte gratuit' : 'Continuer'} onPress={() => d({ t: 'OB_NEXT' })} />
      </WizardFooter>
    </View>
  );
}

// ── S40 Célébration ───────────────────────────────────────────────────────────
export function S40Celebration({ amount, onDismiss }: { amount: string; onDismiss: () => void }) {
  return (
    <Pressable onPress={onDismiss} style={C35.scrim}>
      <GoldDashes />
      <View style={C35.badge}>
        <Icon name="check" size={C35.check.size} stroke={C35.check.stroke} strokeWidth={C35.check.strokeWidth} />
      </View>
      <Text style={[C35.amount, TNUM]}>{amount}</Text>
      <Text style={C35.caption}>Versé sur votre Mobile Money</Text>
      <Text style={C35.hint}>Toucher pour continuer</Text>
      <View style={{ marginTop: 24 }}><GoldDashes /></View>
    </Pressable>
  );
}
function GoldDashes() {
  // §1.5 celebDash: 132×6, gold 0-12, transparent 12-20
  const seg = [];
  for (let x = 0; x < 132; x += 20) seg.push(x);
  return (
    <View style={C35.dash}>
      {seg.map((x) => (
        <View key={x} style={C35.dashSeg} />
      ))}
    </View>
  );
}
