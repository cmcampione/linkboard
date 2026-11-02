import { HttpClient } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface SavedLink {
  id: string;
  name: string;
  url: string;
  imageDataUrl?: string;
}

export interface LinkRepository {
  load(): Promise<SavedLink[]>;
  save(links: SavedLink[]): Promise<void>;
}

const storageKey = 'linkboard.links';

@Injectable({ providedIn: 'root' })
export class LocalStorageLinkRepository implements LinkRepository {
  async load(): Promise<SavedLink[]> {
    const savedLinks = localStorage.getItem(storageKey);
    const parsedLinks: unknown = savedLinks ? JSON.parse(savedLinks) : [];
    return Array.isArray(parsedLinks) ? parsedLinks.filter(isSavedLink) : [];
  }

  async save(links: SavedLink[]): Promise<void> {
    localStorage.setItem(storageKey, JSON.stringify(links));
  }
}

export const LINKS_API_URL = new InjectionToken<string>('LINKS_API_URL', {
  providedIn: 'root',
  factory: () => '/api/links',
});

@Injectable({ providedIn: 'root' })
export class RestLinkRepository implements LinkRepository {
  private readonly http = inject(HttpClient);
  private readonly endpoint = inject(LINKS_API_URL);

  async load(): Promise<SavedLink[]> {
    const response: unknown = await firstValueFrom(this.http.get<unknown>(this.endpoint));
    if (!Array.isArray(response) || !response.every(isSavedLink)) {
      throw new Error('Il server ha restituito un elenco di link non valido.');
    }

    return response;
  }

  async save(links: SavedLink[]): Promise<void> {
    await firstValueFrom(this.http.put<void>(this.endpoint, links));
  }
}

export const LINK_REPOSITORY = new InjectionToken<LinkRepository>('LINK_REPOSITORY', {
  providedIn: 'root',
  factory: () => inject(LocalStorageLinkRepository),
});

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
