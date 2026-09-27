/**
 * CROISSANCE-1 (AUDIT-B+2 F-04 d) — THE MINUTE REFRESH RUNS ONLY WHILE
 * SOMEONE IS LOOKING.
 *
 * His page and the founder's console re-read the order book every minute, and
 * a tab left open behind others re-read it all day for nobody: every one of
 * those reads counts against the account's daily allowance (Free plan,
 * account-wide — when it runs out, every storage read on the account fails
 * until midnight UTC). A hidden page now reads nothing; the moment it is in
 * front of him again it reads once at once — so he never looks at a stale
 * list — and then every minute as before.
 *
 * THE BROWSER ONLY. On a phone app there is no `document`, and the refresh
 * keeps its old rhythm there (the audit's finding is the web pages; the
 * native apps are not on this road today).
 *
 * This lowers how often a page reads; it does not bound what one read costs —
 * that is the order book's own work (CROISSANCE-1, `fulfillment-do.ts`).
 */
type DocumentVisible = {
  readonly visibilityState?: string;
  addEventListener?(type: 'visibilitychange', listener: () => void): void;
  removeEventListener?(type: 'visibilitychange', listener: () => void): void;
};

/** Start the refresh; the returned function stops it (an effect's cleanup). */
export function rafraichirQuandVisible(charger: () => void, chaqueMs: number): () => void {
  const doc = (globalThis as { document?: DocumentVisible }).document;
  const cachee = (): boolean => doc?.visibilityState === 'hidden';
  let h: ReturnType<typeof setInterval> | null = null;
  const demarrer = (): void => {
    if (h === null) h = setInterval(charger, chaqueMs);
  };
  const arreter = (): void => {
    if (h !== null) {
      clearInterval(h);
      h = null;
    }
  };
  const surChangement = (): void => {
    if (cachee()) {
      arreter();
    } else if (h === null) {
      charger();
      demarrer();
    }
  };
  if (!cachee()) demarrer();
  doc?.addEventListener?.('visibilitychange', surChangement);
  return () => {
    arreter();
    doc?.removeEventListener?.('visibilitychange', surChangement);
  };
}
