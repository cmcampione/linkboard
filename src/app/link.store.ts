import { effect, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withHooks, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom, filter, map, merge, take } from 'rxjs';

import { LINK_REPOSITORY } from './link.repository';
import type { SavedLink } from './link.repository';

export const LinkStore = signalStore(
  { providedIn: 'root' },
  withState(() => {
    return {
      links: [] as SavedLink[],
      isLoading: true,
      isReady: false,
      persistenceError: null as string | null,
      persistenceRevision: 0,
      persistedRevision: 0,
      failedRevision: 0,
    };
  }),
  withMethods((store) => {
    const persistenceResults = merge(
      toObservable(store.persistedRevision).pipe(map((revision) => ({ revision, succeeded: true }))),
      toObservable(store.failedRevision).pipe(map((revision) => ({ revision, succeeded: false }))),
    );

    const replaceLinks = (links: SavedLink[]): number => {
      if (!store.isReady()) return 0;

      const revision = store.persistenceRevision() + 1;
      patchState(store, { links, persistenceError: null, persistenceRevision: revision });
      return revision;
    };

    return {
      save(name: string, url: string, id?: string, imageDataUrl?: string): number {
        if (!store.isReady()) return 0;

        const savedLink: SavedLink = {
          id: id ?? createLinkId(),
          name,
          url,
          ...(imageDataUrl ? { imageDataUrl } : {}),
        };
        const currentLinks = store.links();
        const nextLinks = id
          ? currentLinks.map((link) => (link.id === id ? savedLink : link))
          : [...currentLinks, savedLink];

        return replaceLinks(nextLinks);
      },
      remove(id: string): number {
        if (!store.isReady()) return 0;

        return replaceLinks(store.links().filter((link) => link.id !== id));
      },
      replaceAll(links: SavedLink[]): number {
        return replaceLinks(links);
      },
      waitForPersistence(revision: number): Promise<boolean> {
        if (revision <= store.persistedRevision()) return Promise.resolve(true);
        if (revision <= store.failedRevision()) return Promise.resolve(false);

        return firstValueFrom(
          persistenceResults.pipe(
            filter((result) => result.revision >= revision),
            map((result) => result.succeeded),
            take(1),
          ),
        );
      },
    };
  }),
  withHooks({
    onInit(store) {
      const repository = inject(LINK_REPOSITORY);
      let isReady = false;
      let lastPersistedLinks: SavedLink[] = [];
      let saveVersion = 0;
      let saveQueue = Promise.resolve();

      void repository
        .load()
        .then((links) => {
          lastPersistedLinks = links;
          isReady = true;
          patchState(store, { links, isLoading: false, isReady: true, persistenceError: null });
        })
        .catch(() => {
          patchState(store, {
            isLoading: false,
            persistenceError: 'Impossibile leggere i link dalla persistenza configurata.',
          });
        });

      effect(() => {
        if (!store.isReady()) return;
        const links = store.links();
        const revision = store.persistenceRevision();
        if (!isReady || links === lastPersistedLinks) return;

        saveVersion = revision;
        saveQueue = saveQueue.then(async () => {
          try {
            await repository.save(links);
            lastPersistedLinks = links;
            patchState(store, { persistedRevision: revision });
            if (revision === saveVersion) patchState(store, { persistenceError: null });
          } catch {
            if (revision === saveVersion) {
              patchState(store, {
                links: lastPersistedLinks,
                failedRevision: revision,
                persistenceError: 'Impossibile salvare i link nella persistenza configurata.',
              });
            }
          }
        });
      });
    },
  }),
);

function createLinkId(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('Questo dispositivo non permette di creare un identificativo sicuro per il link.');
  }

  return globalThis.crypto.randomUUID();
}
