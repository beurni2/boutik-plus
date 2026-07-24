import { CORRELATION_HEADER, correlationIdFrom, createLogger, type LogSink } from './logger.js';
import { provenance } from './provenance.js';

/**
 * Shared /health handler for the B0.1 Workers service stubs — folders,
 * types, health endpoints; no features. The hello-world request carries the
 * correlation id end-to-end: inbound header → structured log → response
 * header (Contract E0 exit).
 *
 * SERVICE-PROVENANCE-1: /health also answers WHICH BUILD is running (`release`,
 * the git sha) and WHICH WIRE SHAPE it speaks (`canon`, the pinned contracts
 * version) — see `provenance.ts` for why the second field is the one that catches
 * deploy-time version drift. Only the 200 carries them; the 404 stays as it was.
 */
export function makeHealthFetch(service: string, sink?: LogSink) {
  return (request: Request): Response => {
    const correlationId = correlationIdFrom(request);
    const logger = sink
      ? createLogger({ service, correlationId, sink })
      : createLogger({ service, correlationId });
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      logger.info('health check', { path: url.pathname });
      return Response.json(
        { service, status: 'ok', ...provenance() },
        { headers: { [CORRELATION_HEADER]: correlationId } },
      );
    }
    logger.warn('route not found', { path: url.pathname });
    return Response.json(
      { service, status: 'not_found' },
      { status: 404, headers: { [CORRELATION_HEADER]: correlationId } },
    );
  };
}
