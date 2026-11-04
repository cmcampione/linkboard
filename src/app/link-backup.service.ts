import { Injectable, inject } from '@angular/core';

import type { SavedLink } from './link.repository';
import { LinkStore } from './link.store';

export const MAX_BACKUP_SIZE_BYTES = 10 * 1024 * 1024;
const backupFormat = 'linkboard-backup';
const backupVersion = 1;

export interface LinkBackupEntry {
  id: string;
  name: string;
  url: string;
  imageDataUrl?: string;
}

export interface LinkBackup {
  format: typeof backupFormat;
  version: typeof backupVersion;
  exportedAt: string;
  links: LinkBackupEntry[];
}

export type BackupImportMode = 'merge' | 'replace';

@Injectable({ providedIn: 'root' })
export class LinkBackupService {
  private readonly linkStore = inject(LinkStore);

  createBackup(): LinkBackup {
    return {
      format: backupFormat,
      version: backupVersion,
      exportedAt: new Date().toISOString(),
      links: this.linkStore.links().map(({ id, name, url, imageDataUrl }) => ({
        id,
        name,
        url,
        ...(imageDataUrl ? { imageDataUrl } : {}),
      })),
    };
  }

  serializeBackup(): string {
    const json = JSON.stringify(this.createBackup(), null, 2);
    if (new TextEncoder().encode(json).byteLength > MAX_BACKUP_SIZE_BYTES) {
      throw new Error(`Il file di backup supera il limite di ${describeBackupLimit()}.`);
    }
    return json;
  }

  parseBackup(json: string): LinkBackup {
    if (new TextEncoder().encode(json).byteLength > MAX_BACKUP_SIZE_BYTES) {
      throw new Error(`Il file di backup supera il limite di ${describeBackupLimit()}.`);
    }

    let value: unknown;
    try {
      value = JSON.parse(json);
    } catch {
      throw new Error('Il file selezionato non contiene JSON valido.');
    }

    if (!isRecord(value) || value['format'] !== backupFormat || value['version'] !== backupVersion) {
      throw new Error('Formato o versione del backup non supportati.');
    }
    if (typeof value['exportedAt'] !== 'string' || !Number.isFinite(Date.parse(value['exportedAt']))) {
      throw new Error('La data di esportazione del backup non è valida.');
    }
    if (!Array.isArray(value['links'])) throw new Error('Il backup non contiene un elenco di link valido.');

    const ids = new Set<string>();
    const links = value['links'].map((entry, index): LinkBackupEntry => {
      if (!isRecord(entry)) throw new Error(`Il link ${index + 1} non è valido.`);

      const id = entry['id'];
      const name = entry['name'];
      const url = entry['url'];
      const imageDataUrl = entry['imageDataUrl'];

      if (
        typeof id !== 'string' ||
        !id.trim() ||
        typeof name !== 'string' ||
        !name.trim() ||
        typeof url !== 'string' ||
        !isHttpUrl(url)
      ) {
        throw new Error(`Il link ${index + 1} deve avere ID, nome e URL HTTP(S) validi.`);
      }
      if (imageDataUrl !== undefined && (typeof imageDataUrl !== 'string' || !isValidImageDataUrl(imageDataUrl))) {
        throw new Error(`Il link ${index + 1} contiene un'immagine di backup non valida.`);
      }
      if (ids.has(id)) throw new Error(`L’ID "${id}" è duplicato nel backup.`);

      ids.add(id);
      return {
        id,
        name,
        url,
        ...(imageDataUrl ? { imageDataUrl } : {}),
      };
    });

    return {
      format: backupFormat,
      version: backupVersion,
      exportedAt: value['exportedAt'],
      links,
    };
  }

  async importBackup(backup: LinkBackup, mode: BackupImportMode): Promise<void> {
    if (!this.linkStore.isReady()) throw new Error('La raccolta dei link non è ancora pronta.');

    const currentLinks = this.linkStore.links();
    const nextLinks = mode === 'replace' ? backup.links.map(toSavedLink) : mergeLinks(currentLinks, backup.links);
    const revision = this.linkStore.replaceAll(nextLinks);
    if (!revision) {
      throw new Error('Impossibile salvare il backup nella persistenza configurata.');
    }
    if (!(await this.linkStore.waitForPersistence(revision))) {
      this.linkStore.replaceAll(currentLinks);
      throw new Error('Impossibile salvare il backup nella persistenza configurata.');
    }
  }
}

function mergeLinks(currentLinks: SavedLink[], importedLinks: LinkBackupEntry[]): SavedLink[] {
  const linksById = new Map(currentLinks.map((link) => [link.id, link]));

  for (const importedLink of importedLinks) {
    const existing = linksById.get(importedLink.id);
    const nextLink: SavedLink = importedLink.imageDataUrl
      ? { ...importedLink, imageDataUrl: importedLink.imageDataUrl }
      : { ...importedLink, ...(existing?.imageDataUrl ? { imageDataUrl: existing.imageDataUrl } : {}) };
    linksById.set(importedLink.id, nextLink);
  }

  return [...linksById.values()];
}

function toSavedLink(link: LinkBackupEntry): SavedLink {
  return {
    id: link.id,
    name: link.name,
    url: link.url,
    ...(link.imageDataUrl ? { imageDataUrl: link.imageDataUrl } : {}),
  };
}

function isHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isValidImageDataUrl(value: string): boolean {
  if (!value.startsWith('data:image/jpeg;base64,')) return false;

  const payload = value.slice('data:image/jpeg;base64,'.length);
  if (!payload) return false;

  try {
    return typeof atob(payload) === 'string' && payload.length > 0;
  } catch {
    return false;
  }
}

function describeBackupLimit(): string {
  return `${MAX_BACKUP_SIZE_BYTES / (1024 * 1024)} MB`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
