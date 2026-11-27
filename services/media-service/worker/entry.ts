import handler from './index.js';

export { AudioRead } from './audio-read.js';

/**
 * ═══ THE DEPLOYED ENTRY MODULE — THE DEFAULT HANDLER, PLUS `AudioRead` BY NAME ═══
 *
 * WHY THIS FILE EXISTS (found 2026-08-11, by the first test that ever tried to
 * run this Worker on real workerd): `worker/index.ts` exports its route paths
 * and its handler functions by name, because every unit test in this service
 * imports them. workerd reads a module's NAMED EXPORTS as additional
 * entrypoints, and refuses to start when one of them is not a handler:
 *
 *     service core:user:: Uncaught TypeError: Incorrect type for map entry
 *     'AUDIO_UPLOAD_PATH': the provided value is not of type
 *     'function or ExportedHandler'.
 *
 * ⚠ SAID PRECISELY, because two claims are easy to confuse here: PRODUCTION WAS
 * NEVER BROKEN. `media-deploy` has run seven times, all successful, most
 * recently 2026-08-08 — Cloudflare's own validation accepts that module and the
 * live Worker serves. What was impossible was TESTING it: the bundle could not
 * be loaded by the runtime this repo proves things on, which is precisely why no
 * media test had ever crossed that seam and why the gap went unseen (the tests
 * all drove the default export as a plain function in Node, where a stray string
 * export means nothing). Whether Cloudflare tightens to match workerd on a
 * compatibility-date bump is not something I can answer from here; the shape is
 * correct either way now.
 *
 * THE FIX IS A SHAPE, NOT A BEHAVIOUR. This module re-exports the same handler
 * and adds nothing; `bundle:worker` points here, so the deployed artifact
 * carries the default handler and, by name, only the `AudioRead` entrypoint. `worker/index.ts` keeps its named exports for the
 * unit suites, which is what they are for.
 *
 * ⚠ ANY FUTURE ENTRYPOINT — a Durable Object class, a WorkerEntrypoint — is
 * added HERE, by name, and nowhere else. A constant exported from this file
 * stops the Worker from starting.
 *
 * AUDIO-READ — the first one: `AudioRead`, the buyer's voice note behind a
 * service binding (`audio-read.ts`). `cloudflare:workers` stays external in
 * `bundle:worker`; the runtime provides it.
 */
export default handler;
