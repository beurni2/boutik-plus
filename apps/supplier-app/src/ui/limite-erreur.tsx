import { Component, createElement, type ComponentType, type ErrorInfo, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { P } from './v2/palette';
import { GEO } from './v2/tokens';
import { role } from './v2/styles';
import { C07BtnPrimary } from './v2/components/C07BtnPrimary';
import { t } from '../i18n';

/**
 * LISTER-VRAI-1 (AUDIT-B+2 F-56) — ONE BOUNDARY AT THE ROOT OF EACH PAGE.
 *
 * Before it, any throw during a render — `t()` on a missing key, the canon
 * waterfall refusing a figure — left a white page whose only way out was a
 * reload he had to think of himself. Now the same throw shows one calm screen
 * and one act: « Recharger ».
 *
 * IT SWALLOWS NOTHING. The error is logged with the component stack, and the
 * screen says the screen stopped — it never shows a figure, a success or a
 * guess in place of what failed. A money-law violation that throws still
 * stops the screen; it just no longer blanks it.
 *
 * « Recharger » reloads the page on the web (the console and the supplier page
 * ship there). Where there is no page to reload, it mounts the app again.
 */
interface Etat {
  readonly arret: boolean;
}

export class LimiteErreur extends Component<{ readonly children: ReactNode }, Etat> {
  override state: Etat = { arret: false };

  static getDerivedStateFromError(): Etat {
    return { arret: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[boutik] écran arrêté', error, info.componentStack);
  }

  private readonly recharger = (): void => {
    const page = (globalThis as { location?: { reload?: () => void } }).location;
    if (typeof page?.reload === 'function') page.reload();
    else this.setState({ arret: false });
  };

  override render(): ReactNode {
    if (!this.state.arret) return this.props.children;
    return (
      <View testID="limite-erreur" style={{ flex: 1, backgroundColor: P.bg, justifyContent: 'center', paddingHorizontal: GEO.screenPad.side }}>
        <Text style={role({ f: 'BG', w: 700, s: 22, lh: 1.2 }, P.ink)}>{t('limite.titre')}</Text>
        <Text style={[role({ f: 'IS', w: 400, s: 15, lh: 1.55 }, P.inkSoft), { marginTop: 10 }]}>{t('limite.texte')}</Text>
        <View style={{ marginTop: 22 }}>
          <C07BtnPrimary label={t('limite.recharger')} icon="retry" onPress={this.recharger} />
        </View>
      </View>
    );
  }
}

/** The root, inside its boundary — what `index.ts` registers for every page. */
export function avecLimite<P extends object>(Racine: ComponentType<P>): ComponentType<P> {
  const Protegee = (props: P) => createElement(LimiteErreur, null, createElement(Racine, props));
  Protegee.displayName = `AvecLimite(${Racine.displayName ?? Racine.name})`;
  return Protegee;
}
