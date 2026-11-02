import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

export interface SavedLink {
  id: string;
  name: string;
  url: string;
  imageDataUrl?: string;
}

const storageKey = 'linkboard.links';

export const LinkStore = signalStore(
  { providedIn: 'root' },
  withState(() => ({ links: loadLinks() })),
  withMethods((store) => {
    const persist = (links: SavedLink[]): boolean => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(links));
        patchState(store, { links });
        return true;
      } catch {
        return false;
      }
    };

    return {
      save(name: string, url: string, id?: string, imageDataUrl?: string): boolean {
        const savedLink: SavedLink = {
          id: id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name,
          url,
          ...(imageDataUrl ? { imageDataUrl } : {}),
        };
        const currentLinks = store.links();
        const nextLinks = id
          ? currentLinks.map((link) => (link.id === id ? savedLink : link))
          : [...currentLinks, savedLink];

        return persist(nextLinks);
      },
      remove(id: string): boolean {
        return persist(store.links().filter((link) => link.id !== id));
      },
    };
  }),
);

function loadLinks(): SavedLink[] {
  try {
    const savedLinks = localStorage.getItem(storageKey);
    const parsedLinks: unknown = savedLinks ? JSON.parse(savedLinks) : [];
    return Array.isArray(parsedLinks) ? parsedLinks.filter(isSavedLink) : [];
  } catch {
    return [];
  }
}

function isSavedLink(value: unknown): value is SavedLink {
  if (typeof value !== 'object' || value === null) return false;

  const link = value as Record<string, unknown>;
  if (typeof link['id'] !== 'string' || typeof link['name'] !== 'string' || typeof link['url'] !== 'string') {
    return false;
  }
  if (link['imageDataUrl'] !== undefined && typeof link['imageDataUrl'] !== 'string') return false;

  try {
    return ['http:', 'https:'].includes(new URL(link['url']).protocol);
  } catch {
    return false;
  }
}
