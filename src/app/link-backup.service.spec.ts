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

  it('exports versioned links without local images', () => {
    const revision = linkStore.save('API', 'https://api.example.com', undefined, 'data:image/jpeg;base64,photo');
    TestBed.flushEffects();

    return linkStore.waitForPersistence(revision).then(() => {
      const backup = JSON.parse(backupService.serializeBackup());

      expect(backup).toMatchObject({
        format: 'linkboard-backup',
        version: 1,
        links: [{ id: linkStore.links()[0].id, name: 'API', url: 'https://api.example.com' }],
      });
      expect(backup.links[0]).not.toHaveProperty('imageDataUrl');
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
    expect(() => backupService.parseBackup(' '.repeat(1024 * 1024 + 1))).toThrow('1 MB');
  });

  it('merges by ID, preserves local images, and ignores images in the imported file', async () => {
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
        imageDataUrl: 'data:image/jpeg;base64,local',
      },
      { id: 'local-only', name: 'Local', url: 'https://local.example' },
      { id: 'new', name: 'New', url: 'https://new.example' },
    ]);
  });

  it('replaces links and removes all local images', async () => {
    const revision = linkStore.save('Old', 'https://old.example', undefined, 'data:image/jpeg;base64,local');
    TestBed.flushEffects();
    await linkStore.waitForPersistence(revision);

    const imported = backupService.parseBackup(backupJson([{ id: 'new', name: 'New', url: 'https://new.example' }]));
    await backupService.importBackup(imported, 'replace');

    expect(linkStore.links()).toEqual([{ id: 'new', name: 'New', url: 'https://new.example' }]);
  });

  it('keeps state unchanged if repository persistence fails', async () => {
    const initialLinks = [{ id: 'local', name: 'Local', url: 'https://local.example' }];
    const revision = linkStore.save(initialLinks[0].name, initialLinks[0].url, initialLinks[0].id);
    TestBed.flushEffects();
    await linkStore.waitForPersistence(revision);
    const imported = backupService.parseBackup(backupJson([{ id: 'new', name: 'New', url: 'https://new.example' }]));

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    await expect(backupService.importBackup(imported, 'replace')).rejects.toThrow('Impossibile salvare');

    expect(linkStore.links()).toEqual(initialLinks);
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
