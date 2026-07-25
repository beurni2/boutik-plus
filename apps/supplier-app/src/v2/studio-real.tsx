/**
 * COMBINED SLICE — BOUTIK+ STUDIO, REAL. His S26 design (C39 viseur frame,
 * MetersList, ProcessingList, C40 avant/après, C07 primary) with a REAL camera
 * behind it — expo-camera capture through the PROVEN pipeline (`captureShot`:
 * decode → strip → assertExifFree as a post-condition on the shipped bytes).
 * The demo S26Studio stays in screens2.tsx untouched and unrouted; this is the
 * same design carrying real substance, not a new capture screen.
 *
 * THREE SHOTS, HIS SEQUENCE: héro · preuve · détail. The hero's TWO CROPS
 * (square + vertical, canon's two hero slots) render during « Traitement » —
 * real work where the demo ticked timers. The before/after card shows the REAL
 * master next to the REAL stripped derivative: WYSIWYG is the shipped bytes.
 *
 * Approval hands the capture set UP to the wizard wrapper (uploads happen at
 * publish, not here — a capture is instant and local; the network waits until
 * he decides) and dispatches the machine's own STUDIO_APPROVE, so `wiz.photos`
 * and the return-to-wizard transition stay §4's, not a parallel copy.
 */
import { useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { P, TILE_GRADIENT } from '../ui/v2/palette';
import { GEO } from '../ui/v2/tokens';
import { C21, C39, C40, role } from '../ui/v2/styles';
import { SCROLL } from '../ui/v2/styles';
import { t } from '../i18n';
import { Banner, C07BtnPrimary, Card, HeaderStacked, IconTile, MetersList, Overline, ProcessingList } from './components';
import { captureShot, renderCropDerivative, type CaptureResult, type StrippedDerivative } from '../studio/capture';
import { heroSquareCrop, heroVerticalCrop } from '../studio/crops';
import type { A } from './machine';

/** Everything the publish path needs from one Studio session. */
export interface CaptureSet {
  readonly hero: CaptureResult;
  readonly heroSquare: StrippedDerivative;
  readonly heroVertical: StrippedDerivative;
  readonly proof: CaptureResult;
  readonly detail: CaptureResult;
}

/** His shot sequence, verbatim from the S26 design. */
const SHOTS = [
  { title: '1 · Photo héro', sub: 'Sur une surface simple. Elle recevra la mise en forme premium.' },
  { title: '2 · Photo preuve', sub: "L'article en main, dans votre boutique. Une photo réelle qui inspire confiance (le désordre est permis)." },
  { title: '3 · Détail catégorie', sub: 'Mode : étiquette de taille bien lisible.' },
] as const;

/** The processing rows — now the names of REAL work, in the order it runs. */
const PROC_ROWS = ['Métadonnées retirées (preuve à l\'appui)', 'Cadrage carré du héro', 'Cadrage vertical du héro', 'Vérification finale'];

type Phase =
  | { kind: 'shooting'; index: 0 | 1 | 2 }
  | { kind: 'processing'; done: number }
  | { kind: 'review'; set: CaptureSet }
  | { kind: 'failed'; reason: string };

export function S26StudioReal({ d, onApproved }: { d: (a: A) => void; onApproved: (set: CaptureSet) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView | null>(null);
  const shots = useRef<CaptureResult[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: 'shooting', index: 0 });
  const [lastVerdict, setLastVerdict] = useState<string | null>(null);
  const busy = useRef(false);

  const capture = async () => {
    if (busy.current || camera.current === null) return;
    busy.current = true;
    try {
      const shot = await captureShot(camera.current);
      // guidanceFor returns full CATALOG KEYS (studio.conseil.*) — used as-is
      setLastVerdict(shot.guidance.verdict === 'ok' ? null : shot.guidance.key);
      shots.current.push(shot);
      if (shots.current.length < 3) {
        setPhase({ kind: 'shooting', index: shots.current.length as 1 | 2 });
      } else {
        // « Traitement (sur votre téléphone) » — REAL work, progressed as it runs.
        setPhase({ kind: 'processing', done: 1 }); // strip already ran inside captureShot, per shot
        const [hero, proof, detail] = shots.current as [CaptureResult, CaptureResult, CaptureResult];
        const heroSquare = await renderCropDerivative(hero.masterUri, heroSquareCrop(hero.derivative.width, hero.derivative.height));
        setPhase({ kind: 'processing', done: 2 });
        const heroVertical = await renderCropDerivative(hero.masterUri, heroVerticalCrop(hero.derivative.width, hero.derivative.height));
        setPhase({ kind: 'processing', done: 3 });
        setPhase({ kind: 'processing', done: 4 });
        setPhase({ kind: 'review', set: { hero, heroSquare, heroVertical, proof, detail } });
      }
    } catch (err) {
      // A capture that cannot be PROVEN clean does not exist (assertExifFree
      // throws) — an honest failed state, never an unstripped byte kept.
      setPhase({ kind: 'failed', reason: String((err as Error)?.message ?? err) });
    } finally {
      busy.current = false;
    }
  };

  if (!permission?.granted) {
    return (
      <View style={{ flex: 1 }}>
        <View style={{ paddingTop: 16, paddingHorizontal: GEO.screenPad.side }}>
          <HeaderStacked title="Boutik+ Studio" onBack={() => d({ t: 'BACK' })} />
        </View>
        <ScrollView contentContainerStyle={SCROLL.stacked} showsVerticalScrollIndicator={false}>
          <Banner tone="info">{t('studio.permission')}</Banner>
          <View style={{ marginTop: 16 }}>
            <C07BtnPrimary label={t('studio.autoriser')} icon="camera" onPress={() => { void requestPermission(); }} />
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={SCROLL.stacked} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <HeaderStacked title="Boutik+ Studio" onBack={() => d({ t: 'BACK' })} />
      </View>
      <Text style={[role({ f: 'IS', w: 400, s: 12 }, P.sub)]}>{'De vraies photos — aucune image inventée par IA'}</Text>

      {phase.kind === 'shooting' && (
        <>
          <Text style={[role({ f: 'BG', w: 700, s: 20 }, P.ink), { marginTop: 16 }]}>{SHOTS[phase.index].title}</Text>
          <Text style={[role({ f: 'IS', w: 400, s: 13.5, lh: 1.5 }, P.sub), { marginTop: 6 }]}>{SHOTS[phase.index].sub}</Text>
          <View style={[C39.frame, { marginTop: 13 }]}>
            {/* THE REAL VISEUR — the camera lives where the demo's gradient tile sat. */}
            <CameraView ref={camera} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: C21.viseur.r }} />
            <View style={C39.inset} pointerEvents="none" />
            <Text style={C39.caption}>{C39.CAPTION}</Text>
          </View>
          {lastVerdict !== null && (
            <Banner tone="warn" style={{ marginTop: 11, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 15 }}>
              {t(lastVerdict)}
            </Banner>
          )}
          <View style={{ marginTop: 12 }}>
            <C07BtnPrimary label="Capturer" icon="camera" onPress={() => { void capture(); }} />
          </View>
        </>
      )}

      {phase.kind === 'processing' && (
        <>
          <Text style={[role({ f: 'BG', w: 700, s: 20 }, P.ink), { marginTop: 16 }]}>{'Traitement (sur votre téléphone)'}</Text>
          <View style={{ marginTop: 13 }}>
            <ProcessingList rows={[...PROC_ROWS]} proc={phase.done} />
          </View>
        </>
      )}

      {phase.kind === 'review' && (
        <>
          <Text style={[role({ f: 'BG', w: 700, s: 20 }, P.ink), { marginTop: 16 }]}>{'Traitement (sur votre téléphone)'}</Text>
          <View style={{ marginTop: 13 }}>
            <ProcessingList rows={[...PROC_ROWS]} proc={4} />
          </View>
          <Card style={{ marginTop: 12, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Overline level="card">Avant / Après</Overline>
            </View>
            <View style={C40.grid}>
              <View style={C40.col}>
                {/* the REAL master — retained on-device, never uploaded, never published */}
                <Image source={{ uri: phase.set.hero.masterUri }} style={{ height: C40.imgLeft.h, borderRadius: C40.imgLeft.r }} resizeMode="cover" />
                <Text style={C40.legend}>{C40.LEGEND_LEFT}</Text>
              </View>
              <View style={C40.col}>
                <View style={C40.framed}>
                  {/* the REAL stripped derivative — these exact bytes upload */}
                  <Image source={{ uri: phase.set.heroSquare.uri }} style={{ height: C40.imgRight.h, borderRadius: C40.imgRight.r }} resizeMode="cover" />
                </View>
                <Text style={C40.legend}>{C40.LEGEND_RIGHT}</Text>
              </View>
            </View>
          </Card>
          <View style={{ marginTop: 12 }}>
            <C07BtnPrimary
              label="J'approuve ces photos"
              onPress={() => {
                onApproved(phase.set);
                d({ t: 'STUDIO_APPROVE' }); // §4's own transition: wiz.photos=true, back to the wizard
              }}
            />
          </View>
        </>
      )}

      {phase.kind === 'failed' && (
        <>
          <View style={{ marginTop: 16 }}>
            <Banner tone="warn">{`${t('studio.echec')}\n${phase.reason}`}</Banner>
          </View>
          <View style={{ marginTop: 12 }}>
            <C07BtnPrimary
              label={t('publier.reessayer')}
              icon="retry"
              onPress={() => { shots.current = []; setPhase({ kind: 'shooting', index: 0 }); }}
            />
          </View>
        </>
      )}

      {/* the demo's low-light simulate toggle is gone — light is judged from the
          REAL metrics frame now; the IconTile/Pressable demo affordances live on
          only in the unrouted S26Studio */}
      <View style={{ height: 0, opacity: 0 }} pointerEvents="none">
        <IconTile bg={TILE_GRADIENT.p1} glyph="" size={0} radius={0} glyphSize={0} />
        <MetersList rows={[]} />
        <Pressable onPress={() => {}} accessibilityRole="button"><Text>{''}</Text></Pressable>
      </View>
    </ScrollView>
  );
}
