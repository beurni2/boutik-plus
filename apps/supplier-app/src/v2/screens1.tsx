/**
 * WO-FP-PIXEL §5 — the skeleton (S01), Produits (S03/S04) and the real offer's
 * fiche. Composition only; every style from styles.ts.
 *
 * LISTER-VRAI-1 (founder 2026-09-30, « make room »): the demo Accueil,
 * Commandes, Fiche produit and Détail commande are gone — the console's real
 * home and real paid-order book replaced them and nothing routed to them.
 */
import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { GEO } from '../ui/v2/tokens';
import { SCROLL, TNUM, role } from '../ui/v2/styles';
import { formatF } from './money';
import type { A } from './machine';
import type { SupplierOfferRow } from '../supply/service';
import { t as tr } from '../i18n';
import { FicheVideo } from './fiche-video';
import { dateCourte, fenetreVente, galleryPhotos, lireQuantite, phraseCachee, photoSlot, stockEtat, type GalleryPhoto, type HiddenReason } from '../supply/produits-view';
import {
  Banner, BtnGhost, BtnSoft, Card, HeaderStacked, Input, PageTitle,
  OfferTile, PhotoViewer, SkeletonBoot,
} from './components';

type D = (a: A) => void;

const scrollTabs = SCROLL.tabs;

// ── S01 ───────────────────────────────────────────────────────────────────────
export const S01 = SkeletonBoot;

// ── S03/S04 Produits ──────────────────────────────────────────────────────────
/**
 * PRODUITS — REAL OFFERS ONLY (founder rulings 2026-07-25).
 *
 * IT NO LONGER READS `st.products` / `st.porder`. Those held the demo board's
 * fixture (deleted, LISTER-VRAI-1) and this screen has NO BINDING to them — option (b),
 * and it is what makes a mock unable to reach a tile. The rows are handed down
 * by `SProduitsReal`, which owns the read.
 *
 * WHAT THE TILE DROPPED, and why — every one had NO REAL SOURCE:
 *   · `glyph` / `bg` — demo decoration. A decorative glyph sitting where
 *     evidence belongs is the same lie as a fake count, so a photograph-less
 *     offer says « Sans photo » instead.
 *   · `paused` — `catalog-service/src/moderation.ts` records the field as
 *     "deliberately NOT modelled". A pause control would change nothing on the
 *     wire: a dead switch that lies.
 *   · `mod` — `moderationState` exists but authoring self-approves, so the badge
 *     would always be absent. It returns when moderation is real.
 * `sizes` renders `variantsNote` VERBATIM — his typed words, never reformatted
 * into the board's « S · M · L » style.
 *
 * TILES ARE NOT TAPPABLE THIS SLICE. There is no fiche for a real offer and
 * `st.products` holds no entry for one, so a tap would land on the id-miss
 * guard. A dead tap is worse than no tap; the detail screen is its own slice.
 */
