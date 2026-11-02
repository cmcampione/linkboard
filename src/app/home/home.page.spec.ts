import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { LinkStore } from '../link.store';

import { HomePage } from './home.page';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    localStorage.clear();
    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    httpTesting = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    await vi.waitFor(() => expect(TestBed.inject(LinkStore).isReady()).toBe(true));
  });

  afterEach(() => {
    httpTesting.verify();
    TestBed.resetTestingModule();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('filters links by name and hostname', () => {
    TestBed.inject(LinkStore).save('Documentazione', 'https://example.com');
    component.searchTerm = 'example';

    expect(component.filteredLinks).toHaveLength(1);
    component.searchTerm = 'nessun risultato';
    expect(component.filteredLinks).toHaveLength(0);
  });

  it('persists an image with its configured link', async () => {
    const imageDataUrl = 'data:image/jpeg;base64,cGhvdG8=';
    const linkStore = TestBed.inject(LinkStore);

    linkStore.save('API', 'https://api.example.com/status', undefined, imageDataUrl);
    TestBed.flushEffects();
    await vi.waitFor(() =>
      expect(JSON.parse(localStorage.getItem('linkboard.links') ?? '[]')[0].imageDataUrl).toBe(imageDataUrl),
    );

    expect(linkStore.links()[0].imageDataUrl).toBe(imageDataUrl);
  });

  it('sends a GET request and marks a 2xx response as successful', async () => {
    const link = { id: 'api', name: 'API', url: 'https://api.example.com/status' };
    const request = component.callLink(link);
    const httpRequest = httpTesting.expectOne(link.url);

    expect(httpRequest.request.method).toBe('GET');
    httpRequest.flush('ok', { status: 200, statusText: 'OK' });
    await request;

    expect(component.requestState(link.id)?.status).toBe('success');
  });

  it('marks a non-2xx response as an error', async () => {
    const link = { id: 'api', name: 'API', url: 'https://api.example.com/status' };
    const request = component.callLink(link);

    httpTesting.expectOne(link.url).flush('unavailable', {
      status: 503,
      statusText: 'Service Unavailable',
    });
    await request;

    expect(component.requestState(link.id)?.status).toBe('error');
    expect(component.requestState(link.id)?.message).toContain('503');
  });

  it('marks a request without a response as a timeout and cancels it', async () => {
    const linkStore = TestBed.inject(LinkStore);
    linkStore.save('API', 'https://api.example.com/status');
    const link = linkStore.links()[0];
    fixture.detectChanges();
    const request = component.callLink(link, 25);
    const httpRequest = httpTesting.expectOne(link.url);

    await request;
    fixture.detectChanges();

    expect(httpRequest.cancelled).toBe(true);
    expect(component.requestState(link.id)?.status).toBe('error');
    expect(component.requestState(link.id)?.message).toContain('Timeout');
    expect(fixture.nativeElement.querySelector('.feedback-error')).not.toBeNull();
  });
});
