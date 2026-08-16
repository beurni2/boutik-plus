import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { SCROLL, role } from '../ui/v2/styles';
import { t } from '../i18n';
import { Banner, BtnSoft, C07BtnPrimary, Card, ChipCategory, Input, Overline, PageTitle, PhotoViewer } from '../v2/components';
import { formatF } from '../v2/money';
import { pickShots } from '../studio/pick';
import { nativeImageSource } from '../studio/pick-native';
import { bytesFromUri } from '../supply/uri-bytes';
import { resolveReadinessUpload } from './media-upload';
import {
  clearStoredCode,
  readStoredCode,
  resolveFournisseurService,
  storeCode,
  type FournisseurServicePort,
} from './service';
import {
  PRET_REPOS,
  fournisseurVue,
  pretChoisir,
  pretEnvoyer,
  pretIssue,
  produitsVue,
  type CommandeVue,
  type FournisseurRead,
  type PretUi,
  type ProduitsRead,
  type ZoneCommandes,
} from './view';
import { galleryPhotos, photoSlot, type GalleryPhoto } from '../supply/produits-view';
import { FicheVideo } from '../v2/fiche-video';
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

export function FournisseurApp() {
  const [code, setCode] = useState<string | null>(() => readStoredCode());
  // LISTER-POUR-1c — two views, ONE door: Commandes (his hands) and Mes
  // produits (his eyes). Both read through the same stored code; clearing it
  // from either returns to the door for both.
  /**
   * BOUTIK-SUIVI (founder, 2026-08-09) — the road, as three screens: what
   * needs his hands, what a coursier is carrying, what is finished. « Mes
   * produits » is his eyes-only shelf. One door, four views.
   *
   * ⚠ THE ROW'S ORDER IS THE FOUNDER'S, and it is not the same thing as the
   * landing tab (2026-08-15: « make the tabs order be (Mes produits,
   * Commandes, En route and Livré) »). « Mes produits » leads the row — it is
   * what his shop IS, before what it owes — while the console still OPENS on
   * « Commandes », because that is the tab with work waiting in it. Both are
   * walked in `test/rendu-onglets.test.tsx` — which MOUNTS this console, the
   * first test in this app to do so — separately, so a future reorder cannot
   * drag his landing screen along behind it.
   */
  const [onglet, setOnglet] = useState<'commandes' | 'en_route' | 'livrees' | 'produits'>('commandes');
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

  const charger = async (force = false): Promise<void> => {
    if (service === null || (inFlight.current && !force)) return;
    inFlight.current = true;
    readSeq.current += 1;
    const seq = readSeq.current;
    try {
      const res = await service.listProduits(code);
      if (seq !== readSeq.current) return; // a newer read owns the screen
      if (res.ok) setRead({ kind: 'ok', rows: res.produits });
      else setRead({ kind: res.reason === 'bad_code' ? 'bad_code' : 'failed' });
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
      <PageTitle>{t('fournisseur.titre')}</PageTitle>
      <View style={{ marginTop: 14 }}>
        <Banner tone="info">{t('fournisseur.code_explication')}</Banner>
      </View>
      <View style={{ marginTop: 16 }}>
        <Input label={t('fournisseur.code_libelle')} value={draft} onChangeText={setDraft} />
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

  const load = async (force = false): Promise<void> => {
    if (service === null || (inFlight.current && !force)) return;
    inFlight.current = true;
    readSeq.current += 1;
    const seq = readSeq.current;
    try {
      const [res, prods] = await Promise.all([service.listMine(code), service.listProduits(code)]);
      if (seq !== readSeq.current) return; // a newer read owns the screen
      if (res.ok) setRead({ kind: 'ok', rows: res.orders });
      else setRead({ kind: res.reason === 'bad_code' ? 'bad_code' : 'failed' });
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
    const batch = await pickShots(nativeImageSource, 1);
    const shot = batch.shots[0];
    if (shot === undefined) return; // cancelled or refused — the picker said its own sentence
    const next = pretChoisir(pret, orderId, shot.derivative.uri);
    if (next !== null) setPret(next);
  };

  /** RAMASSAGE — the act rides the session code like every other; a dead code
   *  escalates the whole screen to the door, exactly as accept does. */
  const verifierRamassage = async (orderId: string, dit: string): Promise<'confirme' | 'non_confirme' | 'echec'> => {
    if (service === null) return 'echec';
    try {
      const res = await service.verifierRamassage(code, orderId, dit);
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
    if (pret.etat !== 'photo_choisie' || pret.orderId !== commande.orderId) return;
    const previewUri = pret.previewUri;
    setPret(started);
    let issue;
    try {
      // 1. the fresh short-TTL challenge — fetched at SEND, not at choice,
      //    so the whole act sits inside one 10-minute window.
      const ch = await service.challenge(code, commande.orderId);
      if (!ch.ok) {
        issue = pretIssue(commande.orderId, { ok: false, reason: ch.reason === 'unreachable' ? 'unreachable' : ch.reason });
      } else {
        // 2. the stripped bytes, through the UPLOAD-ONLY seam (verifier M1:
        //    resolveMediaService carried revokeImage + /media/revoke into the
        //    artifact — a destructive capability the ruling never granted).
        const upload = resolveReadinessUpload();
        if (upload === null) {
          issue = pretIssue(commande.orderId, { ok: false, reason: 'photo_echec' });
        } else {
          const bytes = await bytesFromUri(previewUri);
          const up = await upload(bytes);
          if (!up.ok) {
            issue = pretIssue(commande.orderId, { ok: false, reason: 'photo_echec' });
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
            );
          }
        }
      }
    } catch {
      issue = pretIssue(commande.orderId, { ok: false, reason: 'unreachable' });
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

  return (
    <ScrollView contentContainerStyle={SCROLL.tabs} showsVerticalScrollIndicator={false}>
      <PageTitle>{t(titreKey)}</PageTitle>

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
              {t(compteKey).replace('{n}', String(zone === 'commandes' ? vue.aFaire : vue.commandes.length))}
            </Text>
          </View>
          {vue.commandes.map((c) => (
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
              onVerifierRamassage={(dit) => verifierRamassage(c.orderId, dit)}
            />
          ))}
          <View style={{ marginTop: 22 }}>
            <BtnSoft label={t('operations.actualiser')} icon="retry" onPress={() => { void load(); }} />
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

/* ────────────────────────────── one commande ─────────────────────────────── */

function CarteCommande({ commande, pret, accepting, acceptEchec, assetRefs, mediaBase, onAccepter, onChoisirPhoto, onEnvoyer, onVerifierRamassage }: {
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
          <Text style={[role({ f: 'IS', w: 400, s: 12 }, P.sub), { marginTop: 2 }]} numberOfLines={2}>
            {commande.zoneTo} · {modeLabel} · {formatF(commande.sellerBasePrice)}
          </Text>
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
        </View>
      )}

      {commande.etape === 'livree' && (
        <View style={{ marginTop: 10 }}>
          <Banner tone="success" check>{t('fournisseur.etape_livree')}</Banner>
        </View>
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
        </View>
      )}

      {commande.etape === 'a_preparer' && (
        <View style={{ marginTop: 10 }}>
          {enEnvoi ? (
            <Text style={role({ f: 'IS', w: 600, s: 13 }, P.sub)}>{t('fournisseur.pret_envoi')}</Text>
          ) : mine(pret) && pret.etat === 'photo_choisie' ? (
            <>
              <Image
                source={{ uri: pret.previewUri }}
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
            </>
          ) : (
            <BtnSoft label={t('fournisseur.pret_photo')} icon="camera" onPress={onChoisirPhoto} />
          )}
          {mine(pret) && pret.etat === 'refus' && (
            <View style={{ marginTop: 6 }}>
              <Text style={role({ f: 'IS', w: 600, s: 12 }, P.warnFg)}>{t(pret.messageKey)}</Text>
            </View>
          )}
        </View>
      )}
    </Card>
  );
}
