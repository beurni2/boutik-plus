/**
 * COQUILLE-WEB-1 (AUDIT-B+2 F-85) — registers the offline shell on the two
 * web pages, so a page opened with no network shows the app and its honest
 * « pas de réseau » states instead of the browser's error page. The worker
 * itself (/sw.js) is written by scripts/web-offline-shell.mjs after the
 * export; only a production build registers it, so `expo start --web` never
 * installs one. A page whose sw.js is missing simply opens as before.
 *
 * The browser shapes are declared here, narrowly, as the other web-only
 * files do: this app's types carry no DOM library. The call is written as
 * `….serviceWorker.register('/sw.js')` on purpose — web-artifact-checks
 * finds that exact call in the shipped script.
 */
type ServiceWorkers = { register(url: string): Promise<unknown> };
type ShellGlobals = {
  navigator?: { serviceWorker?: ServiceWorkers };
  addEventListener?: (type: 'load', listener: () => void) => void;
};

export function enregistrerCoquille(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const g = globalThis as ShellGlobals;
  const nav = g.navigator;
  if (nav?.serviceWorker === undefined || g.addEventListener === undefined) return;
  const avecWorker = nav as { serviceWorker: ServiceWorkers };
  g.addEventListener('load', () => {
    void avecWorker.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
