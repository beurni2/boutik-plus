import type { ReactNode } from 'react';
import { C02StripeTissee } from '../ui/v2/components/C02StripeTissee';
import { C07BtnPrimary } from '../ui/v2/components/C07BtnPrimary';

/**
 * WO-FP-PIXEL Phase 1 — the pixel-harness registry. Each entry renders ONE
 * V2 component with the EXACT content/props of a named Pixel-Source instance
 * (screen + element), at that instance's box. The diff runner clips the same
 * region from the board and compares.
 */
export type HarnessCase = {
  /** the board instance this case is diffed against */
  source: { screen: string; match: string };
  /** the box the source instance occupies (values-table) */
  box: { w: number; h: number };
  render: () => ReactNode;
};

export const HARNESS: Record<string, HarnessCase> = {
  C02: {
    source: { screen: 'S02', match: 'stripe@y54' },
    box: { w: 402, h: 6 },
    render: () => <C02StripeTissee width={402} />,
  },
  C07: {
    source: { screen: 'S02', match: 'Ajouter un produit' },
    box: { w: 362, h: 54 },
    render: () => <C07BtnPrimary label="Ajouter un produit" icon="plus" onPress={() => {}} />,
  },
};
