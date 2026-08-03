/**
 * COMBINED SLICE — « Lister un produit », REAL, through HIS flow (founder
 * ruling: "the five-step wizard is his designed flow … the real writes run
 * THROUGH IT rather than through a new screen").
 *
 * WHAT THIS IS: a WRAPPER, not a screen. `S20Wizard` renders untouched; this
 * component owns the impure substance around it — the resolved services, the
 * captures the Studio handed up, the publish orchestration, and the outcome
 * pane — and hands the wizard an INTERCEPTED dispatcher:
 *
 *   · `WIZ_SET {name}` while the code is untouched → augmented with the derived
 *     product code, so the field fills visibly as he types (founder option (a))
 *     and stops the moment he edits it.
 *   · `WIZ_NEXT` at step 4 → THE REAL PUBLISH, and the action never reaches the
 *     machine — which is what keeps the §9.5 frozen fallback and the demo
 *     board-write unreachable on the real path without editing either
 *     (the founder's technique: make the path not reach it).
 *   · everything else passes through verbatim; §4 is untouched.
 *
 * UPLOADS AT PUBLISH, four derivatives, all bounded (≤1280px, ~0.8 JPEG):
 * heroSquare · heroVertical (the two crops) · proof · detail. THE MASTER IS
 * DELIBERATELY NOT UPLOADED: the media read route is OPEN (anyone holding a key
 * reads the object), so uploading the private original would contradict
 * B+I-08's « master private » — instead it is HASHED on-device and recorded as
 * `private/device/{sha256}` (the fixtures' own private namespace), a true
 * statement about where the original actually is.
 *
 * PARTIAL UPLOADS (founder ruling: "the product saves with what got through"):
 * assembly follows the longest-complete-prefix rule; a missing required role
 * means the offer publishes with NO assets, and the outcome pane carries
 * « Ajouter les photos » — re-uploading only what failed, then attaching via
 * the completion path (`attachAssets`), no republish, same offer.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { bytesFromUri } from '../supply/uri-bytes';
import { ScrollView, Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { GEO } from '../ui/v2/tokens';
import { SCROLL, role } from '../ui/v2/styles';
import { t } from '../i18n';
import { formatF } from './money';
import { Banner, BtnGhost, C07BtnPrimary, HeaderStacked, Overline } from './components';
import { S20Wizard } from './screens2';
import { mintCommandId } from '../offline/commandId';
import { resolveSupplyService, SUPPLIER_ID, SUPPLIER_ZONE, type AttachAssetsOutcome, type ServiceResult, type SupplyServicePort } from '../supply/service';
import { resolveMediaService, sha256Hex, type MediaServicePort } from '../supply/media';
import { assembleAssets, type AssemblyInput, type ProductAssetsInput, type RoleUpload } from '../supply/assets';
import {
  netLineRefusal,
  offerWindow,
  publish,
  retainIdentity,
  type AuthoringContext,
  type AuthoringForm,
  type FieldError,
  type OfferIdentity,
  type PublishState,
} from '../supply/authoring';
import { randomSuffixBytes, suggestProductCode } from '../supply/product-code';
import { previewSellerNet, type SellerNetLine } from '../supply/preview';
import { derivativeBytesFromUri, renderCropDerivative } from '../studio/capture';
import { heroSquareCrop, heroVerticalCrop } from '../studio/crops';
import { defaultRoles, publishOrder, roleChipKey, swapToNext, type PhotoRole } from '../studio/roles';
import type { CaptureSet } from './studio-real';
import type { A, S } from './machine';
import { cleEchecHttp, supplierPourPublication } from './lister-pour';
import { chipsFournisseurs, lireFournisseurs, type FournisseursRead } from './lister-pour-choix';
import { avecVideo, decideVideoChoisie, videoEchecKey, videoRefusKey } from '../supply/video';
import { pickVideo } from '../studio/pick-video';
import type { VideoEtat } from './screens2';
import { readStoredOpsKey, resolveOperationsService } from '../operations/service';


/** Set at authoring — the founder is the only supplier. HARD GATE in authoring.ts. */
const MODERATION_STATE = 'approved';
/** The derivative pipeline version stamped into canon `processingVersion`. */
const PROCESSING_VERSION = 'premium-frame.v1';

