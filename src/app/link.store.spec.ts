import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { LINK_REPOSITORY, type LinkRepository } from './link.repository';
import { LinkStore } from './link.store';

describe('LinkStore', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('loads persisted links when the store is created', async () => {
    const savedLinks = [{ id: 'api', name: 'API', url: 'https://api.example.com' }];
    localStorage.setItem('linkboard.links', JSON.stringify(savedLinks));

    const store = TestBed.inject(LinkStore);
    await waitUntilReady(store);

    expect(store.links()).toEqual(savedLinks);
  });

  it('persists state changes through the repository effect', async () => {
    const store = TestBed.inject(LinkStore);
    await waitUntilReady(store);

    const revision = store.save('API', 'https://api.example.com');
    TestBed.flushEffects();
    await vi.waitFor(() => expect(JSON.parse(localStorage.getItem('linkboard.links') ?? '[]')).toEqual(store.links()));

    await expect(store.waitForPersistence(revision)).resolves.toBe(true);
    expect(store.links()).toHaveLength(1);
    expect(store.persistenceError()).toBeNull();
  });

  it('swaps links and persists their new order', async () => {
    const store = TestBed.inject(LinkStore);
    await waitUntilReady(store);
    const revision = store.replaceAll([
      { id: 'first', name: 'First', url: 'https://first.example' },
      { id: 'second', name: 'Second', url: 'https://second.example' },
      { id: 'third', name: 'Third', url: 'https://third.example' },
    ]);
    TestBed.flushEffects();
    await store.waitForPersistence(revision);

    const reorderRevision = store.swap('third', 'first');
    TestBed.flushEffects();
    await store.waitForPersistence(reorderRevision);

    expect(store.links().map((link) => link.id)).toEqual(['third', 'second', 'first']);
    expect(JSON.parse(localStorage.getItem('linkboard.links') ?? '[]').map((link: { id: string }) => link.id)).toEqual([
      'third',
      'second',
      'first',
    ]);
  });

  it('keeps the previous state and exposes an error when persistence fails', async () => {
    const store = TestBed.inject(LinkStore);
    await waitUntilReady(store);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });

    const revision = store.save('API', 'https://api.example.com');
    TestBed.flushEffects();
    await vi.waitFor(() =>
      expect(store.persistenceError()).toBe('Impossibile salvare i link nella persistenza configurata.'),
    );

    await expect(store.waitForPersistence(revision)).resolves.toBe(false);
    expect(store.links()).toEqual([]);
  });

  it('can use an injected repository implementation', async () => {
    const repository: LinkRepository = {
      load: async () => [],
      save: vi.fn(async () => {}),
    };
    TestBed.configureTestingModule({ providers: [{ provide: LINK_REPOSITORY, useValue: repository }] });
    const store = TestBed.inject(LinkStore);
    await waitUntilReady(store);

    store.save('API', 'https://api.example.com');
    TestBed.flushEffects();
    await vi.waitFor(() => expect(repository.save).toHaveBeenCalledWith(store.links()));

    expect(repository.save).toHaveBeenCalledWith(store.links());
  });

  it('reports a load failure and keeps editing unavailable', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: LINK_REPOSITORY,
          useValue: {
            load: async () => {
              throw new Error('Server unavailable');
            },
            save: async () => {},
          } satisfies LinkRepository,
        },
      ],
    });
    const store = TestBed.inject(LinkStore);
    await vi.waitFor(() =>
      expect(store.persistenceError()).toBe('Impossibile leggere i link dalla persistenza configurata.'),
    );

    expect(store.isReady()).toBe(false);
    store.save('API', 'https://api.example.com');
    expect(store.links()).toEqual([]);
  });
});

async function waitUntilReady(store: InstanceType<typeof LinkStore>): Promise<void> {
  await vi.waitFor(() => expect(store.isReady()).toBe(true));
}
