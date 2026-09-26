// POSITIVE FIXTURE (secret-scan) — code that passes a secret around by
// variable, and a test placeholder. The gate must pass this file.
declare const OPS_VALUE: string;
export const env = { FULFILLMENT_OPS_SECRET: OPS_VALUE, OFFER_WRITE_SECRET: 'test-offer-write' };
export const prose = 'FULFILLMENT_OPS_SECRET: `GET /fulfillment/orders` is the founder-only read';
