import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { SCROLL, role } from '../ui/v2/styles';
import { t } from '../i18n';
import { Banner, BtnGhost, BtnSoft, C07BtnPrimary, Card, ChipCategory, Input, Overline, PageTitle, PhotoViewer } from '../v2/components';
import { formatF } from '../v2/money';
import { pickShots } from '../studio/pick';
import { nativeImageSource } from '../studio/pick-native';
import { bytesFromUri } from '../supply/uri-bytes';
import { resolveReadinessUpload } from './media-upload';
import { pretColis } from './pret-colis';
import {
  clearStoredCode,
  readStoredCode,
  resolveFournisseurService,
  storeCode,
  type FournisseurServicePort,
} from './service';
import {
  PRET_REPOS,
  aAccepterDuColis,
  fournisseurVue,
  modeVisible,
  pretChoisir,
  pretEnvoyer,
  pretIssue,
  pretPhotoEnMain,
  pretPhotoRefusee,
  produitsVue,
  type CarteFournisseur,
  type CommandeVue,
  type FournisseurRead,
  type PretUi,
  type ProduitsRead,
  type ZoneCommandes,
} from './view';
import { galleryPhotos, photoSlot, type GalleryPhoto } from '../supply/produits-view';
import { FicheVideo } from '../v2/fiche-video';
import { useWebFonts } from '../ui/web-fonts';
import type { ProduitVue } from './view';

/**
 * READINESS-WIRE-1b-ii — THE FOURNISSEUR SURFACE (founder ruling 2026-08-02:
 * « their webapp will be only able to accept commandes, upload photo prove of
 * readiness , and see all the follow up until product is delivered »).
 *
 * THIS ROOT IS THE WHOLE OF THEIR APP. It mounts via its own arm of the
 * entry fold (`EXPO_PUBLIC_ROOT=fournisseur`), so the authoring graph —
 * Studio, offers, the write key's client — is not hidden from this bundle,
 * it is ABSENT from it, and the fournisseur-bundle-absence gate proves that
 * on the real exported artifact.
 *
 * THE PHOTO RIDES THE ONE FUNNEL. A readiness proof is a photograph like any
 * other this platform ships: picked (`pickShots`, the same port the studio
 * uses), decoded, bounded, EXIF/XMP/IPTC-stripped, post-condition-checked —
 * there is no laxer path for it, and no branch in which unstripped bytes
 * leave the phone (Ten Laws #5's imaging discipline + the privacy scar).
 *
 * LAW-7 HONEST: nothing renders as done before the book answers. The send is
 * challenge → upload → strict confirmation, one spinner, and every refusal
 * keeps its own sentence (see `view.ts` — expired invites a retry, terms
 * mismatch says call the team).
 */

const REFRESH_EVERY_MS = 60_000;
/** How many good reads a confirmed code's verdict outlives its card by (F-20). */
const TENU_LECTURES = 2;

export function FournisseurApp() {
  // FOURNISSEUR-VRAI-1 (AUDIT-B+2 F-28) — the Faso Premium faces on his web
  // page too. Every text style here names them; without the loader every
  // supplier screen painted in a browser fallback face. Never gates a render.
  useWebFonts();
  const [code, setCode] = useState<string | null>(() => readStoredCode());
  // LISTER-POUR-1c — two views, ONE door: Commandes (his hands) and Mes
  // produits (his eyes). Both read through the same stored code; clearing it
  // from either returns to the door for both.
  /**
   * BOUTIK-SUIVI (founder, 2026-08-09) — the road, as three screens: what
   * needs his hands, what a coursier is carrying, what is finished. « Mes
   * produits » is his eyes-only shelf. One door, four views.
   *
   * ⚠ THE ROW'S ORDER AND THE LANDING TAB ARE THE FOUNDER'S, and they were
   * two separate rulings. « make the tabs orders be (Mes produits, Commandes ,
   * En route and Livre) » set the row; « i want the console to be opening on
   * Mes produits » then moved the landing to match it (both 2026-08-15).
   *
   * I had kept the landing on « Commandes » between the two, on the reasoning
   * that a supplier should open on the work waiting for him rather than on a
   * shelf. That was mine to raise and his to settle, and he settled it: the
   * console opens on what his shop IS, before what it owes.
   *
   * Both are walked in `test/rendu-onglets.test.tsx` — which MOUNTS this
   * console, the first test in this app to do so — and pinned SEPARATELY, so a
   * future reorder cannot move the landing by accident in either direction.
   */
  const [onglet, setOnglet] = useState<'commandes' | 'en_route' | 'livrees' | 'produits'>('produits');
  const onglets: readonly { readonly cle: typeof onglet; readonly label: string }[] = [
    { cle: 'produits', label: t('fournisseur.onglet_produits') },
    { cle: 'commandes', label: t('fournisseur.onglet_commandes') },
    { cle: 'en_route', label: t('fournisseur.onglet_en_route') },
    { cle: 'livrees', label: t('fournisseur.onglet_livrees') },
  ];
  return (
    <View style={{ flex: 1, backgroundColor: P.bg }}>
      {code === null ? (
        <SPorteCode onCodeSaved={setCode} />
      ) : (
        <>
          {/*
            ONE ROW, AS ON THE OPS CONSOLE (founder, 2026-08-10). The four tabs
            are chips in a horizontally scrolling row — the same component and
            the same geometry his own board uses, so the two surfaces read as
            one product. Scrolling rather than wrapping keeps every label
            whole: « Livré » squeezed to « Livr… » fails the 5-second test on
            the 320px phones this app targets. `flexGrow: 0` keeps the row
            content-height inside this flex column.
          */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, flexShrink: 0, paddingTop: 12 }}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 4 }}
          >
            {/* The active tab is STATED, not implied — the chip's own active
                treatment, not an opacity trick. */}
            {onglets.map((o) => (
              <ChipCategory key={o.cle} label={o.label} active={onglet === o.cle} onPress={() => setOnglet(o.cle)} />
            ))}
          </ScrollView>
          {onglet === 'produits' ? (
            <SMesProduits code={code} onCodeCleared={() => setCode(null)} />
          ) : (
            // ONE screen, three zones: the same `/fulfillment/mine` answer
            // feeds all of them, so a row can never be in two places at once.
            // `key` remounts it per zone — each screen starts on its own read.
            <SMesCommandes key={onglet} zone={onglet} code={code} onCodeCleared={() => setCode(null)} />
          )}
        </>
      )}
    </View>
  );
}

/* ───────────────────────────── mes produits ──────────────────────────────── */

/**
 * LISTER-POUR-1c — what the founder listed FOR HIM, read-only. « Real time »
 * here is what it is everywhere on this surface: the same 60-second interval
 * Commandes uses, a manual refresh, and the same monotonic read token so a
 * stale answer can never overwrite a fresh one. No edit exists on this screen
 * — not hidden, ABSENT: the port has no write, and the service refuses his
 * code on every offer write besides.
 */
