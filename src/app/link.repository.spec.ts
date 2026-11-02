import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LINKS_API_URL, RestLinkRepository } from './link.repository';

describe('RestLinkRepository', () => {
  let repository: RestLinkRepository;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: LINKS_API_URL, useValue: '/mock/links' }],
    });
    repository = TestBed.inject(RestLinkRepository);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('loads links with GET and validates the server response', async () => {
    const result = repository.load();
    const request = httpTesting.expectOne('/mock/links');

    expect(request.request.method).toBe('GET');
    request.flush([{ id: 'api', name: 'API', url: 'https://api.example.com' }]);

    await expect(result).resolves.toEqual([{ id: 'api', name: 'API', url: 'https://api.example.com' }]);
  });

  it('rejects invalid data returned by the server', async () => {
    const result = repository.load();
    httpTesting.expectOne('/mock/links').flush([{ id: 'invalid' }]);

    await expect(result).rejects.toThrow('Il server ha restituito un elenco di link non valido.');
  });

  it('replaces the server collection with PUT', async () => {
    const links = [{ id: 'api', name: 'API', url: 'https://api.example.com' }];
    const result = repository.save(links);
    const request = httpTesting.expectOne('/mock/links');

    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(links);
    request.flush(null);

    await expect(result).resolves.toBeUndefined();
  });
});