export function S03Produits({ rows, mediaBase, d, header, onOpen, filtre, attribution }: {
  rows: readonly SupplierOfferRow[];
  mediaBase: string | null;
  d: D;
  header?: boolean;
  /** Opens the offer's fiche (founder device ruling 2026-07-26). */
  onOpen?: ((r: SupplierOfferRow) => void) | undefined;
  /** PRODUITS-PAR-FOURNISSEUR — the supplier chip row, composed by the wrapper
   *  (it owns the roster and the ops key). Absent ⇒ nothing renders, and this
   *  screen is byte-identical to what it was. */
  filtre?: React.ReactNode;
  /**
   * WHOSE product each row is, positionally aligned with `rows`. Present ONLY
   * when more than one supplier is on screen (`montreAttribution`) — a label
   * repeating the same id on every row of a single-supplier list teaches
   * nothing. Absent ⇒ no line, exactly as before.
   */
  attribution?: readonly string[];
}) {
  const live = rows.filter((r) => r.hiddenReason === undefined).length;
  // ONE COLUMN, LARGE CARDS (founder device ruling 2026-07-26: « make it more
  // bigger so I can see clearly the photo and the description »). The two-up
  // grid put a 12MP photograph in 154 points; judging a product photo is the
  // whole job of this screen.
  // THE CARDS SHARE THE PHOTO COLUMN CAP (founder 2026-07-27: the produits
  // photos were still the old big ones - the photo IS the card's top, so the
  // card column centers at the same cap the fiche uses; inert on phones).
  const body = (
    <View style={{ marginTop: 14, gap: GEO.gap.grid, width: '100%', maxWidth: PHOTO_COLUMN_MAX, alignSelf: 'center' }}>
      {rows.map((r, i) => (
        <View key={r.offerId}>
          {attribution?.[i] !== undefined && (
            <Text style={[role({ f: 'IS', w: 700, s: 11.5 }, P.sub), { marginBottom: 5 }]} numberOfLines={1}>
              {attribution[i]}
            </Text>
          )}
          <OfferTile
            name={r.name}
            {...(r.videoRef === undefined || r.videoRef === '' || mediaBase === null
              ? {}
              : { clipUri: `${mediaBase}/${r.videoRef}` })}
            priceF={formatF(r.basePrice)}
            stock={r.available}
            variants={r.variantsNote}
            photo={photoSlot(r.assetRefs, mediaBase)}
            hiddenNote={r.hiddenReason === undefined ? undefined : phraseEnClair(phraseCachee({ ...r, hiddenReason: r.hiddenReason as HiddenReason }, Date.now()))}
            large
            {...(onOpen === undefined ? {} : { onPress: () => onOpen(r) })}
          />
        </View>
      ))}
    </View>
  );
  if (header !== true) return body;
  return (
    <ScrollView contentContainerStyle={scrollTabs} showsVerticalScrollIndicator={false}>
      <PageTitle>Produits</PageTitle>
      <Text style={[role({ f: 'IS', w: 400, s: 13 }, P.sub), { marginTop: 4 }]}>
        {`${live} en ligne · photos sans prix incrusté`}
      </Text>
      {filtre}
      <View style={{ marginTop: 16 }}>
        <BtnSoft label="Lister un produit — gratuit" icon="plus" onPress={() => d({ t: 'OPEN_WIZ' })} />
      </View>
      {body}
    </ScrollView>
  );
}

/**
 * THE FICHE OF A REAL OFFER (founder device ruling 2026-07-26: « tap each
 * product to see all the photo of the product and the details »).
 *
 * READS THE ROW HE TAPPED, nothing else — no service call, no machine state:
 * the list already holds every field the supplier list serves, so the fiche
 * cannot disagree with the tile that opened it. Photographs are the SHIPPED
 * refs in wire order, labelled by position (`galleryPhotos`, pure); tapping one
 * opens the full-screen viewer. A hidden offer states the ladder's own reason
 * here too — same sentence as the tile, same source.
 */
/** The photo column's cap, shared by the fiche gallery AND the Produits
 * cards. Ruled upward twice by the founder's eye (2026-07-27): 430 « too
 * small » → 560 → « a little more bigger again » → 680. One word changes it. */
const PHOTO_COLUMN_MAX = 680;

/** A catalog sentence with its date filled in (STOCK-VRAI-1 — the sale window). */
const phraseEnClair = (p: { readonly key: string; readonly date: string }): string => tr(p.key).replace('{date}', p.date);

/** STOCK-VRAI-1 (F-03) — what the count act answered: the counter it set, and the
 *  two numbers behind it (`null` when the service did not say). */
export interface StockConfirme {
  readonly available: number;
  readonly compte: number | null;
  readonly enAttente: number | null;
}

