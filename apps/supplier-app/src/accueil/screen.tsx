import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { SCROLL, TNUM, role } from '../ui/v2/styles';
import { GEO } from '../ui/v2/tokens';
import { t } from '../i18n';
import { Banner, BtnSoft, C07BtnPrimary, Card, Overline, PageTitle, VignetteProduit } from '../v2/components';
import type { A } from '../v2/machine';
import { resolveMediaBase } from '../supply/media';
import { photoUri } from '../supply/produits-view';
import { SUPPLIER_ID, resolveSupplyService, type SupplierOfferRow } from '../supply/service';
import { resolveOperationsService, type PaidOrderRow } from '../operations/service';
import { attenteDepuis, segmenter } from '../commandes/view';
import { plusAnciennes, stockBas } from './view';

/**
 * ═══ RB-4 — THE REAL ACCUEIL (founder direction 2026-08-08) ═══
 *
 * « The whole boutik+ screens except ops console are still mocked and not
 * showing real data. De-mock all of it and make real data flow into them. »
 *
 * This screen replaces the demo S02Accueil, and with it the LAST route into
 * the demo store: no seed persona, no invented orders, no fabricated money.
 * What it shows, it read:
 *
 *   · the product count and low-stock nudge — his OWN offers, the same
 *     `listOffers` read the Produits tab already trusts;
 *   · « À faire maintenant » — the real paid-order book (ops key), the same
 *     board the Commandes tab reads; the home shows the head of the queue
 *     and every tap lands ON that tab, never on a copy of it;
 *   · the two counts — ventes payées and prêtes à confier — COUNTS of real
 *     rows, never a summed franc (client-side money sums are forbidden;
 *     the Gains tab serves the money, frozen).
 *
 * NO DOOR LIVES HERE. The ops key is typed in Opérations and only READ here:
 * a refused key shows the honest sans-clé line and leaves the stored slot
 * alone — clearing another screen's credential from a screen with no door
 * would strand the founder with no way back in from where he stands.
 *
 * Without the key (any other person opening the web app): products, the
 * wizard, the promise banner — and no order data at all.
 */

const SOUS = role({ f: 'IS', w: 400, s: 14, lh: 1.5 }, P.sub);
const CORPS = role({ f: 'IS', w: 400, s: 13 }, P.sub);
const PETIT = role({ f: 'IS', w: 400, s: 12 }, P.sub);
const NOM_ROW = role({ f: 'IS', w: 700, s: 14.5 }, P.ink);
const CHIFFRE = role({ f: 'BG', w: 800, s: 26 }, P.greenDeep);

type Offres =
  | { kind: 'indisponible' }
  | { kind: 'chargement' }
  | { kind: 'echec' }
  | { kind: 'ok'; rows: readonly SupplierOfferRow[] };

type Ventes =
  | { kind: 'sans_cle' }
  | { kind: 'chargement' }
  | { kind: 'echec' }
  | { kind: 'ok'; aTraiter: readonly PaidOrderRow[]; enAttente: number; pretes: number; total: number };

