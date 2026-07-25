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
import { useMemo, useRef, useState } from 'react';
import { File } from 'expo-file-system';
import { ScrollView, Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { GEO } from '../ui/v2/tokens';
import { SCROLL, role } from '../ui/v2/styles';
import { t } from '../i18n';
import { formatF } from './money';
import { Banner, BtnGhost, C07BtnPrimary, HeaderStacked, Overline } from './components';
import { S20Wizard } from './screens2';
import { mintCommandId } from '../offline/commandId';
import { resolveSupplyService, type AttachAssetsOutcome, type ServiceResult, type SupplyServicePort } from '../supply/service';
import { resolveMediaService, sha256Hex, type MediaServicePort } from '../supply/media';
import { assembleAssets, type AssemblyInput, type ProductAssetsInput, type RoleUpload } from '../supply/assets';
import {
  CATEGORY_FLOOR_FCFA,
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
import { previewSellerNet } from '../supply/preview';
import { derivativeBytesFromUri } from '../studio/capture';
import type { CaptureSet } from './studio-real';
import type { A, S } from './machine';

/** The founder's supplier id (offer-service `FOUNDER_001_SUPPLIER_ID`). HARD GATE: one supplier. */
const SUPPLIER_ID = 'supplier-founder-001';
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

/** The raw bytes per role — kept so a retry re-uploads ONLY what failed. */
interface UploadBytes {
  readonly heroSquare: Uint8Array;
  readonly heroVertical: Uint8Array;
  readonly proof: Uint8Array;
  readonly detail: Uint8Array;
  readonly masterSha256: string;
}

/** The wizard's field values mapped onto the authoring form — one source, no drift. */
function formFromWiz(wiz: S['wiz']): AuthoringForm {
  return {
    name: wiz.name,
    productCode: wiz.code,
    category: wiz.cat,
    zone: wiz.zone,
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
  const [attachNote, setAttachNote] = useState<'sending' | 'done' | string | null>(null);
  const inFlight = useRef(false);
  const identity = useRef<OfferIdentity | null>(null);
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
    try {
      identity.current = retainIdentity(identity.current, mintCommandId);
      const now = new Date().toISOString();
      const win = offerWindow(now);
      const ctx: AuthoringContext = {
        supplierId: SUPPLIER_ID,
        ...identity.current,
        now,
        effective: win.effective,
        expiry: win.expiry,
        moderationState: MODERATION_STATE,
      };

      // ── photographs: hash the master, upload the four derivatives ──────────
      let assets: ProductAssetsInput | undefined;
      let leftover: PendingPhotos | null = null;
      if (captures.current !== null && mediaService !== null) {
        const set = captures.current;
        const bytes: UploadBytes = {
          heroSquare: set.heroSquare.bytes,
          heroVertical: set.heroVertical.bytes,
          proof: derivativeBytesFromUri(set.proof.derivative.uri),
          detail: derivativeBytesFromUri(set.detail.derivative.uri),
          // the master never uploads (open read route vs « master private ») —
          // so the record is the REAL hash of the MASTER'S OWN BYTES, read from
          // the retained file. Hashing the derivative here and calling it the
          // master would be a false record — the exact fabrication class this
          // project refuses. If the file cannot be read, the master is honestly
          // missing and the whole set stays absent (prefix rule).
          masterSha256: await sha256Hex(await new File(set.hero.masterUri).bytes()),
        };
        const uploads: AssemblyInput = {
          master: {
            ok: true,
            ref: { ref: `private/device/${bytes.masterSha256}`, sha256: bytes.masterSha256, mimeType: 'image/jpeg' },
          },
          heroSquare: await uploadRole(mediaService, bytes.heroSquare),
          heroVertical: await uploadRole(mediaService, bytes.heroVertical),
          proof: await uploadRole(mediaService, bytes.proof),
          detail: [await uploadRole(mediaService, bytes.detail)],
          processingVersion: PROCESSING_VERSION,
        };
        const assembled = assembleAssets(uploads);
        if (assembled.ok) {
          assets = assembled.assets;
        } else {
          leftover = { uploads, bytes }; // publish without photos; complete after
        }
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
      const uploads: AssemblyInput = {
        master: prev.master, // the on-device record — already present
        heroSquare: await retry(prev.heroSquare, pending.bytes.heroSquare),
        heroVertical: await retry(prev.heroVertical, pending.bytes.heroVertical),
        proof: await retry(prev.proof, pending.bytes.proof),
        detail: [await retry(prev.detail[0] ?? { ok: false }, pending.bytes.detail)],
        processingVersion: PROCESSING_VERSION,
      };
      const assembled = assembleAssets(uploads);
      if (!assembled.ok) {
        setPending({ uploads, bytes: pending.bytes }); // keep the successes for the next retry
        setAttachNote(t('publier.photos_encore'));
        return;
      }
      const res: ServiceResult<AttachAssetsOutcome> = await offerService.attachAssets({
        commandId: `${identity.current.commandId}-assets`, // stable per attempt → the attach is idempotent too
        offerId: identity.current.offerId,
        assets: assembled.assets,
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
                  {`${t(pub.cause === 'http' ? 'publier.echec' : 'publier.echec_illisible')}\n${pub.reason}`}
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
  // BELOW THE PUBLISH FLOOR, NO FIGURE TRAVELS (founder ruling 2026-07-25). The
  // stepper reaches B = 500; `buildCreateOffer` refuses anything under
  // CATEGORY_FLOOR_FCFA (5 000) with `base_price_below_floor`. Nine reachable
  // positions therefore describe an offer that cannot exist, and canon would
  // still hand back a number for them — a negative one at the default C for the
  // lowest two. The refusal is decided HERE because this wrapper is the layer
  // that owns the publish rules; the wizard renders the absence it is handed.
  const money = st.wiz.B < CATEGORY_FLOOR_FCFA ? null : previewSellerNet(st.wiz.B, st.wiz.C);
  return <S20Wizard st={st} d={dd} money={money} heroUri={captures.current?.heroSquare.uri} />;
}

export { type CaptureSet };
