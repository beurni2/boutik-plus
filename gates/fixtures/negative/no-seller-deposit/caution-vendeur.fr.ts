// FIXTURE NÉGATIVE (AUDIT-B+1 F23) — LE TERME FRANÇAIS INAPPLICABLE.
//
// La gate portait « caution » depuis le premier jour, ancré en /\bcaution\b/i —
// ce qui est FAUX pour toutes les formes qu'un champ prendrait réellement :
// cautionFcfa, caution_fcfa, sellerCaution, cautionAmount. Un vrai
// `terms: { cautionFcfa: 5000 }` passait la gate, tandis que son équivalent
// anglais était correctement attrapé.
//
// LA PROSE DE CE FICHIER EST EN FRANÇAIS, ET CE N'EST PAS DU STYLE. Un seul
// terme anglais de la gate dans un commentaire ici, et le fichier échouerait
// pour la mauvaise raison : supprimez les motifs français, il échouerait quand
// même, et la fixture ne prouverait plus rien. Testé par mutation.
//
// Loi 4 / B+I-12 : aucune somme n'est jamais demandée à un vendeur pour vendre.
// Aucun champ, aucun flux, aucune exception. La gate de cette fixture DOIT
// échouer sur ce fichier, et uniquement sur ses motifs français.
// Ne jamais importer ceci.
export interface ConditionsVendeur {
  vendeurId: string;
  cautionFcfa: number; // interdit : la forme exacte que le motif ancré ratait
  caution_vendeur_fcfa: number; // interdit : snake_case
  GARANTIE_VENDEUR_FCFA: number; // interdit : SCREAMING_SNAKE
  acompte: number; // interdit
  arrhes: number; // interdit
}
export function exigerCaution(c: ConditionsVendeur, montant: number): void {
  // interdit : on ne demande jamais à un vendeur d'avancer de l'argent
  c.cautionFcfa = montant;
}
export const fraisDInscription = 2000; // interdit
export const nantissement = true; // interdit
export const gage = true; // interdit
