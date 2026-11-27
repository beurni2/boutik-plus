import { WorkerEntrypoint } from 'cloudflare:workers';
import { handleAudioRead, type MediaWorkerEnv } from './index.js';

/**
 * AUDIO-READ — the buyer's voice note, reachable only through a service
 * binding (`entrypoint = "AudioRead"`). Its own file because Node cannot load
 * `cloudflare:workers`: the unit suites import `index.ts`, never this.
 */
export class AudioRead extends WorkerEntrypoint<MediaWorkerEnv> {
  override async fetch(request: Request): Promise<Response> {
    return handleAudioRead(request, this.env);
  }
}
