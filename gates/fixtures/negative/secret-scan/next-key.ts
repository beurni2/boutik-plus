// NEGATIVE FIXTURE (secret-scan) — a quoted literal handed to the NEXT name of
// a credential (batch 8: a key change sets X_NEXT beside X). Not a real key.
// The gate must refuse this file alone.
export const env = { FULFILLMENT_OPS_SECRET_NEXT: 'Wz5Kc8Pq2Jn7Ty4Gb6Fd' };