/** Typed refusal → catalog string — exhaustive over FieldError. */
const ERROR_KEY: Record<FieldError, string> = {
  name_required: 'publier.err_nom',
  product_code_required: 'publier.err_code',
  category_required: 'publier.err_categorie',
  zone_required: 'publier.err_zone',
  base_price_invalid: 'publier.err_prix',
  base_price_below_floor: 'publier.err_prix_plancher',
  commission_invalid: 'publier.err_commission',
  commission_leaves_no_net: 'publier.err_commission_net',
  available_invalid: 'publier.err_stock',
};

const bodySub = role({ f: 'IS', w: 400, s: 12.5, lh: 1.55 }, P.sub);
const reference = role({ f: 'IS', w: 600, s: 15 }, P.ink);
const netAmount = role({ f: 'BG', w: 700, s: 26 }, P.ink);

/** What remains after a publish whose uploads did not all get through. */
interface PendingPhotos {
  readonly uploads: AssemblyInput;
  readonly bytes: UploadBytes;
}

/** The raw bytes per role — kept so a retry re-uploads ONLY what failed.
 * `detail` is 1..2 entries since STUDIO-BATCH-1 (the founder's 4th photo). */
interface UploadBytes {
  readonly heroSquare: Uint8Array;
  readonly heroVertical: Uint8Array;
  readonly proof: Uint8Array;
  readonly detail: readonly Uint8Array[];
  readonly masterSha256: string;
}

/** The wizard's field values mapped onto the authoring form — one source, no drift. */
function formFromWiz(wiz: S['wiz']): AuthoringForm {
  return {
    name: wiz.name,
    productCode: wiz.code,
    category: wiz.cat,
    zone: SUPPLIER_ZONE, // his BOUTIQUE's zone — no longer asked per listing
    basePrice: String(wiz.B),
    resellerCommission: String(wiz.C),
    available: String(wiz.stock),
    variantsNote: wiz.sizes,
  };
}

/**
 * The shell-held listing session — code-suggestion state that must SURVIVE the
 * studio round-trip (SListerReal unmounts when the studio view opens; refs held
 * here would reset, and the suggestion would silently overwrite a code he had
 * edited — the exact founder-ruling violation the verifier caught). Reset by
 * the shell on OPEN_WIZ.
 */
export interface ListingSession {
  codeTouched: boolean;
  suffixBytes: Uint8Array | null;
  /** LISTER-POUR-1b — whom this publication is FOR. Shell-owned like the two
   *  above (SListerReal unmounts on the studio round-trip); '' means himself. */
  pourFournisseur: string;
  /** VIDEO-PRODUIT-1c — the picked ≤ 6 s clip, ALREADY judged by
   *  `decideVideoChoisie` (only an accepted clip is ever stored here).
   *  Shell-owned for the same reason as the rest: it must survive the studio
   *  round-trip. `durationSec` is the device's ceiling — the service re-measures
   *  at upload and canon re-refuses at parse. */
  video: { bytes: Uint8Array; durationSec: number } | null;
}

