/**
 * ═══ LA COQUILLE HORS LIGNE — the Boutik+ web pages' app-shell worker ═══
 * COQUILLE-WEB-1 (AUDIT-B+2 F-85, the W6 offline shell), ported from Shop+'s
 * buyer PWA (COQUILLE-HORS-LIGNE-1 + SW-PRECACHE-1), where it has run since
 * September. Law 7: offline-first.
 *
 * Before this worker, the supplier page and the founder's console opened
 * without network on the browser's own error page. Now the shell — index.html,
 * the script it loads and the Faso Premium faces — is cached at the first
 * visit and answers ONLY when the network has already failed:
 *
 *   · NAVIGATIONS are NETWORK-FIRST. Online behaviour is byte-identical to
 *     before this worker existed; the cache speaks only on a network failure,
 *     and then any navigation in scope gets the cached index.html (both pages
 *     are one screen tree with absolute script paths, so the shell boots from
 *     any path).
 *   · Content-addressed files — `_expo/static/…` and `assets/…`, whose names
 *     carry a hash of their bytes — are CACHE-FIRST: their bytes can never
 *     change under their name.
 *   · Everything else — the offer, media, Séra and Shop+ services, any other
 *     origin, every POST — is NEVER touched: no respondWith, the browser
 *     behaves as if no worker existed. The worker holds no app logic, no key,
 *     no order, no money; nothing is queued, so « queued = pending » is never
 *     implicated. What the person sees offline is the app's own honest
 *     « pas de réseau » states, now reachable instead of an error page.
 *
 * This file is a TEMPLATE: scripts/web-offline-shell.mjs fills the two
 * placeholders below — the version (a hash over the served bytes) and the
 * precache list (index.html, what it references, the faces) — into
 * <dist>/sw.js after every web export. The placeholder names appear nowhere
 * else in this file: the filler refuses a template where they do not appear
 * exactly once (Shop+'s lesson — a mention in a comment once swallowed the
 * replacement and shipped a worker that failed to evaluate).
 */

const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `coquille-boutik-plus-${VERSION}`;
const RACINE = new URL('./', self.location.href);

function contenuAdresse(chemin) {
  return chemin.startsWith('_expo/static/') || chemin.startsWith('assets/');
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacher());
});

async function precacher() {
  const cache = await caches.open(CACHE);
  await Promise.all(
    PRECACHE.map(async (chemin) => {
      // The shell is fetched AT THE ROOT, never as /index.html: Cloudflare
      // Pages answers /index.html with a redirect to /, and a redirected
      // answer can never be served to a navigation (the browser refuses it,
      // net::ERR_FAILED) — the offline open would fail on the real host.
      const url = chemin === 'index.html' ? RACINE : new URL(chemin, RACINE);
      if (contenuAdresse(chemin)) {
        // A redeploy re-downloads only what changed: an unchanged hashed file
        // is copied from the previous version's cache.
        const deja = await caches.match(url.href);
        if (deja !== undefined) {
          await cache.put(url.href, deja);
          return;
        }
      }
      // Fixed-name files (index.html) are revalidated with the origin, never
      // seeded from a stale HTTP cache.
      const reponse = await fetch(url.href, contenuAdresse(chemin) ? undefined : { cache: 'no-cache' });
      if (!reponse.ok) throw new Error(`précache ${chemin}: ${reponse.status}`);
      // Belt and braces for any host that still redirects: keep the BYTES,
      // never the redirect flag, so a navigation may use them.
      const propre = reponse.redirected
        ? new Response(await reponse.blob(), { status: reponse.status, statusText: reponse.statusText, headers: reponse.headers })
        : reponse;
      await cache.put(url.href, propre);
    }),
  );
  await self.skipWaiting();
}

self.addEventListener('activate', (event) => {
  event.waitUntil(activer());
});

async function activer() {
  const noms = await caches.keys();
  const anciens = noms.filter((nom) => nom.startsWith('coquille-boutik-plus-') && nom !== CACHE);
  await Promise.all(anciens.map((nom) => caches.delete(nom)));
  await self.clients.claim();
}

self.addEventListener('fetch', (event) => {
  const requete = event.request;
  if (requete.method !== 'GET') return;
  const url = new URL(requete.url);
  if (url.origin !== RACINE.origin || !url.pathname.startsWith(RACINE.pathname)) return;

  if (requete.mode === 'navigate') {
    event.respondWith(naviguer(requete));
    return;
  }
  const chemin = url.pathname.slice(RACINE.pathname.length);
  if (contenuAdresse(chemin)) event.respondWith(depuisCacheDabord(requete, url));
  // Anything else in scope stays the browser's own business.
});

async function depuisCacheDabord(requete, url) {
  const en_cache = await caches.match(url.href);
  if (en_cache !== undefined) return en_cache;
  const reponse = await fetch(requete);
  // Only a good answer under a content-addressed name is kept: a 404 or a
  // proxy page must never be pinned — nor the app page itself, which Pages
  // (no 404.html) sends back with a 200 for a missing file.
  if (reponse.ok && !(reponse.headers.get('content-type') ?? '').includes('text/html')) {
    const cache = await caches.open(CACHE);
    await cache.put(url.href, reponse.clone());
  }
  return reponse;
}

async function naviguer(requete) {
  try {
    return await fetch(requete);
  } catch (erreur) {
    const coquille = await caches.match(RACINE.href);
    if (coquille !== undefined) return coquille;
    throw erreur;
  }
}
