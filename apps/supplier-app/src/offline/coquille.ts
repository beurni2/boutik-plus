/**
 * COQUILLE-WEB-1 (AUDIT-B+2 F-85) — the native side of the offline shell: an
 * Expo app on a phone opens from its own installed bundle, so there is no
 * page to keep and nothing to register. The web twin (coquille.web.ts)
 * registers the service worker.
 */
export function enregistrerCoquille(): void {}
