// NEGATIVE FIXTURE (Batch A · A2 DoD, B+3): supplier branding/contact on the
// package EXTERIOR — the neutral-packaging gate MUST fail on this file. Never
// import this. Every line below MUST hit.

// copy strings — supplier identity instructed onto the exterior:
export const packagingCopy = {
  brandOnColis: 'Écrivez le nom de votre boutique sur le colis', // brand→exterior
  logoOnEmballage: 'Ajoutez votre logo sur l’emballage extérieur', // brand→exterior
  contactOnPaquet: 'Collez vos coordonnées et votre téléphone sur le paquet', // contact→exterior
  enseigneExterior: 'Le colis porte l’enseigne du fournisseur', // exterior→brand
};

// field/identifier forms — supplier identity modelled onto the exterior:
export interface ParcelExteriorLabel {
  colisLogoUrl: string; // compound: colis+logo
  exteriorBrandingText: string; // compound: exterior+brand
  packagingContactPhone: string; // compound: packaging+contact
}
