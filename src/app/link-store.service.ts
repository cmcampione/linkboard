import { Injectable, signal } from '@angular/core';

export interface SavedLink {
  id: string;
  name: string;
  url: string;
  imageDataUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class LinkStore {
  private readonly storageKey = 'linkboard.links';
  private readonly state = signal(this.load());

  readonly links = this.state.asReadonly();

  save(name: string, url: string, id?: string, imageDataUrl?: string): boolean {
    const savedLink: SavedLink = {
      id: id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      url,
      ...(imageDataUrl ? { imageDataUrl } : {}),
    };
    const currentLinks = this.state();
    const nextLinks = id
      ? currentLinks.map((link) => (link.id === id ? savedLink : link))
      : [...currentLinks, savedLink];

    return this.persist(nextLinks);
  }

  remove(id: string): boolean {
    return this.persist(this.state().filter((link) => link.id !== id));
  }

  private load(): SavedLink[] {
    try {
      const savedLinks = localStorage.getItem(this.storageKey);
      const parsedLinks: unknown = savedLinks ? JSON.parse(savedLinks) : [];
      return Array.isArray(parsedLinks) ? parsedLinks.filter(this.isSavedLink) : [];
    } catch {
      return [];
    }
  }

  private isSavedLink(value: unknown): value is SavedLink {
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

  private persist(links: SavedLink[]): boolean {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(links));
      this.state.set(links);
      return true;
    } catch {
      return false;
    }
  }
}
