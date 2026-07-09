#!/usr/bin/env node
import { runScanGate } from './scan.mjs';

/**
 * CI gate: phone-alias (§5.1 kernel: "phone is an alias, never the DB key").
 * A scanner cannot prove every id is opaque; it CAN refuse the recognizable
 * sins — a phone used as an entity id/key, a phone primary key in SQL, or a
 * phone-to-key cast. Entity identity comes from @platform/kernel-types
 * (UserId etc.); the alias is verified, unique, replaceable.
 */
runScanGate({
  gateName: 'phone-alias',
  invariant: '§5.1 phone is an alias, never the DB key',
  patterns: [
    { name: 'id-typed-as-phone', regex: /\b(id|key)\??\s*[:=]\s*(['"`]?)phone/i },
    { name: 'sql-phone-primary-key', regex: /primary\s*key\s*\(\s*['"`]?phone/i },
    { name: 'phone-cast-to-key', regex: /phone(number|alias)?\s+as\s+\w*(id|key)\b/i },
    { name: 'phonePrimaryKey', regex: /phone[_-]?(primary[_-]?)?key/i },
    { name: 'byPhone-index-as-identity', regex: /\bunique[_-]?phone[_-]?id\b/i },
  ],
});
