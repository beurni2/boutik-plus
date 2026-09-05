import { File, Paths } from 'expo-file-system';
import type { QueueStore } from './queue';

/**
 * WO-6.5 · B2.1 — the PRODUCTION QueueStore: Expo's own durable document store
 * (SDK 57, expo-file-system 57 — the File/Paths API unchanged since 19). Forcing evidence, quoted from the installed
 * package's types (node_modules/expo-file-system/build/…; EXPO-57-2 re-attributed
 * the files — at 57 `Paths` lives in Paths.d.ts and `File`'s members on
 * NativeFileSystemFile in internal/NativeFileSystem.types.d.ts):
 *
 *   Paths.d.ts        class Paths { static get document(): Directory }
 *                     // "the document directory – a place to store files that
 *                     //  are safe from being deleted by the system."
 *   internal/NativeFileSystem.types.d.ts
 *                     class File {
 *                       constructor(...uris: (string | File | Directory)[]);
 *                       text(): Promise<string>;
 *                       write(content: string | Uint8Array, options?): void;
 *                       create(options?): void;
 *                       exists: boolean;
 *                     }
 *
 * The document directory survives app-kill and reboot (unlike the cache dir),
 * so a single JSON blob there IS the durable queue. This file is imported ONLY
 * by the app; the pure queue (queue.ts) and its survival test never touch
 * native — they run the identical logic over an on-disk store.
 */
export function expoDocumentStore(fileName = 'offline-queue.v1.json'): QueueStore {
  const file = new File(Paths.document, fileName);
  return {
    async read(): Promise<string | null> {
      return file.exists ? file.text() : null;
    },
    async write(data: string): Promise<void> {
      if (!file.exists) file.create();
      file.write(data);
    },
  };
}
