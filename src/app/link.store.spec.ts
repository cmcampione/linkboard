import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

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

  it('loads persisted links when the store is created', () => {
    const savedLinks = [{ id: 'api', name: 'API', url: 'https://api.example.com' }];
    localStorage.setItem('linkboard.links', JSON.stringify(savedLinks));

    const store = TestBed.inject(LinkStore);

    expect(store.links()).toEqual(savedLinks);
  });

  it('does not update state when persistence fails', () => {
    const store = TestBed.inject(LinkStore);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });

    expect(store.save('API', 'https://api.example.com')).toBe(false);
    expect(store.links()).toEqual([]);
  });
});
