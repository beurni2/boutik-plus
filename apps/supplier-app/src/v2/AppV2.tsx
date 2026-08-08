/**
 * WO-FP-PIXEL — the V2 shell: machine-driven router + effect runner.
 * Chrome stack (§1.3): status zone 54 → C02 stripe tissée 6 → screen; Dock
 * visible ssi view === null; overlays at §1 z-order (dock 30 · sheet 60 ·
 * toast 80 · célébration 90) — each overlay positions itself via styles.ts.
 *
 * Effects are DATA from reduce() (§4.3 timers: boot 750 · toast 2800 ·
 * moderation 6000 · studioTick 620 · celebration 2200); this shell is the only
 * place they touch setTimeout. 'tween'/'haptic' are inert here for now — §7
 * motion wiring is sequenced LAST per the standing value-match-first order.
 *
 * THE REGISTERED PREVIEW ROOT. This comment used to say the opposite ("NOT the
 * registered root: E1 App.tsx stays root") and was stale — corrected here rather
 * than left to mislead the next reader, since this commit edits this file.
 * `expo-preview.yml` defaults `EXPO_PUBLIC_ROOT` to `v2` (founder ruling
 * 2026-07-17) and `index.ts` mounts AppV2 for that value, so every preview
 * publish — main-push and bare dispatch alike — lands HERE. E1's App.tsx stays
 * reachable dispatch-only via `root=e1`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { P } from '../ui/v2/palette';
import {
  bootEffect, initialState, reduce,
  type A, type Effect, type S, type Tab, type View as MachineView,
} from './machine';

import { Dock, StatusZone, ToastStack } from './components';
import { C02StripeTissee } from '../ui/v2/components/C02StripeTissee';
import { S01 } from './screens1';
import { SCommandesReel } from '../commandes/screen';
import { S33Trust, S34Onboard } from './screens2';
import { SGainsReel } from '../gains/screen';
import { SAccueilReel } from '../accueil/screen';
import { SListerReal, type ListingSession } from './lister-real';
import { SProduitsReal, type ProduitsCache } from './produits-real';
import { SOperations } from '../operations/screen';
import { operateurHashPresent, readStoredOpsKey } from '../operations/service';
import { SUPPLIER_ID } from '../supply/service';
import { useWebFonts } from '../ui/web-fonts';
import { S26StudioReal, type CaptureSet } from './studio-real';

export function AppV2({ startTab, startView }: { startTab?: Tab; startView?: MachineView }) {
  // BOUTIK-WEB-W1: on web the Faso Premium faces load at runtime (no config
  // plugin there); never gates a render — see src/ui/web-fonts.ts.
  useWebFonts();
  const stRef = useRef<S | null>(null);
  if (stRef.current === null) {
    const s0 = initialState();
    stRef.current = { ...s0, tab: startTab ?? s0.tab, view: startView ?? s0.view };
  }
  const [st, setSt] = useState<S>(stRef.current);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const dRef = useRef<(a: A) => void>(() => {});

  const run = useCallback((fx: Effect[]) => {
    for (const e of fx) {
      if (e.kind === 'timer') {
        const h = setTimeout(() => {
          timers.current.delete(h);
          dRef.current(e.action);
        }, e.afterMs);
        timers.current.add(h);
      }
      // 'tween' / 'haptic': inert until the §7 motion pass (see header).
    }
  }, []);

  const d = useCallback(
    (a: A) => {
      // COMBINED SLICE — a NEW listing starts clean: opening the wizard resets
      // the shell-held session (captures, code-suggestion state). This is what
      // makes the « cleared when a new wizard opens » claim TRUE in code, and
      // what stops product A's captures or code state reaching product B.
      if (a.t === 'OPEN_WIZ') {
        captures.current = null;
        // `pourFournisseur` resets WITH the rest: product A aimed at another
        // supplier must not silently aim product B there too.
        listing.current = { codeTouched: false, suffixBytes: null, pourFournisseur: '', video: null };
      }
      const out = reduce(stRef.current as S, a);
      stRef.current = out.s;
      setSt(out.s);
      run(out.fx);
    },
    [run],
  );
  dRef.current = d;

  useEffect(() => {
    run([bootEffect]); // §4.3 T01: 750ms skeleton → BOOT_DONE
    const pending = timers.current;
    return () => {
      for (const h of pending) clearTimeout(h);
      pending.clear();
    };
  }, [run]);

  // COMBINED SLICE — the Studio's approved captures AND the listing session
  // (code-suggestion state), owned at the SHELL: studio and wizard are sibling
  // views, so SListerReal UNMOUNTS on every studio round-trip — refs living
  // inside it would reset and the suggestion would overwrite his edited code
  // (verifier finding). Both are cleared in d() when a new wizard opens.
  const captures = useRef<CaptureSet | null>(null);
  const listing = useRef<ListingSession>({ codeTouched: false, suffixBytes: null, pourFournisseur: '', video: null });
  // PRODUITS-READ-1 — the last successful list, held at the SHELL so it survives
  // the tab switch that unmounts SProduitsReal. A ref, so it dies with the
  // process: a list of offers that no longer exist is a fabrication with a
  // timestamp, and there is no invalidation signal to make persistence safe.
  const produits = useRef<ProduitsCache>({ rows: null, asOf: null });

  // CONSOLE-1 — the founder's operator key, held at the SHELL and never in the
  // machine: the machine is pure demo-safe state, and the key is a credential.
  // Present ⇒ the Dock shows « Opérations ». The door for a fresh browser is
  // the web-only #operateur hash (boutik-plus-web.pages.dev/#operateur), which
  // shows the tab so the key screen becomes reachable; on native it never
  // exists.
  const [opsKey, setOpsKey] = useState<string | null>(() => readStoredOpsKey());
  // The door, ONCE OPEN THIS SESSION, STAYS OPEN: a refused key clears back to
  // the key screen — the tab must not vanish under the founder mid-recovery,
  // and the bad-key moment IS the key-rotation moment. A fresh browser without
  // the stored key or the hash never opens it at all.
  const [operateurDoor] = useState(() => readStoredOpsKey() !== null || operateurHashPresent());

  // BOUTIK-WEB — THE 430px PHONE FRAME WAS REVERTED BY FOUNDER RULING
  // (2026-07-27, verbatim: *"the whole webapp the way it was, was good and my
  // issue was the photo part only"*). The app takes the full browser width
  // again; the PHOTO display alone stays constrained — see the fiche gallery
  // in screens1.tsx, where the cap now lives.
  const { width } = useWindowDimensions();
  const v = st.view;

  return (
    <View style={{ flex: 1, backgroundColor: P.bg }}>
      <StatusZone />
      <C02StripeTissee width={width} />
      <View style={{ flex: 1 }}>
        {st.loading ? (
          <S01 />
        ) : v === null ? (
          st.tab === 'home' ? (
            // RB-4 (founder direction 2026-08-08) — the REAL home: his offers,
            // the real paid-order book, counts of real rows. The demo store's
            // last route into the shell ends here.
            <SAccueilReel d={d} opsKey={opsKey} />
          ) : st.tab === 'produits' ? (
            // PRODUITS-READ-1 — REAL offers, read from the service. Since
            // RB-4 the seed store has NO route into this shell at all.
            <SProduitsReal st={st} d={d} supplierId={SUPPLIER_ID} cache={produits} />
          ) : st.tab === 'commandes' ? (
            // RB-1 (founder direction 2026-08-08) — the REAL paid-order book,
            // not the demo store: the console's board and Livraisons flows
            // live here now, and the console zones are retired.
            <SCommandesReel />
          ) : st.tab === 'operations' ? (
            <SOperations
              opsKey={opsKey}
              onKeySaved={setOpsKey}
              // Stays ON the operations tab: with the key null, SOperations
              // renders the key screen — the recovery is one paste away,
              // never a hunt for a vanished tab.
              onKeyCleared={() => setOpsKey(null)}
            />
          ) : (
            // RB-3 (founder direction 2026-08-08) — the REAL gains: each paid
            // order's frozen money split behind key C, never the demo ledger.
            <SGainsReel />
          )
        ) : v.s === 'add' ? (
          // COMBINED SLICE (founder reversal): « Lister un produit » opens HIS
          // five-step wizard again — the real writes run THROUGH it. SListerReal
          // wraps the untouched S20Wizard with the real plumbing (uploads,
          // publish, outcome states); publier.tsx is DELETED — one path, his.
          // The machine action and the view id are unchanged.
          <SListerReal st={st} d={d} captures={captures} session={listing} />
        ) : v.s === 'studio' ? (
          // Studio is REAL: his S26 design over expo-camera + the proven strip
          // pipeline. The demo S26Studio stays in screens2.tsx, unrouted. The
          // capture set lives HERE (view 'studio' and view 'add' are siblings,
          // so a set approved in one must survive the switch to the other).
          <S26StudioReal d={d} onApproved={(set) => { captures.current = set; }} />
        ) : v.s === 'trust' ? (
          <S33Trust d={d} />
        ) : v.s === 'onboard' ? (
          <S34Onboard st={st} d={d} />
        ) : (
          // unreachable id-miss guard: land back on the current tab, never crash
          <SAccueilReel d={d} opsKey={opsKey} />
        )}
      </View>
      {!st.loading && v === null && <Dock tab={st.tab} onTab={(tab) => d({ t: 'TAB', tab })} operateur={operateurDoor} />}
      <ToastStack toasts={st.toasts} />
    </View>
  );
}