export function SAccueilReel({ d, opsKey }: { d: (a: A) => void; opsKey: string | null }) {
  // PHOTO-À-TRAITER — read once per mount, exactly as `produits-real.tsx` does.
  // Null (unset `EXPO_PUBLIC_MEDIA_BASE`) means no thumbnail anywhere, never a
  // broken image.
  const mediaBase = useMemo(() => resolveMediaBase(), []);
  const [offres, setOffres] = useState<Offres>({ kind: 'chargement' });
  const [ventes, setVentes] = useState<Ventes>({ kind: opsKey === null ? 'sans_cle' : 'chargement' });
  const [recharge, setRecharge] = useState(0);

  useEffect(() => {
    let alive = true;
    const supply = resolveSupplyService();
    if (supply === null) {
      setOffres({ kind: 'indisponible' });
    } else {
      setOffres({ kind: 'chargement' });
      void supply.listOffers(SUPPLIER_ID).then((r) => {
        if (!alive) return;
        setOffres(r.ok ? { kind: 'ok', rows: r.value.items } : { kind: 'echec' });
      });
    }
    const operations = resolveOperationsService();
    if (opsKey === null || operations === null) {
      setVentes({ kind: 'sans_cle' });
    } else {
      setVentes({ kind: 'chargement' });
      void operations.listPaidOrders(opsKey).then((r) => {
        if (!alive) return;
        if (!r.ok) {
          // bad_key included: the honest line, and the slot stays — the
          // Opérations tab owns that credential's lifecycle (see header).
          setVentes(r.reason === 'bad_key' ? { kind: 'sans_cle' } : { kind: 'echec' });
          return;
        }
        // No fund key here, so claimed orders are not split out — the
        // Commandes tab (which reads the claims book) holds incident truth.
        // Same for the Séra board and the gains read: without them the road
        // facts are unknown here, so « prêtes » counts everything readyAt-set
        // (relayed or delivered included) — the tab itself splits the stages.
        const s = segmenter(r.orders, new Set(), new Set(), new Set());
        setVentes({
          kind: 'ok',
          aTraiter: plusAnciennes(s.a_traiter, 3),
          enAttente: s.a_traiter.length,
          pretes: s.pret.length,
          total: r.orders.length,
        });
      });
    }
    return () => {
      alive = false;
    };
  }, [opsKey, recharge]);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={SCROLL.tabs} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <PageTitle style={{ lineHeight: 28 * 1.1 }}>{t('accueil.greeting')}</PageTitle>
        <Pressable
          onPress={() => d({ t: 'OPEN_TRUST' })}
          style={{ minHeight: 44, justifyContent: 'center' }}
          accessibilityRole="link"
        >
          <Text style={[role({ f: 'IS', w: 700, s: 12.5 }, P.greenDeep), { textDecorationLine: 'underline' }]}>
            {t('accueil.engagement')}
          </Text>
        </Pressable>
      </View>
      <Text style={[SOUS, { marginTop: 8 }]}>
        {offres.kind === 'ok'
          ? t('accueil.greeting_sub').replace('{n}', String(offres.rows.length))
          : t('accueil.tagline')}
      </Text>

      {ventes.kind === 'sans_cle' ? (
        <Text style={[CORPS, { marginTop: 18 }]}>{t('accueil.sans_cle')}</Text>
      ) : ventes.kind === 'chargement' ? (
        <Text style={[CORPS, { marginTop: 18 }]}>{t('commandes.chargement')}</Text>
      ) : ventes.kind === 'echec' ? (
        <View style={{ marginTop: 18, gap: 8 }}>
          <Text style={CORPS}>{t('commandes.echec')}</Text>
          <BtnSoft label={t('commandes.reessayer')} onPress={() => setRecharge((n) => n + 1)} />
        </View>
      ) : (
        <>
          {ventes.aTraiter.length > 0 ? (
            <>
              <View style={{ marginTop: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Overline>{t('accueil.section_todo')}</Overline>
                <View style={{ backgroundColor: P.dangerBg, borderRadius: GEO.r.pill, paddingVertical: 3, paddingHorizontal: 9 }}>
                  <Text style={[role({ f: 'IS', w: 700, s: 11 }, P.dangerFg), TNUM]}>{ventes.enAttente}</Text>
                </View>
              </View>
              <View style={{ marginTop: 10, gap: GEO.gap.listRow }}>
                {ventes.aTraiter.map((row) => {
                  const brut = attenteDepuis(row.paidAt, Date.now());
                  const attente = brut === 'commandes.instant' ? t(brut) : brut;
                  return (
                    <Pressable key={row.orderId} onPress={() => d({ t: 'TAB', tab: 'commandes' })} accessibilityRole="button">
                      <Card style={{ paddingVertical: 13, paddingHorizontal: 15 }}>
                        {/* PHOTO-À-TRAITER — the photograph leads the row, and
                            the text keeps its own column so a row WITHOUT one
                            reads identically to the row he has today. */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: GEO.gap.grid }}>
                          <VignetteProduit uri={photoUri(row.productPhotoRef, mediaBase)} />
                          <View style={{ flex: 1 }}>
                            <Text style={NOM_ROW} numberOfLines={1}>
                              {row.productName !== '' ? row.productName : row.orderId}
                            </Text>
                            <Text style={[PETIT, { marginTop: 3 }]} numberOfLines={1}>
                              {`${attente}${row.zoneTo !== '' ? ` · ${row.zoneTo}` : ''}`}
                            </Text>
                          </View>
                        </View>
                      </Card>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : (
            <Text style={[CORPS, { marginTop: 18 }]}>{t('commandes.vide_a_traiter')}</Text>
          )}

          <View style={{ marginTop: 16, flexDirection: 'row', gap: GEO.gap.grid }}>
            <Card style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 15 }}>
              <Text style={PETIT}>{t('accueil.ventes_payees')}</Text>
              <Text style={[CHIFFRE, TNUM, { marginTop: 4 }]}>{ventes.total}</Text>
            </Card>
            <Card style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 15 }}>
              <Text style={PETIT}>{t('accueil.pretes_confier')}</Text>
              <Text style={[CHIFFRE, TNUM, { marginTop: 4 }]}>{ventes.pretes}</Text>
            </Card>
          </View>
          <View style={{ marginTop: 10 }}>
            <BtnSoft label={t('accueil.voir_commandes')} onPress={() => d({ t: 'TAB', tab: 'commandes' })} />
          </View>
        </>
      )}

      <View style={{ marginTop: 16 }}>
        <C07BtnPrimary label={t('accueil.card_nouveau')} icon="plus" onPress={() => d({ t: 'OPEN_WIZ' })} />
      </View>

      {offres.kind === 'ok' && stockBas(offres.rows).length > 0 ? (
        <Card style={{ marginTop: 14, paddingVertical: 15, paddingHorizontal: 16 }}>
          <Overline level="card">{t('accueil.stock_bas')}</Overline>
          <View style={{ marginTop: 8, gap: 4 }}>
            {stockBas(offres.rows).map((o) => (
              <Text key={o.offerId} style={CORPS} numberOfLines={1}>
                {`${o.name} · ${t('accueil.reste')} ${o.available}`}
              </Text>
            ))}
          </View>
        </Card>
      ) : null}

      <Banner tone="info" style={{ marginTop: 14 }}>
        {t('fp.accueil_gratuite_note')}
      </Banner>
      {/* AUDIT-B+1 F18 lesson kept: 44px min touch box, layout not hitSlop
          (react-native-web Pressable has no hitSlop). */}
      <Pressable
        onPress={() => d({ t: 'OPEN_ONBOARD' })}
        style={{ marginTop: 9, minHeight: 44, justifyContent: 'center' }}
        accessibilityRole="link"
      >
        <Text style={[role({ f: 'IS', w: 700, s: 12.5 }, P.greenDeep), { textDecorationLine: 'underline' }]}>
          {t('accueil.gratuite_link')}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
