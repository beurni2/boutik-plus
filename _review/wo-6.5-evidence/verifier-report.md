# WO-6.5 — fresh-context RED verifier (round 1), verdict verbatim
Reviewed git diff main...HEAD on e6/wo-6.5. Verifier carried no build memory; performed the four
mandated attacks WITH ITS OWN HANDS (craft a hostile image the corpus lacks; kill mid-queue + cold-boot;
double-delivery; make a queued action show success).

## FINDINGS
1. [OK] Hostile-image allow-list drops every metadata carrier the corpus never tested. 8 crafted fixtures:
   APP4 (0xE4) "Exif GPS 12.37,-1.53 Ouagadougou" present in input, GONE from output; APP13/IPTC, COM-URL,
   APP0/JFIF, APP14/Adobe dropped; post-EOI ELF (7f454c46) and %PDF-1.7 do NOT ship (output ends ...ffd9);
   malformed APP1 len=0 and len=1 both fail closed → ExifLeakError strip_failed. Every case matched outcome.
2. [CONCERN — not a blocker] Entropy-stream bytes pass through verbatim: raw "LOCATION-12.37N" with no marker
   prefix inside the scan, and a payload framed as a second allow-listed SOS scan's entropy, both survive.
   Inherent to a byte-level stripper that does not re-decode pixels — "SOS + entropy" is in the documented
   allow-list, and hiding bytes in entropy is indistinguishable from attacker-controlled pixel data. All
   metadata SEGMENTS + post-EOI polyglots are dropped; the production path re-encodes via
   expo-image-manipulator before this guard runs. A documented limit, not a defect against the threat model.
3. [OK] Queue survives app-kill + cold-boot; only the file crosses. Enqueue A/B/C, null the instance, open a
   fresh DurableQueue over the same fs path → pending [A,B,C] in order, all 'pending', then delivered in
   insertion order {delivered:3,failed:0,remaining:0}. On disk: only {"version":1,"entries":[…"pending"…]}.
4. [OK] Exactly-once delivery. send fired once for dup-1 across deliver→deliver→reopen-and-deliver. A
   duplicate enqueue of the same command_id (different payload) is a no-op; first payload retained.
5. [OK] Queued never fakes success. Across a reboot with no send, all entries stay pending. PoisonError →
   failed immediately with failureReason; a transient throw stays pending then → failed at maxAttempts with
   its reason; only a truly-resolved send reached delivered. Failed states persist across a further reboot,
   never retried into success, never silently dropped.
6. [OK] Non-vacuity is real. legacyDropListStrip is byte-faithful to the pre-WO-6.5 code (STRIPPED_MARKERS
   {e1,ed,fe} + SOS out.set(bytes.subarray(i)) verbatim-to-end). The test asserts the old list LEAKS
   ICC/APP15/post-EOI-ZIP where the allow-list is clean (hardened === CLEAN_CORE). Genuine assertions.
7. [OK] DoD gates green. tsc 0; vitest run test/ = 114 passed (16 hostile-corpus, 7 offline-queue);
   copy-lint 140/0; no-emoji OK. New string shell.queue_durable is calm plain French, register neutral,
   says pending never done.
8. [OK] Forbidden list held. src/demo/store.ts, src/journey.ts, src/ui/kit.tsx empty diffs. No money math
   changed (App.tsx only reads pre-existing confirmNet). ui-studio imaging regex narrowed segment→
   segmentation — justified (JPEG-structural word vs Ten-Laws #5 ML term).
9. [OK] New dep justified by quoted installed types. expo-file-system ~19.0.23. Every quote in expoStore.ts
   present in the installed .d.ts (Paths.document; File constructor/text/write/create/exists). Dep-gate test
   asserts the exact added-deps set.
10. [CONCERN — not a blocker] App-layer command_id was an in-memory counter (confirmSeqRef) resetting on
    reboot — a post-reboot confirm could regenerate a colliding ready:1 and be silently deduped while the UI
    shows queued: the lost-action failure the WO warns of, at the demo glue layer (not the queue). Unreachable
    in the single-product demo; DurableQueue idempotency itself sound. Production must derive command_id from
    the domain event.  [RESOLVED at 08f548e — reboot-safe wall-clock+counter id; production-domain-id flagged.]

## VERDICT: PASS (0 blockers, 2 concerns).
Both debts defended at the reviewed layer: the stripper drops every metadata carrier and post-EOI payload
(fail-closed on malformed); the DurableQueue provably survives kill+reboot, delivers exactly once, never
fakes success. Concern #10 fixed post-verdict; concern #2 (entropy passthrough) is the documented limit.