export function SListerReal({ st, d, captures, session }: {
  st: S;
  d: (a: A) => void;
  /** Owned by the SHELL: studio and wizard are sibling views, so the approved
   * set must survive the view switch. Written by S26StudioReal's onApproved. */
  captures: { current: CaptureSet | null };
  /** Owned by the SHELL for the same reason — see ListingSession. */
  session: { current: ListingSession };
}) {
  const offerService = useMemo(() => resolveSupplyService(), []);
  const mediaService = useMemo(() => resolveMediaService(), []);
  const [pub, setPub] = useState<PublishState | null>(null);
  const [pending, setPending] = useState<PendingPhotos | null>(null);
  /** LISTER-POUR-2 — the ACTIVE-supplier roster for the picker. CONSOLE-3's
   * code inventory read with the founder's ops key from HIS browser
   * (`boutik.operateur.cle`) — an active code is what makes a supplier active,
   * so the inventory IS the list he asked for. No key stored here (any other
   * device) ⇒ `sans_cle`, and the recap keeps the 1b typed field instead.
   * Refetched per mount; the studio round-trip remounts this wrapper, which is
   * one extra GET and an always-fresh list. */
  const [fournisseurs, setFournisseurs] = useState<FournisseursRead>({ kind: 'chargement' });
  /** Bumped by « Réessayer » — a named failure he can ACT on (verifier: the
   *  echec state used to be terminal for the whole mount). */
  const [relire, setRelire] = useState(0);
  /**
   * WHOM THIS PUBLICATION IS FOR — ONE COPY, held here and mirrored into the
   * shell session so it survives the studio round-trip (SListerReal unmounts).
   *
   * IT IS STATE, NOT A BARE REF (verifier BLOCKER 2026-08-02): the marking used
   * to be a `useState` seeded once inside the wizard while the publish read the
   * session ref, so an id typed while the roster was still loading published to
   * that supplier under a « Vous » chip. State here re-renders the wizard on
   * every write — typed OR tapped — so the chip he sees marked is computed from
   * the very value that publishes.
   */
  const [pour, setPour] = useState(session.current.pourFournisseur);
  const choisirPour = (v: string): void => {
    session.current.pourFournisseur = v; // the shell's copy — survives the studio
    setPour(v);
  };
  /** VIDEO-PRODUIT-1c — the screen state DERIVES from the shell session at
   *  mount (a clip picked before the studio round-trip is still « choisie »);
   *  a refusal is transient screen state, never stored. */
  const [videoEtat, setVideoEtat] = useState<VideoEtat>(
    session.current.video !== null ? { kind: 'choisie', durationSec: session.current.video.durationSec } : { kind: 'aucune' },
  );
  /** The honest sentence when the product published but the clip did not ride. */
  const [videoNote, setVideoNote] = useState<string | null>(null);
  const onPickVideo = async (): Promise<void> => {
    const out = await pickVideo();
    if (!out.ok) {
      // A dismissed sheet changes nothing; a platform without the picker says
      // so; an oversized file is refused by its SIZE, before a byte buffers.
      if (out.reason === 'indisponible') setVideoEtat({ kind: 'refusee', key: 'publier.video_indisponible' });
      if (out.reason === 'trop_lourde') setVideoEtat({ kind: 'refusee', key: videoRefusKey('trop_lourde') });
      return;
    }
    const choix = decideVideoChoisie(out.video.durationSeconds, out.video.bytes.length);
    if (!choix.ok) {
      session.current.video = null;
      setVideoEtat({ kind: 'refusee', key: videoRefusKey(choix.reason) });
      return;
    }
    session.current.video = { bytes: out.video.bytes, durationSec: choix.durationSec };
    setVideoEtat({ kind: 'choisie', durationSec: choix.durationSec });
  };
  const onRetirerVideo = (): void => {
    session.current.video = null;
    setVideoEtat({ kind: 'aucune' });
  };
  useEffect(() => {
    let alive = true;
    const opsKey = readStoredOpsKey();
    const ops = resolveOperationsService();
    if (opsKey === null || ops === null) {
      setFournisseurs({ kind: 'sans_cle' });
      return undefined;
    }
    setFournisseurs({ kind: 'chargement' });
    // The bounded read lives in `lister-pour-choix.ts` where it is TESTED —
    // 12 s ceiling, refusals and throws alike landing on the named `echec`
    // (`bad_key` and `unreachable` both: either way the list cannot be shown,
    // and the hint + « Réessayer » say exactly that).
    void lireFournisseurs(ops, opsKey).then((res) => {
      if (alive) setFournisseurs(res);
    });
    return () => {
      alive = false;
    };
  }, [relire]);
  const [attachNote, setAttachNote] = useState<'sending' | 'done' | string | null>(null);
  const inFlight = useRef(false);
  const identity = useRef<OfferIdentity | null>(null);
  /** THE ROLE ASSIGNMENT (STUDIO-BATCH-1) — index-aligned with the capture
   * set's photos, chosen by the chips on the verify step. KEYED TO THE SET
   * ITSELF: a fresh studio round-trip hands up a new object, so a stale
   * assignment can never map onto new photographs — it silently falls back to
   * the default (pick order). */
  const [roleChoice, setRoleChoice] = useState<{ set: CaptureSet; roles: readonly PhotoRole[] } | null>(null);
  const rolesFor = (set: CaptureSet): readonly PhotoRole[] =>
    roleChoice !== null && roleChoice.set === set && roleChoice.roles.length === set.photos.length
      ? roleChoice.roles
      : defaultRoles(set.photos.length);
  const setRoles = (next: readonly PhotoRole[]): void => {
    if (captures.current !== null) setRoleChoice({ set: captures.current, roles: next });
  };
  // The suffix is drawn ONCE PER LISTING (not per mount): held in the shell
  // session so the suggested code for an unchanged name is stable across a
  // studio round-trip. No CSPRNG → stays null → no suggestion, never weak.
  if (session.current.suffixBytes === null && !session.current.codeTouched) {
    try {
      session.current.suffixBytes = randomSuffixBytes();
    } catch {
      /* stays null */
    }
  }

  /**
   * ONE TAP LEAVES THE OUTCOME PANE (verifier finding, HIGH). A raw BACK from
   * here would hit the machine's wizard step-back four times invisibly (view is
   * still 'add', step still 4 — the real publish never advanced the machine)
   * and only the fifth tap would exit: the success screen's single exit would
   * look broken four times, then destroy the pane. TAB produits is the demo
   * flow's own landing spot after publish — one tap, same destination.
   */
  const exitToProduits = (): void => d({ t: 'TAB', tab: 'produits' });

  /** The interceptor — see the module header. Everything else passes through. */
  const dd = (a: A): void => {
    if (a.t === 'WIZ_SET' && 'code' in a.patch) {
      session.current.codeTouched = true;
      d(a);
      return;
    }
    if (a.t === 'WIZ_SET' && typeof a.patch.name === 'string' && !session.current.codeTouched && session.current.suffixBytes !== null) {
      const name = a.patch.name;
      d({ t: 'WIZ_SET', patch: { ...a.patch, code: name.trim().length === 0 ? '' : suggestProductCode(name, session.current.suffixBytes) } });
      return;
    }
    if (a.t === 'WIZ_NEXT' && st.wiz.step === 4) {
      void onPublish(); // the REAL write — the machine's demo publish branch is never reached
      return;
    }
    d(a);
  };

  /** Upload one role's bytes; a failure is an honest {ok:false}, never a throw. */
  const uploadRole = async (media: MediaServicePort, bytes: Uint8Array): Promise<RoleUpload> => {
    const res = await media.uploadImage(bytes);
    return res.ok ? { ok: true, ref: res.value } : { ok: false };
  };

  const onPublish = async (): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPub({ kind: 'sending' });
    setVideoNote(null); // a retry re-earns its own note
    try {
      identity.current = retainIdentity(identity.current, mintCommandId);
      const now = new Date().toISOString();
      const win = offerWindow(now);
      const ctx: AuthoringContext = {
        // LISTER-POUR-1b: his own id unless the recap field names another —
        // and a wrong one refuses server-side (unknown_supplier), never lands.
        supplierId: supplierPourPublication(session.current.pourFournisseur, SUPPLIER_ID),
        ...identity.current,
        now,
        effective: win.effective,
        expiry: win.expiry,
        moderationState: MODERATION_STATE,
      };

      // ── photographs: crop the ASSIGNED hero, hash its master, upload ──────
      // The role assignment comes from the verify step (STUDIO-BATCH-1 —
      // founder 2026-07-27: roles are chosen on 5/5, not by pick order), and
      // the hero's two crops render HERE, once, because only now is the hero
      // finally known. `publishOrder` refusing means a non-permutation
      // assignment — unreachable through the chip UI, refused rather than
      // trusted (a two-hero upload would be the quiet corruption).
      let assets: ProductAssetsInput | undefined;
      let leftover: PendingPhotos | null = null;
      const order = captures.current === null ? null : publishOrder(rolesFor(captures.current));
      if (captures.current !== null && order === null) {
        // Unreachable through the chip UI — and REFUSED LOUDLY if ever reached
        // (verifier finding 2026-07-27: the silent alternative published the
        // product with no photos and no sentence saying why).
        setPub({ kind: 'failed', cause: 'device', reason: 'attribution des rôles invalide' });
        return;
      }
      if (captures.current !== null && mediaService !== null && order !== null) {
        const set = captures.current;
        const hero = set.photos[order.hero]!;
        const heroSquare = await renderCropDerivative(hero.masterUri, heroSquareCrop(hero.master.width, hero.master.height));
        const heroVertical = await renderCropDerivative(hero.masterUri, heroVerticalCrop(hero.master.width, hero.master.height));
        const bytes: UploadBytes = {
          heroSquare: heroSquare.bytes,
          heroVertical: heroVertical.bytes,
          proof: derivativeBytesFromUri(set.photos[order.preuve]!.derivative.uri),
          detail: order.details.map((i) => derivativeBytesFromUri(set.photos[i]!.derivative.uri)),
          // the master never uploads (open read route vs « master private ») —
          // so the record is the REAL hash of the MASTER'S OWN BYTES, read from
          // the retained file. Hashing the derivative here and calling it the
          // master would be a false record — the exact fabrication class this
          // project refuses. If the file cannot be read, the master is honestly
          // missing and the whole set stays absent (prefix rule).
          masterSha256: await sha256Hex(await bytesFromUri(hero.masterUri)),
        };
        const detailUploads: RoleUpload[] = [];
        for (const detailBytes of bytes.detail) detailUploads.push(await uploadRole(mediaService, detailBytes));
        const uploads: AssemblyInput = {
          master: {
            ok: true,
            ref: { ref: `private/device/${bytes.masterSha256}`, sha256: bytes.masterSha256, mimeType: 'image/jpeg' },
          },
          heroSquare: await uploadRole(mediaService, bytes.heroSquare),
          heroVertical: await uploadRole(mediaService, bytes.heroVertical),
          proof: await uploadRole(mediaService, bytes.proof),
          detail: detailUploads,
          processingVersion: PROCESSING_VERSION,
        };
        const assembled = assembleAssets(uploads);
        if (assembled.ok) {
          assets = assembled.assets;
          // VIDEO-PRODUIT-1c — the clip rides ON the assembled photo assets
          // (canon requires the photo roles, so a video cannot exist without
          // them). Upload now, weld on success; a failed upload NEVER blocks
          // the publish — the product goes out and the pane says the video
          // did not ride, in its own sentence.
          if (session.current.video !== null) {
            const up = await mediaService.uploadVideo(session.current.video.bytes);
            if (up.ok) assets = avecVideo(assets, up.value);
            // The service's typed 400 reason surfaces in its OWN sentence —
            // « trop longue » must never read as a network failure.
            else setVideoNote(up.cause === 'http' ? videoEchecKey(up.reason) : 'publier.video_echec_envoi');
          }
        } else {
          leftover = { uploads, bytes }; // publish without photos; complete after
        }
      }
      // A clip with NO photographs has nowhere to live (canon's photo roles
      // are required) — said plainly rather than silently dropped. ONLY when
      // no photos were captured at all: on the leftover branch the completion
      // path carries the clip with the retried photos, so this sentence there
      // would be a false alarm (verifier finding 2026-08-03).
      if (captures.current === null && session.current.video !== null) {
        setVideoNote('publier.video_sans_photos');
      }

      const outcome = await publish(offerService, formFromWiz(st.wiz), ctx, assets);
      setPending(outcome.kind === 'published' && leftover !== null ? leftover : null);
      setPub(outcome);
    } catch (err) {
      setPub({ kind: 'failed', cause: 'device', reason: String((err as Error)?.message ?? err) });
    } finally {
      inFlight.current = false;
    }
  };

  /** THE COMPLETION PATH — re-upload only what failed, then attach. No republish. */
  const onCompletePhotos = async (): Promise<void> => {
    if (inFlight.current || pending === null || mediaService === null || offerService === null) return;
    if (identity.current === null) return;
    inFlight.current = true;
    setAttachNote('sending');
    try {
      const prev = pending.uploads;
      const retry = async (u: RoleUpload, bytes: Uint8Array): Promise<RoleUpload> =>
        u.ok ? u : uploadRole(mediaService, bytes);
      const retriedDetails: RoleUpload[] = [];
      for (let i = 0; i < pending.bytes.detail.length; i += 1) {
        retriedDetails.push(await retry(prev.detail[i] ?? { ok: false }, pending.bytes.detail[i]!));
      }
      const uploads: AssemblyInput = {
        master: prev.master, // the on-device record — already present
        heroSquare: await retry(prev.heroSquare, pending.bytes.heroSquare),
        heroVertical: await retry(prev.heroVertical, pending.bytes.heroVertical),
        proof: await retry(prev.proof, pending.bytes.proof),
        detail: retriedDetails,
        processingVersion: PROCESSING_VERSION,
      };
      const assembled = assembleAssets(uploads);
      if (!assembled.ok) {
        setPending({ uploads, bytes: pending.bytes }); // keep the successes for the next retry
        setAttachNote(t('publier.photos_encore'));
        return;
      }
      // VIDEO-PRODUIT-1c — the completion path carries the clip too: if the
      // photos failed at publish, the video never rode (canon requires the
      // photo roles), so it uploads HERE with them. Same law as publish: a
      // failed video upload never blocks the photos' attach.
      let assetsToAttach = assembled.assets;
      if (session.current.video !== null) {
        const up = await mediaService.uploadVideo(session.current.video.bytes);
        if (up.ok) assetsToAttach = avecVideo(assetsToAttach, up.value);
        else setVideoNote(up.cause === 'http' ? videoEchecKey(up.reason) : 'publier.video_echec_envoi');
      }
      const res: ServiceResult<AttachAssetsOutcome> = await offerService.attachAssets({
        commandId: `${identity.current.commandId}-assets`, // stable per attempt → the attach is idempotent too
        offerId: identity.current.offerId,
        assets: assetsToAttach,
      });
      if (res.ok && (res.value.status === 'attached' || res.value.status === 'idempotent')) {
        setPending(null);
        setAttachNote('done');
      } else if (!res.ok && res.cause === 'network') {
        setAttachNote(t('publier.echec_reseau')); // nothing was sent — say only that
      } else {
        // the diagnostic NEVER stands alone — framed by the catalog sentence,
        // exactly as every other failure surface in this file (verifier finding)
        const detail = res.ok ? `${res.value.status}${res.value.reason ? `: ${res.value.reason}` : ''}` : res.reason;
        setAttachNote(`${t('publier.echec')}\n${detail}`);
      }
    } finally {
      inFlight.current = false;
    }
  };

  // ── NON CONFIGURÉ — a condition, stated BEFORE he types, never an error ─────
  if (offerService === null) {
    return (
      <View style={{ flex: 1 }}>
        <View style={{ paddingTop: 16, paddingHorizontal: GEO.screenPad.side }}>
          <HeaderStacked title="Nouveau produit" onBack={() => d({ t: 'BACK' })} />
        </View>
        <ScrollView contentContainerStyle={SCROLL.stacked} showsVerticalScrollIndicator={false}>
          <Banner tone="info">{t('publier.non_configure')}</Banner>
          <View style={{ marginTop: 22 }}>
            <BtnGhost label={t('publier.retour')} onPress={() => d({ t: 'BACK' })} />
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── the outcome pane (his components, the publier.* strings) ────────────────
  if (pub !== null && pub.kind !== 'sending') {
    return (
      <View style={{ flex: 1 }}>
        <View style={{ paddingTop: 16, paddingHorizontal: GEO.screenPad.side }}>
          <HeaderStacked title="Nouveau produit" onBack={exitToProduits} />
        </View>
        <ScrollView contentContainerStyle={SCROLL.stacked} showsVerticalScrollIndicator={false}>
          {pub.kind === 'published' && (
            <>
              {pub.alreadyRegistered ? (
                <Banner tone="info">{t('publier.deja_enregistre')}</Banner>
              ) : (
                <Banner tone="success" check>{t('publier.publie')}</Banner>
              )}
              <View style={{ marginTop: 18 }}>
                <Overline>{t('publier.reference')}</Overline>
                <Text style={[reference, { marginTop: 6 }]} selectable>{pub.offerId}</Text>
              </View>
              {pub.sellerNetFcfa !== undefined && (
                <View style={{ marginTop: 18 }}>
                  <Overline>{t('publier.net')}</Overline>
                  <Text style={[netAmount, { marginTop: 6 }]} numberOfLines={1}>{formatF(pub.sellerNetFcfa)}</Text>
                </View>
              )}
              {pending !== null ? (
                <>
                  <View style={{ marginTop: 18 }}>
                    <Banner tone="warn">{t('publier.photos_manquantes')}</Banner>
                  </View>
                  {typeof attachNote === 'string' && attachNote !== 'sending' && attachNote !== 'done' && (
                    <Text style={[bodySub, { marginTop: 8 }]}>{attachNote}</Text>
                  )}
                  <View style={{ marginTop: 12 }}>
                    <C07BtnPrimary
                      label={attachNote === 'sending' ? t('publier.envoi') : t('publier.photos_action')}
                      icon="retry"
                      disabled={attachNote === 'sending'}
                      onPress={() => { void onCompletePhotos(); }}
                    />
                  </View>
                </>
              ) : attachNote === 'done' ? (
                <View style={{ marginTop: 18 }}>
                  <Banner tone="success" check>{t('publier.photos_jointes')}</Banner>
                </View>
              ) : captures.current === null ? (
                <Text style={[bodySub, { marginTop: 18 }]}>{t('publier.sans_photo')}</Text>
              ) : mediaService === null ? (
                // He SHOT photos and the media seam is unconfigured: silence here
                // would render success over missing photographs (verifier finding).
                <View style={{ marginTop: 18 }}>
                  <Banner tone="warn">{t('publier.photos_non_config')}</Banner>
                </View>
              ) : null}
              {videoNote !== null && (
                <View style={{ marginTop: 18 }}>
                  <Banner tone="warn">{t(videoNote)}</Banner>
                </View>
              )}
              <Text style={[bodySub, { marginTop: 18 }]}>{t('publier.validite')}</Text>
              <View style={{ marginTop: 22 }}>
                <BtnGhost label={t('publier.retour')} onPress={exitToProduits} />
              </View>
            </>
          )}

          {pub.kind === 'invalid' && (
            <>
              <Banner tone="warn">{pub.errors.map((e) => t(ERROR_KEY[e])).join('\n')}</Banner>
              <View style={{ marginTop: 22 }}>
                <C07BtnPrimary label={t('publier.corriger')} onPress={() => setPub(null)} />
              </View>
            </>
          )}

          {pub.kind === 'refused' && (
            <>
              <Banner tone="warn">{`${t('publier.refuse')}\n${pub.reason}`}</Banner>
              <View style={{ marginTop: 22 }}>
                <C07BtnPrimary label={t('publier.corriger')} onPress={() => setPub(null)} />
              </View>
            </>
          )}

          {pub.kind === 'failed' && (
            <>
              {pub.cause === 'network' ? (
                <Banner tone="warn">{t('publier.echec_reseau')}</Banner>
              ) : pub.cause === 'device' ? (
                <Banner tone="warn">{t('publier.echec_appareil')}</Banner>
              ) : (
                <Banner tone="danger">
                  {`${t(pub.cause === 'http' ? cleEchecHttp(pub.reason) : 'publier.echec_illisible')}\n${pub.reason}`}
                </Banner>
              )}
              <View style={{ marginTop: 22 }}>
                <C07BtnPrimary label={t('publier.reessayer')} icon="retry" onPress={() => { void onPublish(); }} />
              </View>
            </>
          )}

          {pub.kind === 'not_configured' && (
            <>
              <Banner tone="info">{t('publier.non_configure')}</Banner>
              <View style={{ marginTop: 22 }}>
                <BtnGhost label={t('publier.retour')} onPress={exitToProduits} />
              </View>
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  // ── envoi — his wizard goes quiet under one honest line ─────────────────────
  if (pub?.kind === 'sending') {
    // No back control AT ALL while in flight — a live-looking button that does
    // nothing is the dead-input family (verifier finding). Backing out mid-send
    // cannot cancel the send anyway (journaled limitation), so nothing is lost.
    return (
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={SCROLL.stacked} showsVerticalScrollIndicator={false}>
          <Text style={[role({ f: 'BG', w: 700, s: 20 }, P.ink)]}>{'Nouveau produit'}</Text>
          <View style={{ marginTop: 16 }}>
            <Banner tone="info">{t('publier.envoi')}</Banner>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── HIS WIZARD, untouched, over the intercepted dispatcher ──────────────────
  // The step-4 aperçu shows the REAL heroSquare when the Studio produced one —
  // frozen demo chrome must not claim « photo premium » over a glyph tile on a
  // listing that has real photographs (verifier finding).
  //
  // The seller-net figures come from the CANON waterfall (founder rounding
  // ruling 2026-07-25), computed HERE — on the real flow — and handed down. The
  // wizard does no money arithmetic; `v2/money.ts` §3.4 stays frozen and unused
  // by this path.
  //
  // WHEN NO NET MAY BE STATED, THE REASON TRAVELS WITH THE REFUSAL (founder
  // rulings 2026-07-25, both axes). `netLineRefusal` is the single predicate:
  // below the publish floor, or a commission that leaves a NON-POSITIVE net.
  // The same function backs the core's own refusal in `buildCreateOffer`, so
  // the screen and the publish can never disagree about a given pair.
  //
  // The reason is mapped through the EXISTING `ERROR_KEY` table — the same
  // typed vocabulary the publish failures already use, so this adds no second
  // mapping and no invented shape.
  const refusal = netLineRefusal(st.wiz.B, st.wiz.C);
  const money: SellerNetLine =
    refusal === null
      ? { kind: 'figure', net: previewSellerNet(st.wiz.B, st.wiz.C) }
      : { kind: 'refused', reasonKey: ERROR_KEY[refusal] };
  // ALL THREE PHOTOGRAPHS for the verify step — the SHIPPED bytes, in his
  // shot order. `undefined` when the Studio has not run, which is the honest
  // absence the card keys off rather than three grey squares.
  // Each photo carries its ASSIGNED role as a tappable chip (STUDIO-BATCH-1,
  // founder 2026-07-27: *"choose the hero photo, the preuve and the detail
  // from this screen"*). A tap swaps roles — see studio/roles.ts. The aperçu
  // tile shows the assigned hero's WHOLE derivative: the square crop does not
  // exist yet (it renders at publish, from whichever photo ends up hero).
  const set = captures.current;
  const assigned = set === null ? null : rolesFor(set);
  const photos =
    set === null || assigned === null
      ? undefined
      : set.photos.map((p, i) => ({
          label: t(roleChipKey(assigned[i]!)),
          uri: p.derivative.uri,
          onRole: () => setRoles(swapToNext(assigned, i)),
        }));
  const heroIdx = assigned === null ? null : publishOrder(assigned)?.hero ?? null;
  const heroUri = set === null || heroIdx === null ? undefined : set.photos[heroIdx]?.derivative.uri;
  return (
    <S20Wizard
      st={st}
      d={dd}
      money={money}
      heroUri={heroUri}
      photos={photos}
      photosHint={t('publier.roles_hint')}
      fournisseur={{
        value: pour,
        onChange: choisirPour,
        read: fournisseurs,
        onRetry: () => setRelire((n) => n + 1),
        sienId: SUPPLIER_ID,
        // The CURRENT selection is folded into the roster before chipping, so
        // an id typed under a fallback state always HAS a chip once the list
        // arrives — and since the marking is computed from that same value
        // (`chipChoisi`), the marked chip is by construction the id that
        // publishes. `chipsFournisseurs` dedupes, folds his own id into
        // « Vous », filters '', sorts the rest.
        chips: chipsFournisseurs([...(fournisseurs.kind === 'liste' ? fournisseurs.ids : []), pour], SUPPLIER_ID),
      }}
      video={{
        etat: videoEtat,
        onPick: () => { void onPickVideo(); },
        onRetirer: onRetirerVideo,
      }}
    />
  );
}

export { type CaptureSet };
