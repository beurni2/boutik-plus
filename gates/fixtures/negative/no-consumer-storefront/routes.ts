// NEGATIVE FIXTURE: consumer storefront/checkout routes in Boutik+ — the
// no-consumer-storefront gate MUST fail on this file. Never import this.
export const routes = [
  { path: '/storefront/:slug', handler: 'renderStorefront' },
  { path: '/checkout', handler: 'startCheckout' },
  { path: '/cart/add', handler: 'addToCart' },
];
