// NEGATIVE FIXTURE: phone used as the DB key — the phone-alias gate MUST
// fail on this file. Never import this.
export interface SellerRow {
  id: 'phone'; // banned: §5.1 — phone is an alias, never the DB key
}
export const CREATE_TABLE = `
  CREATE TABLE sellers (
    phone TEXT,
    PRIMARY KEY (phone)
  );
`;
