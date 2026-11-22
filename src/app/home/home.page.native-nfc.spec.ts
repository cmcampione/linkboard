import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { LinkStore } from '../link.store';
import { NativeNfcLaunchService } from '../native-nfc-launch.service';

import { HomePage } from './home.page';

describe('HomePage native NFC launch', () => {
  let fixture: ComponentFixture<HomePage>;
  let httpTesting: HttpTestingController;
  let onTagDetected: ((linkId: string) => void) | undefined;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    localStorage.clear();
    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    const nativeNfc = TestBed.inject(NativeNfcLaunchService);
    vi.spyOn(nativeNfc, 'isAndroidApp', 'get').mockReturnValue(true);
    vi.spyOn(nativeNfc, 'isAvailable').mockResolvedValue(true);
    vi.spyOn(nativeNfc, 'listenForTags').mockImplementation(async (listener) => {
      onTagDetected = listener;
      return () => {};
    });

    fixture = TestBed.createComponent(HomePage);
    httpTesting = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    await vi.waitFor(() => expect(TestBed.inject(LinkStore).isReady()).toBe(true));
    await vi.waitFor(() => expect(onTagDetected).toBeTypeOf('function'));
    expect(fixture.nativeElement.querySelector('.nfc-scan-button')).toBeNull();
  });

  afterEach(() => {
    httpTesting.verify();
    vi.useRealTimers();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('calls the configured link when Android dispatches its NFC tag intent', async () => {
    vi.useFakeTimers();
    const nativeNfc = TestBed.inject(NativeNfcLaunchService);
    const getMock = vi.spyOn(nativeNfc, 'httpGet').mockResolvedValue({
      status: 200,
    });
    const link = { id: 'nfc-link', name: 'Door', url: 'https://example.com/open' };
    TestBed.inject(LinkStore).replaceAll([link]);
    fixture.detectChanges();

    onTagDetected?.(link.id);
    await vi.waitFor(() => expect(fixture.componentInstance.requestState(link.id)?.status).toBe('loading'));
    expect(getMock).toHaveBeenCalledWith(link.url, 15000);

    await Promise.resolve();
    await Promise.resolve();
    expect(fixture.componentInstance.requestState(link.id)?.status).toBe('success');
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.componentInstance.nfcMessage()).toContain('chiamata riuscita');

    await vi.advanceTimersByTimeAsync(4999);
    expect(fixture.componentInstance.nfcMessage()).toContain('chiamata riuscita');
    await vi.advanceTimersByTimeAsync(1);
    expect(fixture.componentInstance.nfcMessage()).toBe('Avvicina un altro tag NFC associato per una nuova scansione.');
  });

  it('keeps separate link results when native NFC calls complete in different order', async () => {
    let resolveFirst!: (value: { status: number }) => void;
    const firstResponse = new Promise<{ status: number }>((resolve) => {
      resolveFirst = resolve;
    });
    const nativeNfc = TestBed.inject(NativeNfcLaunchService);
    vi.spyOn(nativeNfc, 'httpGet').mockImplementation((url) =>
      url.includes('/first') ? firstResponse : Promise.resolve({ status: 200 }),
    );
    const first = { id: 'first', name: 'First', url: 'https://example.com/first' };
    const second = { id: 'second', name: 'Second', url: 'https://example.com/second' };
    TestBed.inject(LinkStore).replaceAll([first, second]);
    fixture.detectChanges();

    onTagDetected?.(first.id);
    onTagDetected?.(second.id);
    await vi.waitFor(() => expect(fixture.componentInstance.requestState(second.id)?.status).toBe('success'));

    resolveFirst({ status: 504 });
    await vi.waitFor(() => expect(fixture.componentInstance.requestState(first.id)?.status).toBe('error'));

    expect(fixture.componentInstance.requestState(second.id)?.status).toBe('success');
    expect(fixture.componentInstance.nfcMessage()).toContain('chiamata riuscita');
  });

  it('reports a native HTTP 504 response', async () => {
    const nativeNfc = TestBed.inject(NativeNfcLaunchService);
    vi.spyOn(nativeNfc, 'httpGet').mockResolvedValue({
      status: 504,
    });
    const link = { id: 'nfc-link', name: 'Door', url: 'https://example.com/open' };

    await fixture.componentInstance.callLink(link);

    expect(fixture.componentInstance.requestState(link.id)?.status).toBe('error');
    expect(fixture.componentInstance.requestState(link.id)?.message).toContain('504');
  });
});