function SMesProduits({ code, onCodeCleared }: { code: string; onCodeCleared: () => void }) {
  const service = useMemo<FournisseurServicePort | null>(() => resolveFournisseurService(), []);
  const [read, setRead] = useState<ProduitsRead>(() =>
    service === null ? { kind: 'not_configured' } : { kind: 'loading' },
  );
  const inFlight = useRef(false);
  const readSeq = useRef(0);
  const mediaBase = process.env.EXPO_PUBLIC_MEDIA_BASE ?? null;
  /** F-19 — the last refresh failed while a good list is on screen: the list
   *  stays, with a line saying it may have changed since. */
  const [perimee, setPerimee] = useState(false);

  const charger = async (force = false): Promise<void> => {
    if (service === null || (inFlight.current && !force)) return;
    inFlight.current = true;
    readSeq.current += 1;
    const seq = readSeq.current;
    try {
      const res = await service.listProduits(code);
      if (seq !== readSeq.current) return; // a newer read owns the screen
      if (res.ok) {
        setRead({ kind: 'ok', rows: res.produits });
        setPerimee(false);
      } else if (res.reason === 'bad_code') {
        setRead({ kind: 'bad_code' });
      } else {
        // FOURNISSEUR-VRAI-1 (AUDIT-B+2 F-19) — one failed refresh never
        // wipes a good list: the wall is for « never read at all ».
        setRead((prev) => (prev.kind === 'ok' ? prev : { kind: 'failed' }));
        setPerimee(true);
      }
    } finally {
      inFlight.current = false;
    }
  };

  useEffect(() => {
    void charger();
    const h = setInterval(() => {
      void charger();
    }, REFRESH_EVERY_MS);
    return () => clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vue = produitsVue(read);

  return (
    <ScrollView contentContainerStyle={SCROLL.tabs} showsVerticalScrollIndicator={false}>
      <PageTitle>{t('fournisseur.produits_titre')}</PageTitle>
      <View style={{ marginTop: 8 }}>
        <Text style={role({ f: 'IS', w: 400, s: 12.5, lh: 1.55 }, P.sub)}>{t('fournisseur.produits_intro')}</Text>
      </View>

      {perimee && (vue.kind === 'liste' || vue.kind === 'empty') && (
        <View style={{ marginTop: 14 }}>
          <Banner tone="warn">{t('fournisseur.liste_pas_a_jour')}</Banner>
        </View>
      )}

      {vue.kind === 'loading' && (
        <View style={{ marginTop: 14 }}>
          <Text style={role({ f: 'IS', w: 400, s: 13 }, P.sub)}>{t(vue.message)}</Text>
        </View>
      )}

      {(vue.kind === 'not_configured' || vue.kind === 'empty') && (
        <View style={{ marginTop: 14 }}>
          <Banner tone="info">{t(vue.message)}</Banner>
        </View>
      )}

      {vue.kind === 'bad_code' && (
        <View style={{ marginTop: 14 }}>
          <Banner tone="warn">{t(vue.message)}</Banner>
          <View style={{ marginTop: 14 }}>
            <C07BtnPrimary
              label={t('fournisseur.code_ressaisir')}
              icon="retry"
              onPress={() => {
                clearStoredCode();
                onCodeCleared();
              }}
            />
          </View>
        </View>
      )}

      {vue.kind === 'failed' && (
        <View style={{ marginTop: 14 }}>
          <Banner tone="warn">{t(vue.message)}</Banner>
          <View style={{ marginTop: 14 }}>
            <C07BtnPrimary label={t('fournisseur.reessayer')} icon="retry" onPress={() => { void charger(); }} />
          </View>
        </View>
      )}

      {vue.kind === 'liste' && (
        <>
          <View style={{ marginTop: 8 }}>
            <Text style={role({ f: 'BG', w: 700, s: 14 }, P.ink)}>
              {t('fournisseur.produits_en_ligne').replace('{n}', String(vue.enLigne))}
            </Text>
          </View>
          {vue.produits.map((prod) => (
            <CarteProduit key={prod.offerId} produit={prod} mediaBase={mediaBase} />
          ))}
          <View style={{ marginTop: 14 }}>
            <BtnSoft label={t('fournisseur.produits_actualiser')} onPress={() => { void charger(true); }} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

function CarteProduit({ produit, mediaBase }: { produit: ProduitVue; mediaBase: string | null }) {
  const slot = photoSlot(produit.assetRefs, mediaBase);
  const enLigne = produit.hiddenReason === undefined;
  /**
   * PHOTOS TAPPABLES (founder report 2026-08-03: « on there I can not tap to
   * see other photos »). He was right: this card showed ONE 74px thumbnail and
   * nothing opened, while the wire has carried every capture all along —
   * `produit.assetRefs` is the same list his Produits fiche walks.
   *
   * Reuses `galleryPhotos` + `PhotoViewer`, the two pieces the fiche already
   * uses, rather than inventing a viewer for this screen: one photo-opening
   * behaviour in the app means the two surfaces cannot drift apart, and it adds
   * no new French — the labels come from `galleryPhotos` as they do there.
   */
  const [viewing, setViewing] = useState<GalleryPhoto | null>(null);
  const photos = galleryPhotos(produit.assetRefs, mediaBase);
  return (
    <Card style={{ marginTop: 12, padding: 14 }}>
      {/* VIDEO-PARTOUT — his own clip, on his own surface. Under the row so the
          photo/name/price line he already reads keeps its shape; the poster is
          the same photograph the thumbnail shows, so nothing flashes. */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {slot.kind === 'photo' ? (
          // The identity thumbnail is now the tap target onto the first photo.
          <Pressable
            onPress={() => setViewing(photos[0] ?? null)}
            accessibilityRole="button"
            disabled={photos.length === 0}
          >
            <Image source={{ uri: slot.uri }} style={{ width: 74, height: 74, borderRadius: 10 }} resizeMode="cover" />
          </Pressable>
        ) : (
          <View style={{ width: 74, height: 74, borderRadius: 10, backgroundColor: P.borderCard, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={role({ f: 'IS', w: 400, s: 10 }, P.sub)}>{t(slot.message)}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={role({ f: 'BG', w: 700, s: 15 }, P.ink)} numberOfLines={2}>{produit.name}</Text>
          <Text style={[role({ f: 'IS', w: 700, s: 14 }, P.ink), { marginTop: 3 }]}>{formatF(produit.basePrice)}</Text>
          <Text style={[role({ f: 'IS', w: 400, s: 12.5 }, P.sub), { marginTop: 3 }]}>
            {t('fournisseur.produit_stock').replace('{n}', String(produit.available))}
          </Text>
          <Text style={[role({ f: 'IS', w: 700, s: 12.5 }, enLigne ? P.greenDeep : P.sub), { marginTop: 5 }]}>
            {t(produit.etatKey)}
          </Text>
        </View>
      </View>
      {/* …and EVERY OTHER capture, so « other photos » is not a promise the
          identity thumbnail alone cannot keep. Only when there is more than
          one: a strip repeating the single photo above it would be noise. */}
      {photos.length > 1 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {photos.map((ph) => (
            <Pressable key={ph.uri} onPress={() => setViewing(ph)} accessibilityRole="button">
              <Image source={{ uri: ph.uri }} style={{ width: 56, height: 56, borderRadius: 8 }} resizeMode="cover" />
            </Pressable>
          ))}
        </View>
      )}
      <FicheVideo
        src={produit.videoRef === undefined || produit.videoRef === '' || mediaBase === null ? undefined : `${mediaBase}/${produit.videoRef}`}
        poster={slot.kind === 'photo' ? slot.uri : undefined}
      />
      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />
    </Card>
  );
}

/* ───────────────────────────── the code door ─────────────────────────────── */

function SPorteCode({ onCodeSaved }: { onCodeSaved: (code: string) => void }) {
  const [draft, setDraft] = useState('');
  const trimmed = draft.trim();
  return (
    <ScrollView contentContainerStyle={SCROLL.tabs} showsVerticalScrollIndicator={false}>
      {/* FOURNISSEUR-VRAI-1 (AUDIT-B+2 F-25) — the door has its own title: it
          opens on « Mes produits », so « Mes commandes » promised a screen he
          would not land on. */}
      <PageTitle>{t('fournisseur.porte_titre')}</PageTitle>
      <View style={{ marginTop: 14 }}>
        <Banner tone="info">{t('fournisseur.code_explication')}</Banner>
      </View>
      <View style={{ marginTop: 16 }}>
        {/* F-06 — the phone is told this is a code: capitals, no correction. */}
        <Input
          label={t('fournisseur.code_libelle')}
          value={draft}
          onChangeText={setDraft}
          autoCapitalize="characters"
          autoCorrect={false}
          spellCheck={false}
        />
      </View>
      <View style={{ marginTop: 16 }}>
        <C07BtnPrimary
          label={t('fournisseur.code_ouvrir')}
          icon="check"
          onPress={() => {
            if (trimmed === '') return;
            storeCode(trimmed);
            onCodeSaved(trimmed);
          }}
        />
      </View>
      <View style={{ marginTop: 10 }}>
        <Text style={role({ f: 'IS', w: 400, s: 12 }, P.sub)}>{t('fournisseur.code_reste_ici')}</Text>
      </View>
    </ScrollView>
  );
}

/* ───────────────────────────── mes commandes ─────────────────────────────── */

function SMesCommandes({ code, zone, onCodeCleared }: { code: string; zone: ZoneCommandes; onCodeCleared: () => void }) {
  const service = useMemo<FournisseurServicePort | null>(() => resolveFournisseurService(), []);
  const [read, setRead] = useState<FournisseurRead>(() =>
    service === null ? { kind: 'not_configured' } : { kind: 'loading' },
  );
  const mediaBase = process.env.EXPO_PUBLIC_MEDIA_BASE ?? null;
  /**
   * PHOTOS SUR LES COMMANDES (founder, 2026-08-09: « on commandes put the
   * product photos to each commande »). The order carries no photo of its
   * own — the wire's allowlist is deliberately narrow — so the card joins on
   * `productVersionId` against the products he can already see on his own
   * « Mes produits » screen. BEST-EFFORT BY DESIGN: this read failing costs a
   * thumbnail, never the list, and a product he no longer lists degrades to
   * the honest « pas de photo » slot rather than a broken image.
   */
  const [photos, setPhotos] = useState<ReadonlyMap<string, readonly string[]>>(new Map());
  const inFlight = useRef(false);
  /** MONOTONIC READ TOKEN (verifier M3): load(force) bypasses the in-flight
   *  guard, so a background interval read and a post-act forced read can
   *  RACE — and if the stale response lands last, a just-accepted order
   *  re-renders its accept button for up to a minute on exactly the slow
   *  phones this app targets. Only the NEWEST read may write the screen. */
  const readSeq = useRef(0);
  const [pret, setPret] = useState<PretUi>(PRET_REPOS);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [acceptEchec, setAcceptEchec] = useState<string | null>(null);
  /** REMBOURSEMENT-2 (verifier MAJOR) — orders whose refusal came too late.
   *  Held HERE, not on the refusal control: the re-read turns the card
   *  « prête » and that control leaves the screen, so its own sentence would
   *  leave with it and the card would flip without a word. */
  const [refusTropTard, setRefusTropTard] = useState<ReadonlySet<string>>(new Set());
  /** F-19 — the last refresh failed while a good list is on screen. */
  const [perimee, setPerimee] = useState(false);
  /**
   * FOURNISSEUR-VRAI-1 (AUDIT-B+2 F-20) — a « code confirmé » he was shown,
   * HELD HERE until he refreshes by hand or changes tab (this screen remounts
   * per tab). The confirmed code writes the book's mark, so the minute refresh
   * moves the card to the next screen — and its verdict used to leave with it
   * while he was still handing the parcel over. Only the verdict is held,
   * never the card's stage.
   *
   * ⚠ AND IT IS BOUNDED (verifier BLOCKER): it lasts TENU_LECTURES good reads
   * — about two minutes, the time of a handover — then goes. Held « until he
   * refreshes by hand » alone, it sat for hours over the next parcel of the
   * same product, telling him to hand over a colis nobody had checked.
   */
  const [tenus, setTenus] = useState<readonly { readonly cle: string; readonly nom: string; readonly phrase: string; readonly lectures: number }[]>([]);
  const tenir = (cle: string, nom: string, phrase: string): void =>
    setTenus((prev) => [...prev.filter((x) => x.cle !== cle), { cle, nom, phrase, lectures: 0 }]);

  const load = async (force = false): Promise<void> => {
    if (service === null || (inFlight.current && !force)) return;
    inFlight.current = true;
    readSeq.current += 1;
    const seq = readSeq.current;
    try {
      const [res, prods] = await Promise.all([service.listMine(code), service.listProduits(code)]);
      if (seq !== readSeq.current) return; // a newer read owns the screen
      if (res.ok) {
        setRead({ kind: 'ok', rows: res.orders });
        setPerimee(false);
        setTenus((prev) => prev.map((v) => ({ ...v, lectures: v.lectures + 1 })).filter((v) => v.lectures <= TENU_LECTURES));
      } else if (res.reason === 'bad_code') {
        setRead({ kind: 'bad_code' });
      } else {
        // FOURNISSEUR-VRAI-1 (AUDIT-B+2 F-19) — the SAME list branch stays,
        // with the same card keys, so a half-typed code or a verdict on a card
        // survives a failed refresh. The wall is for « never read at all ».
        setRead((prev) => (prev.kind === 'ok' ? prev : { kind: 'failed' }));
        setPerimee(true);
      }
      // The photo join never speaks for the list: a products failure leaves
      // the previous map alone (his thumbnails do not blink on one bad read).
      if (prods.ok) {
        setPhotos(new Map(prods.produits.map((p) => [p.productVersionId, p.assetRefs] as const)));
      }
    } finally {
      inFlight.current = false;
    }
  };

  useEffect(() => {
    void load();
    const h = setInterval(() => {
      void load();
    }, REFRESH_EVERY_MS);
    return () => clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accepter = async (orderId: string): Promise<void> => {
    if (service === null || accepting !== null) return;
    setAccepting(orderId);
    setAcceptEchec(null);
    try {
      const res = await service.accept(code, orderId);
      if (res.ok) await load(true);
      else if (res.reason === 'bad_code') setRead({ kind: 'bad_code' });
      else setAcceptEchec(orderId);
    } catch {
      setAcceptEchec(orderId);
    } finally {
      setAccepting(null);
    }
  };

  const choisirPhoto = async (orderId: string): Promise<void> => {
    // FOURNISSEUR-VRAI-1 (AUDIT-B+2 F-21) — a photo this phone cannot open
    // is said on HIS card, never a silent dead tap; bytes the privacy strip
    // cannot prove clean throw, and are refused the same way — nothing
    // uploads. Backing out of the sheet stays silent.
    const refusee = (): void => setPret((prev) => pretPhotoRefusee(prev, orderId, 'fournisseur.pret_photo_illisible') ?? prev);
    let batch: Awaited<ReturnType<typeof pickShots>>;
    try {
      batch = await pickShots(nativeImageSource, 1);
    } catch {
      refusee();
      return;
    }
    const shot = batch.shots[0];
    if (shot === undefined) {
      if (batch.refusal !== null) refusee();
      return;
    }
    const next = pretChoisir(pret, orderId, shot.derivative.uri);
    if (next !== null) setPret(next);
  };

  /** REMBOURSEMENT-2 — « Je ne peux pas fournir »: the refusal rides the
   *  session code like accept; on success the book is re-read at once, so the
   *  card leaves his « à faire » for the archive. A colis already readied
   *  answers `trop_tard` (the coursier's pickup check is the refusal then). */
  const refuser = async (orderId: string): Promise<'fait' | 'trop_tard' | 'echec'> => {
    if (service === null) return 'echec';
    try {
      const res = await service.refuser(code, orderId);
      if (res.ok) {
        await load(true);
        return 'fait';
      }
      if (res.reason === 'bad_code') setRead({ kind: 'bad_code' });
      if (res.reason === 'already_ready') {
        setRefusTropTard((prev) => new Set(prev).add(orderId));
        await load(true);
        return 'trop_tard';
      }
      return 'echec';
    } catch {
      return 'echec';
    }
  };

  /** RETOUR-VIVANT-1 — the return check rides the session code exactly as the
   *  ramassage check does; a dead code escalates the whole screen to the door.
   *  NO re-read on « confirmé », deliberately (the ramassage law): the verdict
   *  must stay under his eyes — the coursier still has to validate on his
   *  phone before the colis changes hands — and the row moves to the archive
   *  on his next refresh, when the book is re-asked. */
  const verifierRetour = async (orderId: string, dit: string, cle: string, nom: string): Promise<'confirme' | 'non_confirme' | 'echec'> => {
    if (service === null) return 'echec';
    try {
      const res = await service.verifierRetour(code, orderId, dit);
      if (res.ok && res.verdict === 'confirme') tenir(cle, nom, 'retour.confirme');
      if (res.ok) return res.verdict;
      if (res.reason === 'bad_code') setRead({ kind: 'bad_code' });
      return 'echec';
    } catch {
      return 'echec';
    }
  };

  /** RAMASSAGE — the act rides the session code like every other; a dead code
   *  escalates the whole screen to the door, exactly as accept does. */
  const verifierRamassage = async (orderId: string, dit: string, cle: string, nom: string): Promise<'confirme' | 'non_confirme' | 'echec'> => {
    if (service === null) return 'echec';
    try {
      const res = await service.verifierRamassage(code, orderId, dit);
      if (res.ok && res.verdict === 'confirme') tenir(cle, nom, 'ramassage.confirme');
      if (res.ok) return res.verdict;
      if (res.reason === 'bad_code') setRead({ kind: 'bad_code' });
      return 'echec';
    } catch {
      return 'echec';
    }
  };

  const envoyer = async (commande: CommandeVue): Promise<void> => {
    if (service === null) return;
    const started = pretEnvoyer(pret);
    if (started === null) return;
    // F-22 — the photo in his hand: chosen, or kept through a refusal a retry cures.
    const previewUri = pretPhotoEnMain(pret);
    if (previewUri === null || started.etat !== 'envoi' || started.orderId !== commande.orderId) return;
    setPret(started);
    let issue;
    try {
      // 1. the fresh short-TTL challenge — fetched at SEND, not at choice,
      //    so the whole act sits inside one 10-minute window.
      const ch = await service.challenge(code, commande.orderId);
      if (!ch.ok) {
        issue = pretIssue(commande.orderId, { ok: false, reason: ch.reason === 'unreachable' ? 'unreachable' : ch.reason }, previewUri);
      } else {
        // 2. the stripped bytes, through the UPLOAD-ONLY seam (verifier M1:
        //    resolveMediaService carried revokeImage + /media/revoke into the
        //    artifact — a destructive capability the ruling never granted).
        const upload = resolveReadinessUpload();
        if (upload === null) {
          issue = pretIssue(commande.orderId, { ok: false, reason: 'photo_echec' }, previewUri);
        } else {
          const bytes = await bytesFromUri(previewUri);
          const up = await upload(bytes);
          if (!up.ok) {
            issue = pretIssue(commande.orderId, { ok: false, reason: 'photo_echec' }, previewUri);
          } else {
            // 3. the strict canon confirmation — repeating the LOCKED terms.
            //    Sending IS the availability attestation; the sentence above
            //    the button says so in plain words before the tap.
            issue = pretIssue(
              commande.orderId,
              await service.ready(code, {
                orderId: commande.orderId,
                photoRef: up.value,
                readinessChallenge: ch.challenge,
                qty: 1,
                variant: commande.productVersionId,
                availableConfirmed: true,
                at: new Date().toISOString(),
              }),
              previewUri,
            );
          }
        }
      }
    } catch {
      issue = pretIssue(commande.orderId, { ok: false, reason: 'unreachable' }, previewUri);
    }
    setPret(issue.ui);
    if (issue.then === 'refresh') await load(true);
    else if (issue.then === 'bad_code') setRead({ kind: 'bad_code' });
  };

  /**
   * COLIS-FOURNISSEUR-1 — « Accepter le colis »: each article still to accept,
   * one after the other, on the SAME session code, each its own acceptance
   * in the book (the terms each one locks are its own). A failure stops the
   * loop and says so on the card; the next tap accepts what is left.
   */
  const accepterColis = async (packageId: string, orderIds: readonly string[]): Promise<void> => {
    if (service === null || accepting !== null) return;
    setAccepting(packageId);
    setAcceptEchec(null);
    try {
      for (const orderId of orderIds) {
        const res = await service.accept(code, orderId);
        if (res.ok) continue;
        if (res.reason === 'bad_code') setRead({ kind: 'bad_code' });
        else setAcceptEchec(packageId);
        return;
      }
      await load(true);
    } catch {
      setAcceptEchec(packageId);
    } finally {
      setAccepting(null);
    }
  };

  /**
   * COLIS-FOURNISSEUR-1 — « Colis prêt » in ONE act (B6.2 as amended: one
   * photo, one confirmation per order under it, each with its own
   * challenge). The photo is uploaded ONCE; then, for every article still to
   * make ready, a fresh short-TTL challenge and the strict canon confirmation
   * repeating THAT article's locked terms, with the same photo as evidence.
   * The first refusal stops the loop with its own sentence; articles already
   * confirmed stay confirmed (the book is first-wins), and the next send
   * readies what is left.
   */
  const envoyerColis = async (carte: Extract<CarteFournisseur, { kind: 'colis' }>): Promise<void> => {
    if (service === null) return;
    const started = pretEnvoyer(pret);
    if (started === null) return;
    const previewUri = pretPhotoEnMain(pret);
    if (previewUri === null || started.etat !== 'envoi' || started.orderId !== carte.packageId) return;
    setPret(started);
    let issue = pretIssue(carte.packageId, { ok: false, reason: 'unreachable' }, previewUri);
    try {
      const upload = resolveReadinessUpload();
      const up = upload === null ? null : await upload(await bytesFromUri(previewUri));
      if (up === null || !up.ok) {
        issue = pretIssue(carte.packageId, { ok: false, reason: 'photo_echec' }, previewUri);
      } else {
        issue = await pretColis(service, code, carte.packageId, carte.articles, up.value, previewUri);
      }
    } catch {
      issue = pretIssue(carte.packageId, { ok: false, reason: 'unreachable' }, previewUri);
    }
    setPret(issue.ui);
    if (issue.then === 'refresh') await load(true);
    else if (issue.then === 'bad_code') setRead({ kind: 'bad_code' });
  };

  const vue = fournisseurVue(read, zone);
  const titreKey =
    zone === 'en_route' ? 'fournisseur.titre_en_route'
    : zone === 'livrees' ? 'fournisseur.titre_livrees'
    : 'fournisseur.titre';
  const compteKey =
    zone === 'en_route' ? 'fournisseur.compte_en_route'
    : zone === 'livrees' ? 'fournisseur.compte_livrees'
    : 'fournisseur.a_faire';

  // F-20 — a held verdict speaks from the top only once its card has left
  // this screen; while the card is here, the card says it itself.
  const surEcran = new Set(vue.kind === 'liste' ? vue.cartes.map((c) => (c.kind === 'colis' ? c.packageId : c.commande.orderId)) : []);
  // …and never over the door's refusal or the failed-read wall: only over a list.
  const verdictsTenus = vue.kind === 'liste' || vue.kind === 'empty' ? tenus.filter((v) => !surEcran.has(v.cle)) : [];

  return (
    <ScrollView contentContainerStyle={SCROLL.tabs} showsVerticalScrollIndicator={false}>
      <PageTitle>{t(titreKey)}</PageTitle>

      {perimee && (vue.kind === 'liste' || vue.kind === 'empty') && (
        <View style={{ marginTop: 14 }}>
          <Banner tone="warn">{t('fournisseur.liste_pas_a_jour')}</Banner>
        </View>
      )}

      {verdictsTenus.map((v) => (
        <View key={`tenu-${v.cle}`} style={{ marginTop: 14 }}>
          <Banner tone="success" check>{`${v.nom} : ${t(v.phrase)}`}</Banner>
        </View>
      ))}

      {vue.kind === 'loading' && (
        <View style={{ marginTop: 14 }}>
          <Text style={role({ f: 'IS', w: 400, s: 13 }, P.sub)}>{t(vue.message)}</Text>
        </View>
      )}

      {(vue.kind === 'not_configured' || vue.kind === 'empty') && (
        <View style={{ marginTop: 14 }}>
          <Banner tone="info">{t(vue.message)}</Banner>
        </View>
      )}

      {vue.kind === 'bad_code' && (
        <View style={{ marginTop: 14 }}>
          <Banner tone="warn">{t(vue.message)}</Banner>
          <View style={{ marginTop: 14 }}>
            <C07BtnPrimary
              label={t('fournisseur.code_ressaisir')}
              icon="retry"
              onPress={() => {
                clearStoredCode();
                onCodeCleared();
              }}
            />
          </View>
        </View>
      )}

      {vue.kind === 'failed' && (
        <View style={{ marginTop: 14 }}>
          <Banner tone="warn">{t(vue.message)}</Banner>
          <View style={{ marginTop: 14 }}>
            <C07BtnPrimary label={t('fournisseur.reessayer')} icon="retry" onPress={() => { void load(); }} />
          </View>
        </View>
      )}

      {vue.kind === 'liste' && (
        <>
          <View style={{ marginTop: 8 }}>
            <Text style={role({ f: 'BG', w: 700, s: 14 }, P.ink)}>
              {/* F-23 — a parcel counts once, on every screen: cards, not articles. */}
              {t(compteKey).replace('{n}', String(zone === 'commandes' ? vue.aFaire : vue.cartes.length))}
            </Text>
          </View>
          {vue.cartes.map((carte) => {
            if (carte.kind === 'colis') {
              // The pickup and return checks name the bag through its first
              // article still in play — Séra resolves the ONE course from any.
              const vivant = carte.articles.find((a) => a.etape !== 'refusee' && a.etape !== 'livree') ?? carte.articles[0]!;
              const noms = carte.articles.map((a) => (a.productName !== '' ? a.productName : a.productVersionId)).join(' · ');
              return (
                <CarteColis
                  key={carte.packageId}
                  carte={carte}
                  pret={pret}
                  accepting={accepting === carte.packageId}
                  acceptEchec={acceptEchec === carte.packageId}
                  photos={photos}
                  mediaBase={mediaBase}
                  onAccepter={() => { void accepterColis(carte.packageId, aAccepterDuColis(carte.articles)); }}
                  onChoisirPhoto={() => { void choisirPhoto(carte.packageId); }}
                  onEnvoyer={() => { void envoyerColis(carte); }}
                  onVerifierRamassage={(dit) => verifierRamassage(vivant.orderId, dit, carte.packageId, noms)}
                  onVerifierRetour={(dit) => verifierRetour(vivant.orderId, dit, carte.packageId, noms)}
                  onRefuser={(orderId) => refuser(orderId)}
                  refusTropTard={refusTropTard}
                />
              );
            }
            const c = carte.commande;
            const nom = c.productName !== '' ? c.productName : c.productVersionId;
            return (
              <CarteCommande
                key={c.orderId}
                commande={c}
                pret={pret}
                accepting={accepting === c.orderId}
                acceptEchec={acceptEchec === c.orderId}
                assetRefs={photos.get(c.productVersionId) ?? []}
                mediaBase={mediaBase}
                onAccepter={() => { void accepter(c.orderId); }}
                onChoisirPhoto={() => { void choisirPhoto(c.orderId); }}
                onEnvoyer={() => { void envoyer(c); }}
                onVerifierRamassage={(dit) => verifierRamassage(c.orderId, dit, c.orderId, nom)}
                onVerifierRetour={(dit) => verifierRetour(c.orderId, dit, c.orderId, nom)}
                onRefuser={() => refuser(c.orderId)}
                refusTropTard={refusTropTard.has(c.orderId)}
              />
            );
          })}
          <View style={{ marginTop: 22 }}>
            {/* A refresh by hand is also « I have seen it »: the held verdicts go. */}
            <BtnSoft label={t('operations.actualiser')} icon="retry" onPress={() => { setTenus([]); void load(); }} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

/**
 * RAMASSAGE — « le coursier est là, il donne son code ». The founder's ruling
 * (2026-08-09) puts this check HERE, on the supplier's own surface, behind
 * his own session code — never the founder's console, whose Séra key no
 * supplier holds. One field, one button, one verdict naming the ACT
 * (remettez / ne remettez pas) — and a network refusal that is its own
 * honest sentence, never dressed as a verdict.
 */
function VerifierRamassage({ onVerifier }: { onVerifier: (dit: string) => Promise<'confirme' | 'non_confirme' | 'echec'> }) {
  const [dit, setDit] = useState('');
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<'confirme' | 'non_confirme' | 'echec' | null>(null);
  const verifier = async (): Promise<void> => {
    if (busy || dit.trim() === '') return;
    setBusy(true);
    setVerdict(null);
    setVerdict(await onVerifier(dit.trim()));
    setBusy(false);
  };
  return (
    <View style={{ marginTop: 10, gap: 8 }}>
      <Overline level="card">{t('ramassage.titre')}</Overline>
      <Text style={role({ f: 'IS', w: 400, s: 12 }, P.sub)}>{t('ramassage.aide')}</Text>
      <Input label={t('ramassage.placeholder')} value={dit} onChangeText={(v) => { setDit(v); setVerdict(null); }} />
      <BtnSoft label={busy ? t('ramassage.encours') : t('ramassage.verifier')} onPress={() => { void verifier(); }} />
      {verdict === 'confirme' ? (
        <Banner tone="success" check>{t('ramassage.confirme')}</Banner>
      ) : verdict === 'non_confirme' ? (
        <Banner tone="warn">{t('ramassage.non_confirme')}</Banner>
      ) : verdict === 'echec' ? (
        <Banner tone="warn">{t('ramassage.echec_reseau')}</Banner>
      ) : null}
    </View>
  );
}

/**
 * RETOUR-VIVANT-1 (Séra SE6.2, the supplier's half) — « le coursier rapporte
 * le colis, il donne son code de retour ». The ramassage check's mirror, on
 * the EN ROUTE card: the buyer refused, the coursier is back at the stall
 * with the sealed colis and says the return code his app shows; the supplier
 * types it; Séra judges it and, on « confirmé », releases the supplier's own
 * acceptance key onto the coursier's phone — the two-key handover then runs
 * on the coursier's act, never here. One field, one button, one verdict
 * naming the act (reprenez / ne reprenez pas); a network refusal is its own
 * honest sentence, never dressed as a verdict.
 */
function VerifierRetour({ onVerifier }: { onVerifier: (dit: string) => Promise<'confirme' | 'non_confirme' | 'echec'> }) {
  const [dit, setDit] = useState('');
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<'confirme' | 'non_confirme' | 'echec' | null>(null);
  const verifier = async (): Promise<void> => {
    if (busy || dit.trim() === '') return;
    setBusy(true);
    setVerdict(null);
    setVerdict(await onVerifier(dit.trim()));
    setBusy(false);
  };
  return (
    <View style={{ marginTop: 10, gap: 8 }}>
      <Overline level="card">{t('retour.titre')}</Overline>
      <Text style={role({ f: 'IS', w: 400, s: 12 }, P.sub)}>{t('retour.aide')}</Text>
      <Input label={t('retour.placeholder')} value={dit} onChangeText={(v) => { setDit(v); setVerdict(null); }} />
      <BtnSoft label={busy ? t('retour.encours') : t('retour.verifier')} onPress={() => { void verifier(); }} />
      {verdict === 'confirme' ? (
        <Banner tone="success" check>{t('retour.confirme')}</Banner>
      ) : verdict === 'non_confirme' ? (
        <Banner tone="warn">{t('retour.non_confirme')}</Banner>
      ) : verdict === 'echec' ? (
        <Banner tone="warn">{t('retour.echec_reseau')}</Banner>
      ) : null}
    </View>
  );
}

/* ────────────────────────────── one commande ─────────────────────────────── */

function CarteCommande({ commande, pret, accepting, acceptEchec, assetRefs, mediaBase, onAccepter, onChoisirPhoto, onEnvoyer, onVerifierRamassage, onVerifierRetour, onRefuser, refusTropTard }: {
  commande: CommandeVue;
  pret: PretUi;
  accepting: boolean;
  acceptEchec: boolean;
  assetRefs: readonly string[];
  mediaBase: string | null;
  onAccepter: () => void;
  onChoisirPhoto: () => void;
  onEnvoyer: () => void;
  onVerifierRamassage: (dit: string) => Promise<'confirme' | 'non_confirme' | 'echec'>;
  onVerifierRetour: (dit: string) => Promise<'confirme' | 'non_confirme' | 'echec'>;
  onRefuser: () => Promise<'fait' | 'trop_tard' | 'echec'>;
  refusTropTard: boolean;
}) {
  const nom = commande.productName !== '' ? commande.productName : commande.productVersionId;
  /** The product's own photographs, through the SAME two helpers « Mes
   *  produits » uses — one photo-opening behaviour in this app, so the two
   *  surfaces cannot drift, and no new French. */
  const slot = photoSlot(assetRefs, mediaBase);
  const galerie = galleryPhotos(assetRefs, mediaBase);
  const [viewing, setViewing] = useState<GalleryPhoto | null>(null);
  const modeLabel = commande.paymentMode === 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR'
    ? t('operations.mode_porte')
    : t('operations.mode_paye');
  const mine = (u: PretUi): u is Exclude<PretUi, { etat: 'repos' }> =>
    u.etat !== 'repos' && u.orderId === commande.orderId;
  const enEnvoi = pret.etat === 'envoi' && pret.orderId === commande.orderId;
  const enMain = mine(pret) ? pretPhotoEnMain(pret) : null;

  return (
    <Card variant="Llist" style={{ marginTop: 10 }}>
      {/* PHOTOS SUR LES COMMANDES — the product he is being asked about, shown
          beside its name. The thumbnail opens the first photograph; the strip
          below carries the rest, exactly as his produits card does. */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {slot.kind === 'photo' ? (
          <Pressable onPress={() => setViewing(galerie[0] ?? null)} accessibilityRole="button" disabled={galerie.length === 0}>
            <Image source={{ uri: slot.uri }} style={{ width: 64, height: 64, borderRadius: 10 }} resizeMode="cover" />
          </Pressable>
        ) : (
          <View style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: P.borderCard, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={role({ f: 'IS', w: 400, s: 10 }, P.sub)} numberOfLines={2}>{t(slot.message)}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={role({ f: 'BG', w: 700, s: 15 }, P.ink)} numberOfLines={2}>{nom}</Text>
          {/* FOURNISSEUR-PRIX (founder, 2026-09-02): the buyer's zone is NOT
              his to see — her whereabouts ride to the delivery organiser and
              nowhere else, the same law as her number. What he reads is the
              payment fact and the price HE listed (`sellerBasePrice` is his
              base price on the /mine allowlist, never the buyer's total). */}
          {/* FOURNISSEUR-VRAI-1 (AUDIT-B+2 F-09) — his price on its OWN line,
              named: paired with the payment way it read as the amount the
              buyer owes at the door, which it is not. The payment way stands
              alone, and only while the order is moving. */}
          <Text style={[role({ f: 'IS', w: 700, s: 13 }, P.ink), { marginTop: 2 }]} numberOfLines={2}>
            {t('fournisseur.votre_prix').replace('{prix}', formatF(commande.sellerBasePrice))}
          </Text>
          {modeVisible(commande.etape) && (
            <Text style={[role({ f: 'IS', w: 400, s: 12 }, P.sub), { marginTop: 2 }]} numberOfLines={2}>
              {modeLabel}
            </Text>
          )}
        </View>
      </View>
      {galerie.length > 1 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {galerie.map((ph) => (
            <Pressable key={ph.uri} onPress={() => setViewing(ph)} accessibilityRole="button">
              <Image source={{ uri: ph.uri }} style={{ width: 48, height: 48, borderRadius: 8 }} resizeMode="cover" />
            </Pressable>
          ))}
        </View>
      )}
      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />

      {/* BOUTIK-SUIVI — the two screens after his hands: nothing to do on
          either card, and each says plainly who holds the colis now. */}
      {commande.etape === 'en_route' && (
        <View style={{ marginTop: 10 }}>
          <Banner tone="info">{t('fournisseur.etape_en_route')}</Banner>
          {/* RETOUR-VIVANT-1 — a colis on the road can come BACK refused; the
              return check lives on the card that holds it, behind HIS code. */}
          <VerifierRetour onVerifier={onVerifierRetour} />
        </View>
      )}

      {commande.etape === 'livree' && (
        <View style={{ marginTop: 10 }}>
          <Banner tone="success" check>{t('fournisseur.etape_livree')}</Banner>
        </View>
      )}

      {commande.etape === 'retournee' && (
        <View style={{ marginTop: 10 }}>
          <Banner tone="info">{t('fournisseur.etape_retournee')}</Banner>
        </View>
      )}

      {commande.etape === 'refusee' && (
        <View style={{ marginTop: 10 }}>
          <Banner tone="info">{t('fournisseur.etape_refusee')}</Banner>
        </View>
      )}

      {refusTropTard && (
        <Text style={[role({ f: 'IS', w: 600, s: 12 }, P.warnFg), { marginTop: 10 }]}>{t('fournisseur.refus_trop_tard')}</Text>
      )}

      {commande.etape === 'prete' && (
        <View style={{ marginTop: 10 }}>
          <Banner tone="success" check>{t('fournisseur.etape_prete')}</Banner>
          {/* RAMASSAGE (founder, 2026-08-09) — a ready colis is a colis a
              coursier is coming for; the two-party check lives on HIS card,
              behind HIS code, on HIS console. */}
          <VerifierRamassage onVerifier={onVerifierRamassage} />
        </View>
      )}

      {commande.etape === 'a_accepter' && (
        <View style={{ marginTop: 10 }}>
          {accepting ? (
            <Text style={role({ f: 'IS', w: 600, s: 13 }, P.sub)}>{t('fournisseur.accepter_encours')}</Text>
          ) : (
            <C07BtnPrimary label={t('fournisseur.etape_accepter')} icon="check" onPress={onAccepter} />
          )}
          {acceptEchec && (
            <View style={{ marginTop: 6 }}>
              <Text style={role({ f: 'IS', w: 600, s: 12 }, P.warnFg)}>{t('fournisseur.accepter_echec')}</Text>
            </View>
          )}
          {!accepting && <RefuserCommande onRefuser={onRefuser} />}
        </View>
      )}

      {commande.etape === 'a_preparer' && (
        <View style={{ marginTop: 10 }}>
          {enEnvoi ? (
            <Text style={role({ f: 'IS', w: 600, s: 13 }, P.sub)}>{t('fournisseur.pret_envoi')}</Text>
          ) : enMain !== null ? (
            <>
              <Image
                source={{ uri: enMain }}
                // FOUNDER REPORT (2026-08-08): « the proof photos are too big in
                // the screen » — on the webapp '100%' is the whole browser width.
                // Same cap as the Terminées photo (commandes/screen.tsx).
                style={{ width: '100%', maxWidth: 340, height: 180, borderRadius: 12, backgroundColor: P.bg }}
                resizeMode="cover"
              />
              <View style={{ marginTop: 8 }}>
                <Text style={role({ f: 'IS', w: 400, s: 12 }, P.sub)}>{t('fournisseur.pret_attestation')}</Text>
              </View>
              <View style={{ marginTop: 8 }}>
                <C07BtnPrimary label={t('fournisseur.pret_envoyer')} icon="check" onPress={onEnvoyer} />
              </View>
              {/* Verifier MAJOR 2 — a photo the service refuses for good must
                  never trap him in « Réessayez »: another photo is always one tap. */}
              <BtnGhost label={t('fournisseur.pret_autre_photo')} onPress={onChoisirPhoto} />
            </>
          ) : (
            <BtnSoft label={t('fournisseur.pret_photo')} icon="camera" onPress={onChoisirPhoto} />
          )}
          {mine(pret) && pret.etat === 'refus' && (
            <View style={{ marginTop: 6 }}>
              <Text style={role({ f: 'IS', w: 600, s: 12 }, P.warnFg)}>{t(pret.messageKey)}</Text>
            </View>
          )}
          {!enEnvoi && <RefuserCommande onRefuser={onRefuser} />}
        </View>
      )}
    </Card>
  );
}

/* ────────────────────────────── one colis ─────────────────────────────── */

/**
 * COLIS-FOURNISSEUR-1 — ONE card for the articles one buyer bought from him
 * together (founder ruling 2026-09-23): they leave in ONE colis, with ONE
 * coursier. The card lists each article (its photo, its name, HIS price —
 * never the buyer's whereabouts), and asks for the ONE act the bag still
 * needs: accept it, make it ready with one photo, check the coursier's code,
 * or take back what the buyer refused. An article he cannot supply is
 * refused on its own line — the rest of the colis still leaves.
 */
function CarteColis({ carte, pret, accepting, acceptEchec, photos, mediaBase, onAccepter, onChoisirPhoto, onEnvoyer, onVerifierRamassage, onVerifierRetour, onRefuser, refusTropTard }: {
  carte: Extract<CarteFournisseur, { kind: 'colis' }>;
  pret: PretUi;
  accepting: boolean;
  acceptEchec: boolean;
  photos: ReadonlyMap<string, readonly string[]>;
  mediaBase: string | null;
  onAccepter: () => void;
  onChoisirPhoto: () => void;
  onEnvoyer: () => void;
  onVerifierRamassage: (dit: string) => Promise<'confirme' | 'non_confirme' | 'echec'>;
  onVerifierRetour: (dit: string) => Promise<'confirme' | 'non_confirme' | 'echec'>;
  onRefuser: (orderId: string) => Promise<'fait' | 'trop_tard' | 'echec'>;
  refusTropTard: ReadonlySet<string>;
}) {
  const premier = carte.articles[0]!;
  const modeLabel = premier.paymentMode === 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR'
    ? t('operations.mode_porte')
    : t('operations.mode_paye');
  const mine = pret.etat !== 'repos' && pret.orderId === carte.packageId;
  const enEnvoi = pret.etat === 'envoi' && pret.orderId === carte.packageId;
  const enMain = mine ? pretPhotoEnMain(pret) : null;
  const aFaire = carte.etape === 'a_accepter' || carte.etape === 'a_preparer';
  return (
    <Card variant="Llist" style={{ marginTop: 10 }}>
      <Overline level="card">{`${t('fournisseur.colis_titre')} · ${carte.articles.length} ${t('fournisseur.colis_articles')}`}</Overline>
      {modeVisible(carte.etape) && (
        <Text style={[role({ f: 'IS', w: 400, s: 12 }, P.sub), { marginTop: 2 }]}>{modeLabel}</Text>
      )}
      {carte.articles.map((a) => {
        const slot = photoSlot(photos.get(a.productVersionId) ?? [], mediaBase);
        const nom = a.productName !== '' ? a.productName : a.productVersionId;
        return (
          <View key={a.orderId} style={{ marginTop: 10 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {slot.kind === 'photo' ? (
                <Image source={{ uri: slot.uri }} style={{ width: 48, height: 48, borderRadius: 8 }} resizeMode="cover" />
              ) : (
                <View style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: P.borderCard }} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={role({ f: 'BG', w: 700, s: 14 }, P.ink)} numberOfLines={2}>{nom}</Text>
                <Text style={[role({ f: 'IS', w: 700, s: 12 }, P.ink), { marginTop: 2 }]}>
                  {t('fournisseur.votre_prix').replace('{prix}', formatF(a.sellerBasePrice))}
                </Text>
                {a.etape === 'refusee' ? (
                  <Text style={[role({ f: 'IS', w: 600, s: 12 }, P.sub), { marginTop: 2 }]}>{t('fournisseur.colis_article_refuse')}</Text>
                ) : a.etape === 'livree' && carte.etape !== 'livree' ? (
                  <Text style={[role({ f: 'IS', w: 600, s: 12 }, P.sub), { marginTop: 2 }]}>{t('fournisseur.colis_article_livre')}</Text>
                ) : a.etape === 'retournee' ? (
                  <Text style={[role({ f: 'IS', w: 600, s: 12 }, P.sub), { marginTop: 2 }]}>{t('fournisseur.colis_article_revenu')}</Text>
                ) : null}
              </View>
            </View>
            {refusTropTard.has(a.orderId) && (
              <Text style={[role({ f: 'IS', w: 600, s: 12 }, P.warnFg), { marginTop: 6 }]}>{t('fournisseur.refus_trop_tard')}</Text>
            )}
            {aFaire && (a.etape === 'a_accepter' || a.etape === 'a_preparer') && !enEnvoi && !accepting && (
              <RefuserCommande onRefuser={() => onRefuser(a.orderId)} />
            )}
          </View>
        );
      })}

      {carte.etape === 'a_accepter' && (
        <View style={{ marginTop: 12 }}>
          <Text style={role({ f: 'IS', w: 400, s: 12 }, P.sub)}>{t('fournisseur.colis_aide')}</Text>
          <View style={{ marginTop: 8 }}>
            {accepting ? (
              <Text style={role({ f: 'IS', w: 600, s: 13 }, P.sub)}>{t('fournisseur.accepter_encours')}</Text>
            ) : (
              <C07BtnPrimary label={t('fournisseur.colis_accepter')} icon="check" onPress={onAccepter} />
            )}
          </View>
          {acceptEchec && (
            <View style={{ marginTop: 6 }}>
              <Text style={role({ f: 'IS', w: 600, s: 12 }, P.warnFg)}>{t('fournisseur.accepter_echec')}</Text>
            </View>
          )}
        </View>
      )}

      {carte.etape === 'a_preparer' && (
        <View style={{ marginTop: 12 }}>
          {enEnvoi ? (
            <Text style={role({ f: 'IS', w: 600, s: 13 }, P.sub)}>{t('fournisseur.pret_envoi')}</Text>
          ) : enMain !== null ? (
            <>
              <Image
                source={{ uri: enMain }}
                style={{ width: '100%', maxWidth: 340, height: 180, borderRadius: 12, backgroundColor: P.bg }}
                resizeMode="cover"
              />
              <View style={{ marginTop: 8 }}>
                <Text style={role({ f: 'IS', w: 400, s: 12 }, P.sub)}>{t('fournisseur.colis_attestation')}</Text>
              </View>
              <View style={{ marginTop: 8 }}>
                <C07BtnPrimary label={t('fournisseur.pret_envoyer')} icon="check" onPress={onEnvoyer} />
              </View>
              {/* Verifier MAJOR 2 — a photo the service refuses for good must
                  never trap him in « Réessayez »: another photo is always one tap. */}
              <BtnGhost label={t('fournisseur.pret_autre_photo')} onPress={onChoisirPhoto} />
            </>
          ) : (
            <BtnSoft label={t('fournisseur.colis_photo')} icon="camera" onPress={onChoisirPhoto} />
          )}
          {mine && pret.etat === 'refus' && (
            <View style={{ marginTop: 6 }}>
              <Text style={role({ f: 'IS', w: 600, s: 12 }, P.warnFg)}>{t(pret.messageKey)}</Text>
            </View>
          )}
        </View>
      )}

      {carte.etape === 'prete' && (
        <View style={{ marginTop: 12 }}>
          <Banner tone="success" check>{t('fournisseur.etape_prete')}</Banner>
          <VerifierRamassage onVerifier={onVerifierRamassage} />
        </View>
      )}

      {carte.etape === 'en_route' && (
        <View style={{ marginTop: 12 }}>
          <Banner tone="info">{t('fournisseur.etape_en_route')}</Banner>
          <VerifierRetour onVerifier={onVerifierRetour} />
        </View>
      )}

      {carte.etape === 'livree' && (
        <View style={{ marginTop: 12 }}>
          <Banner tone="success" check>{t('fournisseur.etape_livree')}</Banner>
        </View>
      )}

      {carte.etape === 'retournee' && (
        <View style={{ marginTop: 12 }}>
          <Banner tone="info">{t('fournisseur.etape_retournee')}</Banner>
        </View>
      )}

      {carte.etape === 'refusee' && (
        <View style={{ marginTop: 12 }}>
          <Banner tone="info">{t('fournisseur.etape_refusee')}</Banner>
        </View>
      )}
    </Card>
  );
}

/**
 * REMBOURSEMENT-2 — « Je ne peux pas fournir » (B6.1 « Accept/reject »). A
 * secondary act that whispers under the card's one primary action, and asks
 * once before it acts: the buyer is refunded and the order cannot come back.
 * A refusal the network lost says so, never dressed as done.
 */
function RefuserCommande({ onRefuser }: { onRefuser: () => Promise<'fait' | 'trop_tard' | 'echec'> }) {
  const [confirmer, setConfirmer] = useState(false);
  const [busy, setBusy] = useState(false);
  // « Trop tard » is said by the card itself (it outlives this control).
  const [issue, setIssue] = useState<'echec' | null>(null);
  const refuser = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setIssue(null);
    const r = await onRefuser();
    setBusy(false);
    setConfirmer(false);
    if (r === 'echec') setIssue('echec');
  };
  return (
    <View style={{ marginTop: 10, gap: 8 }}>
      {busy ? (
        <Text style={role({ f: 'IS', w: 600, s: 13 }, P.sub)}>{t('fournisseur.refus_encours')}</Text>
      ) : confirmer ? (
        <>
          <Banner tone="warn">{t('fournisseur.refus_confirmer')}</Banner>
          <BtnSoft label={t('fournisseur.refus_oui')} onPress={() => { void refuser(); }} />
          <BtnGhost label={t('fournisseur.refus_non')} onPress={() => setConfirmer(false)} />
        </>
      ) : (
        <BtnGhost label={t('fournisseur.refus_action')} onPress={() => { setIssue(null); setConfirmer(true); }} />
      )}
      {issue !== null && (
        <Text style={role({ f: 'IS', w: 600, s: 12 }, P.warnFg)}>{t('fournisseur.refus_echec')}</Text>
      )}
    </View>
  );
}
