import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { SCROLL, role } from '../ui/v2/styles';
import { t } from '../i18n';
import { Banner, BtnSoft, C07BtnPrimary, Card, Input, PageTitle } from '../v2/components';
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
} from './view';
import { photoSlot } from '../supply/produits-view';
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
  const [onglet, setOnglet] = useState<'commandes' | 'produits'>('commandes');
  return (
    <View style={{ flex: 1, backgroundColor: P.bg }}>
      {code === null ? (
        <SPorteCode onCodeSaved={setCode} />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 }}>
            {/* The active tab is STATED, not implied: full-opacity label on
                the live tab, softened on the other — ≥44px targets held by
                BtnSoft's own geometry. */}
            <View style={{ flex: 1, opacity: onglet === 'commandes' ? 1 : 0.55 }}>
              <BtnSoft label={t('fournisseur.onglet_commandes')} onPress={() => setOnglet('commandes')} />
            </View>
            <View style={{ flex: 1, opacity: onglet === 'produits' ? 1 : 0.55 }}>
              <BtnSoft label={t('fournisseur.onglet_produits')} onPress={() => setOnglet('produits')} />
            </View>
          </View>
          {onglet === 'commandes' ? (
            <SMesCommandes code={code} onCodeCleared={() => setCode(null)} />
          ) : (
            <SMesProduits code={code} onCodeCleared={() => setCode(null)} />
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
  return (
    <Card style={{ marginTop: 12, padding: 14 }}>
      {/* VIDEO-PARTOUT — his own clip, on his own surface. Under the row so the
          photo/name/price line he already reads keeps its shape; the poster is
          the same photograph the thumbnail shows, so nothing flashes. */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {slot.kind === 'photo' ? (
          <Image source={{ uri: slot.uri }} style={{ width: 74, height: 74, borderRadius: 10 }} resizeMode="cover" />
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
      <FicheVideo
        src={produit.videoRef === undefined || produit.videoRef === '' || mediaBase === null ? undefined : `${mediaBase}/${produit.videoRef}`}
        poster={slot.kind === 'photo' ? slot.uri : undefined}
      />
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

function SMesCommandes({ code, onCodeCleared }: { code: string; onCodeCleared: () => void }) {
  const service = useMemo<FournisseurServicePort | null>(() => resolveFournisseurService(), []);
  const [read, setRead] = useState<FournisseurRead>(() =>
    service === null ? { kind: 'not_configured' } : { kind: 'loading' },
  );
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
      const res = await service.listMine(code);
      if (seq !== readSeq.current) return; // a newer read owns the screen
      if (res.ok) setRead({ kind: 'ok', rows: res.orders });
      else setRead({ kind: res.reason === 'bad_code' ? 'bad_code' : 'failed' });
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

  const vue = fournisseurVue(read);

  return (
    <ScrollView contentContainerStyle={SCROLL.tabs} showsVerticalScrollIndicator={false}>
      <PageTitle>{t('fournisseur.titre')}</PageTitle>

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
              {t('fournisseur.a_faire').replace('{n}', String(vue.aFaire))}
            </Text>
          </View>
          {vue.commandes.map((c) => (
            <CarteCommande
              key={c.orderId}
              commande={c}
              pret={pret}
              accepting={accepting === c.orderId}
              acceptEchec={acceptEchec === c.orderId}
              onAccepter={() => { void accepter(c.orderId); }}
              onChoisirPhoto={() => { void choisirPhoto(c.orderId); }}
              onEnvoyer={() => { void envoyer(c); }}
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

/* ────────────────────────────── one commande ─────────────────────────────── */

function CarteCommande({ commande, pret, accepting, acceptEchec, onAccepter, onChoisirPhoto, onEnvoyer }: {
  commande: CommandeVue;
  pret: PretUi;
  accepting: boolean;
  acceptEchec: boolean;
  onAccepter: () => void;
  onChoisirPhoto: () => void;
  onEnvoyer: () => void;
}) {
  const nom = commande.productName !== '' ? commande.productName : commande.productVersionId;
  const modeLabel = commande.paymentMode === 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR'
    ? t('operations.mode_porte')
    : t('operations.mode_paye');
  const mine = (u: PretUi): u is Exclude<PretUi, { etat: 'repos' }> =>
    u.etat !== 'repos' && u.orderId === commande.orderId;
  const enEnvoi = pret.etat === 'envoi' && pret.orderId === commande.orderId;

  return (
    <Card variant="Llist" style={{ marginTop: 10 }}>
      <Text style={role({ f: 'BG', w: 700, s: 15 }, P.ink)} numberOfLines={1}>{nom}</Text>
      <Text style={[role({ f: 'IS', w: 400, s: 12 }, P.sub), { marginTop: 2 }]} numberOfLines={1}>
        {commande.zoneTo} · {modeLabel} · {formatF(commande.sellerBasePrice)}
      </Text>

      {commande.etape === 'prete' && (
        <View style={{ marginTop: 10 }}>
          <Banner tone="success" check>{t('fournisseur.etape_prete')}</Banner>
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
                style={{ width: '100%', height: 180, borderRadius: 12, backgroundColor: P.bg }}
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
