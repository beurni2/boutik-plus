import { Miniflare } from 'miniflare';
const mf = new Miniflare({
  modules: true, scriptPath: 'dist/worker/w4-rig.mjs',
  r2Buckets: { BUCKET: 'rig-media' },
  bindings: { MEDIA_WRITE_SECRET: 'test-media-write-secret' },
  port: 8800,
});
await mf.ready;
console.log('MEDIA READY');
