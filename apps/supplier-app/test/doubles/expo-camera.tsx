import React, { forwardRef, useImperativeHandle } from 'react';

/**
 * ═══ RENDU-RÉEL — expo-camera, doubled so the Studio can MOUNT ═══
 *
 * LISTER-VRAI-1 (AUDIT-B+2 F-47) is the first walk to open the real Studio
 * from the real wizard and come back. `src/v2/studio-shoot.tsx` imports
 * `CameraView` and `useCameraPermissions` eagerly, and the real module reaches
 * the Metro-only Expo runtime at import — so without this nothing that routes
 * to the Studio could be mounted in node.
 *
 * vitest resolves the PHONE studio (`studio-shoot.tsx`); the console ships the
 * WEB one (`studio-shoot.web.tsx`), which never imports this module. The two
 * share every prop and the one pick funnel in `studio-real.tsx`; the web
 * screen's own controls are walked by mounting that file directly.
 *
 * ═══ BOUNDS (§9.8) ═══
 *
 * · THERE IS NO CAMERA. `CameraView` renders one empty host element and makes
 *   no pixels; its `takePictureAsync` THROWS. A walk that presses « Prendre la
 *   photo » meets a failure, never an invented photograph.
 * · THE PERMISSION IS THE OS'S ANSWER, AND THE WALK SAYS WHAT IT IS.
 *   Unarmed, the hook answers `null` — « not asked yet » — which is what a
 *   phone answers on first open, and the Studio shows its « Autoriser » gate.
 *   `armerPermissionCamera` sets the answer; asking again returns it, and
 *   never grants on its own.
 * · APPEARANCE: nothing. The viewfinder is the OS's; nothing here draws it.
 */

export interface ReponsePermission {
  readonly granted: boolean;
  readonly canAskAgain: boolean;
  readonly status: 'granted' | 'denied' | 'undetermined';
}

let reponse: ReponsePermission | null = null;

export function armerPermissionCamera(r: ReponsePermission | null): void {
  reponse = r;
}

export function useCameraPermissions(): readonly [ReponsePermission | null, () => Promise<ReponsePermission | null>] {
  return [reponse, async () => reponse];
}

export const CameraView = forwardRef<{ takePictureAsync: () => Promise<never> }, Record<string, unknown>>(
  function CameraView(_props, ref) {
    useImperativeHandle(ref, () => ({
      takePictureAsync: async () => {
        throw new Error('expo-camera double: there is no camera under vitest — a walk may not invent a photograph.');
      },
    }));
    return React.createElement('CameraView');
  },
);
