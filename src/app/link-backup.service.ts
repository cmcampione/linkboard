import { Injectable, inject } from '@angular/core';

import type { SavedLink } from './link.repository';
import { LinkStore } from './link.store';

export const MAX_BACKUP_SIZE_BYTES = 1024 * 1024;
const backupFormat = 'linkboard-backup';
const backupVersion = 1;

export interface LinkBackupEntry {
  id: string;
  name: string;
  url: string;
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
      links: this.linkStore.links().map(({ id, name, url }) => ({ id, name, url })),
    };
  }

  serializeBackup(): string {
    return JSON.stringify(this.createBackup(), null, 2);
  }

  parseBackup(json: string): LinkBackup {
    if (new TextEncoder().encode(json).byteLength > MAX_BACKUP_SIZE_BYTES) {
      throw new Error('Il file di backup supera il limite di 1 MB.');
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
      const { id, name, url } = entry;
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
      if (ids.has(id)) throw new Error(`L’ID "${id}" è duplicato nel backup.`);

      ids.add(id);
      return { id, name, url };
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
    if (!revision || !(await this.linkStore.waitForPersistence(revision))) {
      throw new Error('Impossibile salvare il backup nella persistenza configurata.');
    }
  }
}

function mergeLinks(currentLinks: SavedLink[], importedLinks: LinkBackupEntry[]): SavedLink[] {
  const linksById = new Map(currentLinks.map((link) => [link.id, link]));

  for (const importedLink of importedLinks) {
    const existing = linksById.get(importedLink.id);
    linksById.set(importedLink.id, {
      ...importedLink,
      ...(existing?.imageDataUrl ? { imageDataUrl: existing.imageDataUrl } : {}),
    });
  }

  return [...linksById.values()];
}

function toSavedLink(link: LinkBackupEntry): SavedLink {
  return { id: link.id, name: link.name, url: link.url };
}

function isHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
