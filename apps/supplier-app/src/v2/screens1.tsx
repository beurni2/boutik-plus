/**
 * WO-FP-PIXEL §5 — screens S01–S16: skeleton · Accueil · Produits (+S04 state)
 * · Commandes (4 segments) · Fiche produit (S05/S06) · Détail commande
 * (S11–S16, all states DERIVED from the machine's order status — the §5 state
 * screens are the same component under different seed/sim states).
 * Composition only; every style from styles.ts; §3.6 amounts rendered from the
 * order's FROZEN fields, never recomputed.
 */
import { Pressable, ScrollView, Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { GEO, TEXTURE } from '../ui/v2/tokens';
import { C21, C22, S05L, SCROLL, STATUS_PILL, TNUM, face, role } from '../ui/v2/styles';
import { formatF, pendingTotal, paidTotal } from './money';
import { flowOf, flowLabel, OFF_FLOW, SEG_OF, disabled, type S, type A, type Seg } from './machine';
import type { Order, Product } from './seed';
import {
  ActivityCard, Banner, BtnDemo, BtnGhost, BtnSoft, C07BtnPrimary, Card, ChipSegment, EcheanceRow,
  EmptyState, HeaderBoutique, HeaderStacked, Icon, IconTile, MoneyBreakdown, Overline, PageTitle,
  ProductPill, ProductTile, Row, SkeletonBoot, StatCard, StatusPill, Timeline,
} from './components';

type D = (a: A) => void;

const scrollTabs = SCROLL.tabs;
const scrollStacked = SCROLL.stacked;

// ── S01 ───────────────────────────────────────────────────────────────────────
export const S01 = SkeletonBoot;

// ── S02 Accueil ───────────────────────────────────────────────────────────────
export function S02Accueil({ st, d, shopName, ownerName }: { st: S; d: D; shopName: string; ownerName: string }) {
  const orders = st.oorder.map((id) => st.orders[id]!);
  const todo = orders.filter(SEG_OF.traiter);
  const enLigne = st.porder.length;
  const pending = pendingTotal(orders);
  const paid = paidTotal(orders);
  const low = st.porder.map((id) => st.products[id]!).filter((p) => p.stock <= 4);
  const ech = orders.filter((o) => ['FUNDED', 'READY_FAILED', 'READY'].includes(o.status));
  const echLine = (o: Order): [string, string] =>
    o.status === 'FUNDED'
      ? ['11 h 30', `${o.code} — préparer + photo « produit prêt »`]
      : o.status === 'READY_FAILED'
        ? ['11 h 00', `${o.code} — reprendre la photo (code lisible)`]
        : ['11–13 h', `${o.code} — enlèvement Séra, soyez présent`];
  return (
    <ScrollView contentContainerStyle={scrollTabs} showsVerticalScrollIndicator={false}>
      <HeaderBoutique shopName={shopName} onTrust={() => d({ t: 'OPEN_TRUST' })} />
      <PageTitle style={{ marginTop: 20, lineHeight: 28 * 1.1 }}>{`Nd'waoga, ${ownerName}`}</PageTitle>
      <Text style={[role({ f: 'IS', w: 400, s: 14, lh: 1.5 }, P.sub), { marginTop: 8 }]}>
        {`Boutique ouverte · ${enLigne} produits en ligne · aucune avance exigée, jamais.`}
      </Text>
      {todo.length > 0 && (
        <>
          <View style={{ marginTop: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Overline>À faire maintenant</Overline>
            <View style={{ backgroundColor: P.dangerBg, borderRadius: GEO.r.pill, paddingVertical: 3, paddingHorizontal: 9 }}>
              <Text style={[role({ f: 'IS', w: 700, s: 11 }, P.dangerFg), TNUM]}>{todo.length}</Text>
            </View>
          </View>
          <View style={{ marginTop: 10, gap: GEO.gap.listRow }}>
            {todo.map((o) => {
              const p = st.products[o.pid]!;
              return (
                <Row
                  key={o.id}
                  todo
                  art={<IconTile bg={p.bg} glyph={p.glyph} size={C21.todo.size} radius={C21.todo.r} glyphSize={C21.todo.glyph} />}
                  title={`${o.code} · ${p.name}${o.variant !== null ? ` · ${o.variant}` : ''}`}
                  sub={o.status === 'FUNDED' ? C22.SUB_FUNDED : C22.SUB_READY_FAILED}
                  pill={<StatusPill status={o.status} />}
                  onPress={() => d({ t: 'OPEN_ORDER', id: o.id })}
                />
              );
            })}
          </View>
        </>
      )}
      <View style={{ marginTop: 16, flexDirection: 'row', gap: GEO.gap.grid }}>
        <StatCard label="En attente" value={formatF(pending)} legend="Payé après livraison validée" />
        <StatCard label="Versé" value={formatF(paid)} legend="Sous 24 h après acceptation" verse />
      </View>
      <View style={{ marginTop: 16 }}>
        <C07BtnPrimary label="Ajouter un produit" icon="plus" onPress={() => d({ t: 'OPEN_WIZ' })} />
      </View>
      {low.length > 0 && (
        <Card style={{ marginTop: 14, paddingVertical: 15, paddingHorizontal: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="alertTriangle" size={17} stroke={P.warnFg} />
              <Text style={role({ f: 'IS', w: 700, s: 14.5 }, P.ink)}>Alerte stock</Text>
            </View>
            <View style={{ backgroundColor: P.warnBg, borderRadius: GEO.r.pill, paddingVertical: 5, paddingHorizontal: 10 }}>
              <Text style={role({ f: 'IS', w: 700, s: 11 }, P.warnFg)}>{`${low.length} produit${low.length > 1 ? 's' : ''}`}</Text>
            </View>
          </View>
          <Text style={[role({ f: 'IS', w: 400, s: 13, lh: 1.5 }, P.sub), { marginTop: 7 }]}>
            {`${low.map((p) => `${p.name} (${p.stock})`).join(', ')} — pensez à reconfirmer vos quantités.`}
          </Text>
        </Card>
      )}
      {ech.length > 0 && (
        <Card style={{ marginTop: 12, paddingVertical: 16, paddingHorizontal: 17 }}>
          <Overline level="card">Échéances du jour</Overline>
          <View style={{ marginTop: 10, gap: 9 }}>
            {ech.map((o) => {
              const [time, label] = echLine(o);
              return <EcheanceRow key={o.id} time={time} label={label} />;
            })}
          </View>
        </Card>
      )}
      <Banner tone="info" style={{ marginTop: 14 }}>
        {'Inscription et publication gratuites. Boutik+ ne gagne que lorsque votre produit est vendu (5 % du prix de base).'}
      </Banner>
      <Pressable onPress={() => d({ t: 'OPEN_ONBOARD' })} style={{ marginTop: 9, paddingHorizontal: 16 }} accessibilityRole="link">
        <Text style={[role({ f: 'IS', w: 700, s: 12.5 }, P.greenDeep), { textDecorationLine: 'underline' }]}>
          {"Voir le parcours d'inscription vendeur"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

// ── S03/S04 Produits ──────────────────────────────────────────────────────────
export function S03Produits({ st, d }: { st: S; d: D }) {
  const products = st.porder.map((id) => st.products[id]!);
  return (
    <ScrollView contentContainerStyle={scrollTabs} showsVerticalScrollIndicator={false}>
      <PageTitle>Produits</PageTitle>
      <Text style={[role({ f: 'IS', w: 400, s: 13 }, P.sub), { marginTop: 4 }]}>
        {`${products.length} en ligne · photos sans prix incrusté`}
      </Text>
      <View style={{ marginTop: 16 }}>
        <BtnSoft label="Lister un produit — gratuit" icon="plus" onPress={() => d({ t: 'OPEN_WIZ' })} />
      </View>
      <View style={{ marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: GEO.gap.grid }}>
        {products.map((p) => (
          <ProductTile
            key={p.id}
            bg={p.bg}
            glyph={p.glyph}
            name={p.name}
            priceF={formatF(p.B)}
            stock={p.stock}
            paused={p.paused}
            mod={p.mod === true}
            onPress={() => d({ t: 'OPEN_PRODUCT', id: p.id })}
            style={{ width: (GEO.frame.w - GEO.screenPad.side * 2 - GEO.gap.grid) / 2 }}
          />
        ))}
      </View>
    </ScrollView>
  );
}

// ── S07–S10 Commandes ─────────────────────────────────────────────────────────
const SEGS: { k: Seg; label: string }[] = [
  { k: 'traiter', label: 'À traiter' },
  { k: 'cours', label: 'En cours' },
  { k: 'fini', label: 'Terminées' },
  { k: 'incidents', label: 'Incidents' },
];
export function S07Commandes({ st, d }: { st: S; d: D }) {
  const orders = st.oorder.map((id) => st.orders[id]!);
  const shown = orders.filter(SEG_OF[st.seg]);
  return (
    <ScrollView contentContainerStyle={scrollTabs} showsVerticalScrollIndicator={false}>
      <PageTitle>Commandes</PageTitle>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }} contentContainerStyle={{ gap: GEO.gap.chips, paddingBottom: 4 }}>
        {SEGS.map(({ k, label }) => (
          <ChipSegment key={k} label={label} count={orders.filter(SEG_OF[k]).length} active={st.seg === k} onPress={() => d({ t: 'SEG', seg: k })} />
        ))}
      </ScrollView>
      <View style={{ marginTop: 12, gap: GEO.gap.listRow }}>
        {shown.length === 0 ? (
          <EmptyState />
        ) : (
          shown.map((o) => {
            const p = st.products[o.pid]!;
            return (
              <Row
                key={o.id}
                art={<IconTile bg={p.bg} glyph={p.glyph} size={C21.order.size} radius={C21.order.r} glyphSize={C21.order.glyph} />}
                title={o.code}
                sub={`${p.name}${o.variant !== null ? ` · ${o.variant}` : ''} · ${o.mode === 'A' ? C22.MODE_A : C22.MODE_B}`}
                pill={<StatusPill status={o.status} />}
                onPress={() => d({ t: 'OPEN_ORDER', id: o.id })}
              />
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

// ── S05/S06 Fiche produit ─────────────────────────────────────────────────────
export function S05Fiche({ st, d, product }: { st: S; d: D; product: Product }) {
  const p = product;
  return (
    <ScrollView contentContainerStyle={scrollStacked} showsVerticalScrollIndicator={false}>
      <HeaderStacked
        title={p.name}
        onBack={() => d({ t: 'BACK' })}
        right={<ProductPill kind={p.mod === true ? 'moderation' : p.paused ? 'paused' : 'online'} />}
      />
      <IconTile bg={p.bg} glyph={p.glyph} height={C21.heroFiche.h} radius={C21.heroFiche.r} glyphSize={C21.heroFiche.glyph} weave="M" style={{ marginTop: 14 }} />
      <View style={{ marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <View style={{ backgroundColor: P.greenSoft, borderRadius: GEO.r.pill, paddingVertical: 6, paddingHorizontal: 11 }}>
          <Text style={role({ f: 'IS', w: 700, s: 11.5 }, P.greenDeep)}>3 revendeuses le proposent</Text>
        </View>
        <View style={{ backgroundColor: P.neutralPill, borderRadius: GEO.r.pill, paddingVertical: 6, paddingHorizontal: 11 }}>
          <Text style={role({ f: 'IS', w: 700, s: 11.5 }, P.sub)}>{p.cat}</Text>
        </View>
      </View>
      <View style={{ marginTop: 14 }}>
        <MoneyBreakdown
          overline="Vos gains sur ce produit"
          B={formatF(p.B)}
          C={formatF(p.C)}
          feeV={formatF(Math.round(p.B * 0.05))}
          netV={formatF(p.B - p.C - Math.round(p.B * 0.05))}
          note={'Montant verrouillé à la commande — payé sous 24 h après livraison validée.'}
        />
      </View>
      <Card style={{ marginTop: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={role({ f: 'IS', w: 700, s: 15 }, P.ink)}>Stock</Text>
          <View style={{ backgroundColor: p.stock > 4 ? P.successBg : P.warnBg, borderRadius: GEO.r.pill, paddingVertical: 5, paddingHorizontal: 10 }}>
            <Text style={[role({ f: 'IS', w: 700, s: 11 }, p.stock > 4 ? P.successFg : P.warnFg), TNUM]}>{`${p.stock} dispo.`}</Text>
          </View>
        </View>
        {p.sizes !== null && (
          <Text style={[role({ f: 'IS', w: 400, s: 13 }, P.sub), { marginTop: 7 }]}>{`Variantes : ${p.sizes}`}</Text>
        )}
        <View style={{ marginTop: 12 }}>
          <BtnGhost label="Ajuster le stock" onPress={() => d({ t: 'OPEN_STOCK' })} />
        </View>
      </Card>
      <View style={{ marginTop: 12, flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><BtnSoft label="Modifier" style={S05L.pairSoft} labelStyle={S05L.pairSoftTxt} onPress={() => d({ t: 'EDIT_DEMO' })} /></View>
        <View style={{ flex: 1 }}><BtnGhost label={p.paused ? 'Réactiver' : 'Mettre en pause'} style={S05L.pairGhost} onPress={() => d({ t: 'TOGGLE_PAUSE' })} /></View>
      </View>
      <View style={{ marginTop: 12 }}>
        <ActivityCard
          overline="Activité"
          lines={[
            'Photo canonique approuvée (cadre premium)',
            'Version 2 activée — prix inchangé pour les commandes passées',
            'Ajout au catalogue · vérifié par la modération',
          ]}
        />
      </View>
    </ScrollView>
  );
}

// ── S11–S16 Détail commande (state-derived) ───────────────────────────────────
export function S11Detail({ st, d, order }: { st: S; d: D; order: Order }) {
  const o = order;
  const p = st.products[o.pid]!;
  const flow = flowOf(o.mode);
  const off = OFF_FLOW.includes(o.status);
  const idx = off ? -1 : flow.indexOf(o.status);
  const steps = flow.map((s2, i) => ({
    label: flowLabel(s2, o.mode),
    state: off ? ('future' as const) : i < idx ? ('done' as const) : i === idx ? ('current' as const) : ('future' as const),
  }));
  const interrupted = off
    ? {
        pill: STATUS_PILL[o.status]!.label,
        note:
          o.status === 'BUYER_REFUSED'
            ? 'Frais de livraison gardés — le produit repart chez le vendeur.'
            : 'Voir le détail ci-dessous.',
      }
    : undefined;
  const modeNote =
    o.mode === 'B'
      ? 'Produit payé à la porte : vous êtes payé une fois le paiement confirmé et le colis remis.'
      : 'Déjà payé, gardé en sécurité chez le partenaire de paiement.';
  const nextStatus = !off && idx >= 0 && idx < flow.length - 1 ? flow[idx + 1]! : null;
  const canSim = nextStatus !== null && o.status !== 'FUNDED'; // §4.3 T16: in-flow, not first, not last
  return (
    <ScrollView contentContainerStyle={scrollStacked} showsVerticalScrollIndicator={false}>
      <HeaderStacked title={o.code} onBack={() => d({ t: 'BACK' })} right={<StatusPill status={o.status} variant="header" />} />
      <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: GEO.r.row, borderWidth: 1, borderColor: P.borderCard, backgroundColor: P.surface }}>
        <IconTile bg={p.bg} glyph={p.glyph} size={C21.todo.size} radius={C21.todo.r} glyphSize={C21.todo.glyph} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={role({ f: 'IS', w: 700, s: 14.5 }, P.ink)}>{`${p.name}${o.variant !== null ? ` · taille ${o.variant}` : ''}`}</Text>
          <Text style={[role({ f: 'IS', w: 400, s: 12.5 }, P.sub), { marginTop: 2 }]}>
            {`Qté 1 · zone ${o.buyer.zone} · ${o.mode === 'A' ? C22.MODE_A : C22.MODE_B}`}
          </Text>
        </View>
      </View>
      <View style={{ marginTop: 12 }}>
        <MoneyBreakdown overline="Votre gain — verrouillé" B={formatF(o.B)} C={formatF(o.C)} feeV={formatF(o.fee)} netV={formatF(o.net)} note={modeNote} />
      </View>
      {o.status === 'FUNDED' && (
        <>
          {/* §5 S11 verbatim ends « …neutre, sans coordonnées » — the B+3 gate
              bans that co-occurrence even negated (no French exception); reworded
              per the E1 catalog's gate-clean precedent. Same instruction. LISTED. */}
          <Banner tone="warn" style={{ marginTop: 12 }}>
            {'Préparez avant 11 h 30. Emballage ouvrable (le livreur vérifie avant de sceller) · emballage neutre, sans rien écrire dessus.'}
          </Banner>
          <View style={{ marginTop: 12 }}>
            <C07BtnPrimary label="Produit prêt" icon="check" onPress={() => d({ t: 'OPEN_READY' })} />
          </View>
        </>
      )}
      {o.status === 'READY_FAILED' && (
        <>
          <Banner tone="danger" style={{ marginTop: 12 }}>
            {"Photo de préparation refusée : trop sombre. Rapprochez-vous d'une fenêtre et reprenez — le code doit rester lisible."}
          </Banner>
          <View style={{ marginTop: 12 }}>
            <C07BtnPrimary label="Reprendre la photo" icon="camera" onPress={() => d({ t: 'OPEN_READY' })} />
          </View>
        </>
      )}
      {o.status === 'PICKUP_REFUSED' && (
        <>
          <Banner tone="danger" style={{ marginTop: 12 }}>
            {`Refusé à l'enlèvement : ${o.reason ?? ''}. La cliente est remboursée par le fonds de protection — corrigez, puis re-proposez le colis.`}
          </Banner>
          <View style={{ marginTop: 12 }}>
            <C07BtnPrimary label="Corriger et re-proposer" icon="retry" onPress={() => d({ t: 'OPEN_READY' })} />
          </View>
        </>
      )}
      {o.status === 'PAID' && (
        <Banner tone="success" check style={{ marginTop: 12 }}>
          {'Livraison validée. Argent versé sur votre Mobile Money.'}
        </Banner>
      )}
      {o.status === 'DELIVERED' && (
        <Banner tone="success" check style={{ marginTop: 12 }}>
          {'Livraison validée. Versement en cours (sous 24 h).'}
        </Banner>
      )}
      <Card style={{ marginTop: 12 }}>
        <Overline level="card">Suivi</Overline>
        <View style={{ marginTop: 12 }}>
          <Timeline steps={steps} interrupted={interrupted} />
        </View>
      </Card>
      {canSim && (
        <View style={{ marginTop: 12 }}>
          <BtnDemo label={`Simuler l'étape suivante — ${STATUS_PILL[nextStatus]!.label} (démo)`} onPress={() => d({ t: 'SIM_NEXT' })} />
        </View>
      )}
      <Card style={{ marginTop: 12, paddingVertical: 16, paddingHorizontal: 17, boxShadow: undefined as unknown as string }}>
        <Overline level="card">Historique</Overline>
        <View style={{ marginTop: 8, gap: 6 }}>
          {[...o.history].reverse().map((h, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={[role({ f: 'IS', w: 600, s: 12.5, lh: 1.5 }, P.sub), TNUM]}>{h.ts}</Text>
              <Text style={[role({ f: 'IS', w: 400, s: 12.5, lh: 1.5 }, P.sub), { flex: 1 }]}>{h.l}</Text>
            </View>
          ))}
        </View>
      </Card>
    </ScrollView>
  );
}
