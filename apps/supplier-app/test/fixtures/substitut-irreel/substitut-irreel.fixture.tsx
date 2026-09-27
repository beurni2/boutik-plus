import { expect, it } from 'vitest';
import { wire } from '../../rendu';

// Every assertion below PASSES; the walk must still fail, on the stand-in alone.
it('a walk whose Shop+ copy names a rung the real door never names', async () => {
  process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'] = 'http://shop.test';
  wire([(path) => (path === '/checkout/dispatch/ord-1/refusal' ? { status: 200, json: { ok: true, record: {}, rung: 'standard', escalated: false } } : null)]);
  const res = await globalThis.fetch('http://shop.test/checkout/dispatch/ord-1/refusal', { method: 'POST', body: '{"reason":"change_of_mind"}' });
  expect(res.status).toBe(200);
});
