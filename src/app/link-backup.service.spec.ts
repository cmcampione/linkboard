import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LinkBackupService } from './link-backup.service';
import { LinkStore } from './link.store';

describe('LinkBackupService', () => {
  let backupService: LinkBackupService;
  let linkStore: InstanceType<typeof LinkStore>;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    localStorage.clear();
    backupService = TestBed.inject(LinkBackupService);
    linkStore = TestBed.inject(LinkStore);
    await waitUntilReady();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('exports versioned links including local images', () => {
    const revision = linkStore.save('API', 'https://api.example.com', undefined, 'data:image/jpeg;base64,photo');
    TestBed.flushEffects();

    return linkStore.waitForPersistence(revision).then(() => {
      const backup = JSON.parse(backupService.serializeBackup());

      expect(backup).toMatchObject({
        format: 'linkboard-backup',
        version: 1,
        links: [
          {
            id: linkStore.links()[0].id,
            name: 'API',
            url: 'https://api.example.com',
            imageDataUrl: 'data:image/jpeg;base64,photo',
          },
        ],
      });
      expect(backup.links[0]).toHaveProperty('imageDataUrl');
    });
  });

  it('rejects invalid JSON, duplicate IDs, and oversized backup files', () => {
    expect(() => backupService.parseBackup('{')).toThrow('JSON valido');
    expect(() =>
      backupService.parseBackup(
        backupJson([
          { id: 'same', name: 'First', url: 'https://first.example' },
          { id: 'same', name: 'Second', url: 'https://second.example' },
        ]),
      ),
    ).toThrow('duplicato');
    expect(() => backupService.parseBackup(' '.repeat(10 * 1024 * 1024 + 1))).toThrow('10 MB');
  });

  it('merges by ID and keeps imported images when present', async () => {
    localStorage.setItem(
      'linkboard.links',
      JSON.stringify([
        {
          id: 'existing',
          name: 'Old name',
          url: 'https://old.example',
          imageDataUrl: 'data:image/jpeg;base64,local',
        },
        { id: 'local-only', name: 'Local', url: 'https://local.example' },
      ]),
    );
    TestBed.resetTestingModule();
    backupService = TestBed.inject(LinkBackupService);
    linkStore = TestBed.inject(LinkStore);
    await waitUntilReady();

    const imported = backupService.parseBackup(
      backupJson([
        {
          id: 'existing',
          name: 'Updated',
          url: 'https://updated.example',
          imageDataUrl: 'data:image/jpeg;base64,imported',
        },
        { id: 'new', name: 'New', url: 'https://new.example' },
      ]),
    );
    await backupService.importBackup(imported, 'merge');

    expect(linkStore.links()).toEqual([
      {
        id: 'existing',
        name: 'Updated',
        url: 'https://updated.example',
        imageDataUrl: 'data:image/jpeg;base64,imported',
      },
      { id: 'local-only', name: 'Local', url: 'https://local.example' },
      { id: 'new', name: 'New', url: 'https://new.example' },
    ]);
  });

  it('replaces links and applies imported images when present', async () => {
    const revision = linkStore.save('Old', 'https://old.example', undefined, 'data:image/jpeg;base64,local');
    TestBed.flushEffects();
    await linkStore.waitForPersistence(revision);

    const imported = backupService.parseBackup(
      backupJson([
        {
          id: 'new',
          name: 'New',
          url: 'https://new.example',
          imageDataUrl: 'data:image/jpeg;base64,imported',
        },
      ]),
    );
    await backupService.importBackup(imported, 'replace');

    expect(linkStore.links()).toEqual([
      { id: 'new', name: 'New', url: 'https://new.example', imageDataUrl: 'data:image/jpeg;base64,imported' },
    ]);
  });

  it('rejects the import if repository persistence fails', async () => {
    const revision = linkStore.save('Local', 'https://local.example', 'local');
    TestBed.flushEffects();
    await linkStore.waitForPersistence(revision);

    const imported = backupService.parseBackup(backupJson([{ id: 'new', name: 'New', url: 'https://new.example' }]));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });

    await expect(backupService.importBackup(imported, 'replace')).rejects.toThrow('Impossibile salvare');
  });

  async function waitUntilReady(): Promise<void> {
    await vi.waitFor(() => expect(linkStore.isReady()).toBe(true));
  }
});

function backupJson(links: object[]): string {
  return JSON.stringify({
    format: 'linkboard-backup',
    version: 1,
    exportedAt: '2026-11-02T00:00:00.000Z',
    links,
  });
}