export function SOffreFiche({ row, mediaBase, onBack, onDelete, suppressionSansClePhotos, onConfirmStock, onAttente, onProlonger }: {
  row: SupplierOfferRow;
  mediaBase: string | null;
  onBack: () => void;
  /** OFFER-DELETE-1 (founder 2026-07-27). Resolves true when the offer is gone
   * (the parent closes this fiche); false surfaces the designed failure here.
   * Absent (service unconfigured) ⇒ no delete UI at all. */
  onDelete?: (() => Promise<boolean | 'reservee'>) | undefined;
  /** CLE-FONDATEUR-1 — the delete is not offered because this product has photos
   * and the photo key is not on this device: the fiche SAYS so where the
   * delete would be, instead of a silently missing action. */
  suppressionSansClePhotos?: boolean | undefined;
  /** STOCK-JOURNAL-1 (B5.2) — « Confirmer le stock »: the count he typed.
   * Resolves true when the service journaled it (the parent re-reads and this
   * fiche's row refreshes); false surfaces the designed failure here, with the
   * act still reachable. Absent (no ops key on this device) ⇒ the state line
   * only — the act is the founder's, never a supplier's (LISTER-POUR). */
  onConfirmStock?: ((available: number) => Promise<StockConfirme | false>) | undefined;
  /** STOCK-VRAI-1 (F-03) — the sold parcels still waiting for the rider, read
   *  when he opens the count so the question can name them; `null` when the
   *  read failed (the count still subtracts them on the server). */
  onAttente?: (() => Promise<number | null>) | undefined;
  /** STOCK-VRAI-1 (F-12) — « Prolonger d'un an ». Resolves to the server's new
   *  end date when it extended (the parent also re-reads); false shows the
   *  designed failure with the act still reachable. HIS act alone. */
  onProlonger?: (() => Promise<string | false>) | undefined;
}) {
  const [viewing, setViewing] = useState<GalleryPhoto | null>(null);
  // The delete walk: idle → confirm (the warning states what happens, in
  // words) → pending → failed (retryable). NEVER a one-tap destruction.
  const [del, setDel] = useState<'idle' | 'confirm' | 'pending' | 'failed' | 'reservee'>('idle');
  const runDelete = async () => {
    if (onDelete === undefined || del === 'pending') return;
    setDel('pending');
    const gone = await onDelete();
    if (gone === 'reservee') setDel('reservee');
    else if (!gone) setDel('failed');
    // on success the parent unmounts this fiche — no state to set here.
  };
  // The confirm walk: idle → saisie (he TYPES the count — the challenge
  // capture, never a one-tap « c'est bon ») → pending → failed (retryable) or
  // back to idle on success, where the refreshed row says the new date.
  const [stock, setStock] = useState<'idle' | 'saisie' | 'pending' | 'failed'>('idle');
  const [saisie, setSaisie] = useState('');
  const [saisieInvalide, setSaisieInvalide] = useState(false);
  /** STOCK-VRAI-1 (F-03) — the parcels waiting for the rider, as read when he opened the count. */
  const [attente, setAttente] = useState<number | null>(null);
  const [resultat, setResultat] = useState<StockConfirme | null>(null);
  const ouvrirSaisie = () => {
    setSaisieInvalide(false);
    setResultat(null);
    setAttente(null);
    setStock('saisie');
    if (onAttente !== undefined) void onAttente().then(setAttente);
  };
  const runConfirm = async () => {
    if (onConfirmStock === undefined || stock === 'pending') return;
    const n = lireQuantite(saisie);
    if (n === null) {
      setSaisieInvalide(true);
      return;
    }
    setSaisieInvalide(false);
    setStock('pending');
    const res = await onConfirmStock(n);
    if (res === false) {
      setStock('failed');
      return;
    }
    setStock('idle');
    setSaisie('');
    setResultat(res);
  };
  // STOCK-VRAI-1 (F-12) — « Prolonger d'un an »: idle → pending → failed (retryable)
  // or back to idle, saying the end the SERVER answered (verifier MAJOR: a row
  // not yet re-read still said « finie » and invited a second year).
  const [prolonger, setProlonger] = useState<'idle' | 'pending' | 'failed'>('idle');
  const [prolongeJusqu, setProlongeJusqu] = useState<string | null>(null);
  const runProlonger = async () => {
    if (onProlonger === undefined || prolonger === 'pending') return;
    setProlonger('pending');
    setProlongeJusqu(null);
    const fin = await onProlonger();
    if (fin === false) {
      setProlonger('failed');
      return;
    }
    setProlongeJusqu(fin);
    setProlonger('idle');
  };
  /** The renewal answered a later end than this row knows: the row is stale. */
  const rangeeEnRetard = prolongeJusqu !== null && !(Date.parse(row.expiry ?? '') >= Date.parse(prolongeJusqu));
  const fenetre = fenetreVente(row, Date.now());
  const etat = stockEtat(row);
  const photos = galleryPhotos(row.assetRefs, mediaBase);
  // VIDEO-PARTOUT — his clip, on his own product page (founder order
  // 2026-08-03). Absolutized through the SAME media base as the photographs.
  // F-52: no media base, no clip address — never « null/… ».
  const clipUri = row.videoRef === undefined || row.videoRef === '' || mediaBase === null ? undefined : `${mediaBase}/${row.videoRef}`;
  // F-52: photographs he HAS but this build cannot fetch are « indisponible »,
  // never « Sans photo » — the tile's own decision (`photoSlot`), reused.
  const sansGalerie = photoSlot(row.assetRefs, mediaBase);
  // TABS pad, not stacked: this screen lives INSIDE the Produits tab, so the
  // dock overlays it — the 60px stacked pad hid the detail card's last rows
  // behind the dock (founder report 2026-07-27); the 150 tabs pad clears it.
  return (
    <ScrollView contentContainerStyle={SCROLL.tabs} showsVerticalScrollIndicator={false}>
      <HeaderStacked title={row.name} onBack={onBack} />
      {row.hiddenReason !== undefined && !(rangeeEnRetard && row.hiddenReason === 'offer_not_effective') && (
        <View style={{ marginTop: 12 }}>
          <Banner tone="warn">{phraseEnClair(phraseCachee({ ...row, hiddenReason: row.hiddenReason as HiddenReason }, Date.now()))}</Banner>
        </View>
      )}
      <FicheVideo src={clipUri} poster={photos[0]?.uri} />
      {photos.length === 0 ? (
        <Text style={[role({ f: 'IS', w: 400, s: 13, lh: 1.55 }, P.sub), { marginTop: 14 }]}>
          {tr(sansGalerie.kind === 'unavailable' ? sansGalerie.message : 'produits.sans_photo')}
        </Text>
      ) : (
        photos.map((ph) => (
          <Pressable key={ph.uri} onPress={() => setViewing(ph)} accessibilityRole="button" style={{ marginTop: 14 }}>
            {/* THE PHOTO CAP (founder rulings 2026-07-27, in order: the
                screen-filling fiche photo on desktop, then — after a whole-app
                430 frame — *"the whole webapp the way it was, was good and my
                issue was the photo part only… keep this new way of displaying
                the photos but making a little more bigger"*. So: the app is
                full-width again and the PHOTO alone is capped, centered, at a
                size above the 430 he judged too small. On a phone the cap is
                inert — the screen is narrower than it. */}
            <Image
              source={{ uri: ph.uri }}
              style={{ width: '100%', maxWidth: PHOTO_COLUMN_MAX, alignSelf: 'center', aspectRatio: 1, borderRadius: GEO.r.iconTile }}
              resizeMode="cover"
            />
            <Text style={[role({ f: 'IS', w: 400, s: 11.5 }, P.sub), { marginTop: 6, textAlign: 'center' }]}>{ph.label}</Text>
          </Pressable>
        ))
      )}
      <Card style={{ marginTop: 16 }}>
        {([
          ['Catégorie', row.category],
          ['Variantes', row.variantsNote ?? '—'],
          ['Stock disponible', `${row.available}`],
          ['Prix de base', formatF(row.basePrice)],
          ['Commission revendeuse', formatF(row.resellerCommission)],
        ] as const).map(([label, value]) => (
          <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, gap: 12 }}>
            <Text style={role({ f: 'IS', w: 400, s: 14 }, P.sub)}>{label}</Text>
            <Text style={[role({ f: 'IS', w: 700, s: 14 }, P.ink), TNUM, { flexShrink: 1, textAlign: 'right' }]} numberOfLines={2}>{value}</Text>
          </View>
        ))}
        {/* STOCK-JOURNAL-1 — when the count was last vouched for. A pre-slice
            offer says « jamais confirmé » honestly; it is shown, not frozen. */}
        <Text style={[role({ f: 'IS', w: 400, s: 12.5, lh: 1.5 }, P.sub), { marginTop: 6 }]}>
          {etat.kind === 'jamais' ? tr(etat.message) : `${tr(etat.message)} ${etat.date}`}
        </Text>
        {/* STOCK-VRAI-1 (F-12) — the end of its year, said while it is live. */}
        {fenetre?.kind === 'en_ligne' && (
          <Text style={[role({ f: 'IS', w: 400, s: 12.5, lh: 1.5 }, P.sub), { marginTop: 2 }]}>
            {tr('produits.en_ligne_jusqu').replace('{date}', fenetre.date)}
          </Text>
        )}
      </Card>
      {/* STOCK-JOURNAL-1 — « Confirmer le stock », the challenge capture: he
          types what he has, the service journals it and restarts the clock.
          A failed send keeps the act reachable — never a dead end. */}
      {onConfirmStock !== undefined && (
        <View style={{ marginTop: 14 }}>
          {/* The WAY BACK is said only where the act exists (verifier MAJOR):
              a supplier reads the cause above and no instruction he cannot
              follow — the button is the founder's, so is this sentence. */}
          {etat.kind === 'gele' && stock !== 'pending' && (
            <Text style={[role({ f: 'IS', w: 400, s: 13, lh: 1.5 }, P.sub), { marginBottom: 10 }]}>
              {tr('produits.stock_gele_action')}
            </Text>
          )}
          {stock === 'failed' && (
            <Banner tone="warn" style={{ marginBottom: 10 }}>{tr('produits.stock_echec')}</Banner>
          )}
          {/* STOCK-VRAI-1 (F-03) — what the count did with the parcels waiting
              for the rider, said once after it, in his numbers. */}
          {stock === 'idle' && resultat !== null && resultat.compte !== null && resultat.enAttente !== null && resultat.enAttente > 0 && (
            <Text style={[role({ f: 'IS', w: 400, s: 13, lh: 1.5 }, P.sub), { marginBottom: 10 }]}>
              {tr(resultat.enAttente === 1 ? 'produits.stock_resultat_un' : 'produits.stock_resultat_n')
                .replace('{compte}', String(resultat.compte))
                .replace('{n}', String(resultat.enAttente))
                .replace('{available}', String(resultat.available))}
            </Text>
          )}
          {/* Verifier MINOR (STOCK-VRAI-1): fewer in hand than parcels already
              paid floors the counter at 0 — and the paid parcels with no item
              are said, with the road that exists for them. */}
          {stock === 'idle' && resultat !== null && resultat.compte !== null && resultat.enAttente !== null && resultat.compte < resultat.enAttente && (
            <Banner tone="warn" style={{ marginBottom: 10 }}>
              {resultat.enAttente - resultat.compte === 1
                ? tr('produits.stock_manque_un')
                : tr('produits.stock_manque_n').replace('{m}', String(resultat.enAttente - resultat.compte))}
            </Banner>
          )}
          {stock === 'idle' || stock === 'failed' ? (
            <BtnSoft label={tr('produits.stock_confirmer')} onPress={ouvrirSaisie} />
          ) : (
            <>
              {/* STOCK-VRAI-1 (F-03) — the parcels already sold are on his
                  shelf; the question says to count them, and takes them off. */}
              {attente !== null && (
                <Text style={[role({ f: 'IS', w: 400, s: 13, lh: 1.5 }, P.sub), { marginBottom: 10 }]}>
                  {attente === 0
                    ? tr('produits.stock_attente_zero')
                    : tr(attente === 1 ? 'produits.stock_attente_un' : 'produits.stock_attente_n').replace('{n}', String(attente))}
                </Text>
              )}
              {/* No placeholder: a challenge that displays its own answer is a
                  soft challenge (verifier note). The facts card above says the
                  current count; the field asks what he actually has. */}
              <Input
                label={tr('produits.stock_combien')}
                value={saisie}
                onChangeText={setSaisie}
                keyboardType="number-pad"
              />
              {saisieInvalide && (
                <Banner tone="warn" style={{ marginTop: 10 }}>{tr('produits.stock_invalide')}</Banner>
              )}
              <View style={{ marginTop: 10 }}>
                <BtnSoft
                  label={tr(stock === 'pending' ? 'produits.stock_envoi' : 'produits.stock_envoyer')}
                  onPress={() => { void runConfirm(); }}
                />
              </View>
              {stock !== 'pending' && (
                <BtnGhost label={tr('produits.stock_annuler')} onPress={() => { setSaisieInvalide(false); setStock('idle'); }} style={{ marginTop: 10 }} />
              )}
            </>
          )}
        </View>
      )}
      {/* STOCK-VRAI-1 (F-12) — « Prolonger d'un an », his key alone. Where the
          year is over, the way back is said beside the act that takes it. */}
      {onProlonger !== undefined && (
        <View style={{ marginTop: 14 }}>
          {fenetre?.kind === 'finie' && prolonger !== 'pending' && !rangeeEnRetard && (
            <Text style={[role({ f: 'IS', w: 400, s: 13, lh: 1.5 }, P.sub), { marginBottom: 10 }]}>
              {tr('produits.prolonger_action')}
            </Text>
          )}
          {prolonger === 'idle' && prolongeJusqu !== null && (
            <Text style={[role({ f: 'IS', w: 400, s: 13, lh: 1.5 }, P.sub), { marginBottom: 10 }]}>
              {tr('produits.prolonger_fait').replace('{date}', dateCourte(prolongeJusqu))}
            </Text>
          )}
          {prolonger === 'failed' && (
            <Banner tone="warn" style={{ marginBottom: 10 }}>{tr('produits.prolonger_echec')}</Banner>
          )}
          <BtnSoft
            label={tr(prolonger === 'pending' ? 'produits.prolonger_envoi' : 'produits.prolonger')}
            onPress={() => { void runProlonger(); }}
          />
        </View>
      )}
      {/* OFFER-DELETE-1 — the refusal path as dignified as the purchase path:
          the action whispers below the facts, the warning says exactly what
          happens and where, and confirming takes a second deliberate tap. */}
      {onDelete !== undefined && (
        <View style={{ marginTop: 18 }}>
          {del === 'failed' && (
            <Banner tone="warn" style={{ marginBottom: 10 }}>{tr('produits.supprimer_echec')}</Banner>
          )}
          {del === 'reservee' && (
            <Banner tone="info" style={{ marginBottom: 10 }}>{tr('produits.supprimer_reservee')}</Banner>
          )}
          {del === 'idle' || del === 'failed' || del === 'reservee' ? (
            <BtnGhost label={tr('produits.supprimer')} onPress={() => setDel('confirm')} />
          ) : (
            <>
              <Banner tone="warn">{tr('produits.supprimer_avert')}</Banner>
              <View style={{ marginTop: 10 }}>
                <BtnSoft
                  label={tr(del === 'pending' ? 'produits.supprimer_encours' : 'produits.supprimer_oui')}
                  labelStyle={{ color: P.dangerFg }}
                  onPress={() => { void runDelete(); }}
                />
              </View>
              {del !== 'pending' && (
                <BtnGhost label={tr('produits.supprimer_non')} onPress={() => setDel('idle')} style={{ marginTop: 10 }} />
              )}
            </>
          )}
        </View>
      )}
      {onDelete === undefined && suppressionSansClePhotos === true && (
        <Text style={[role({ f: 'IS', w: 400, s: 12.5 }, P.sub), { marginTop: 18 }]}>
          {tr('produits.supprimer_cle_photos')}
        </Text>
      )}
      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />
    </ScrollView>
  );
}
