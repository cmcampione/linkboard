import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { LinkStore } from '../link.store';

import { SettingsPage } from './settings.page';

const compressedImage = 'data:image/jpeg;base64,Y29tcHJlc3NlZA==';

describe('SettingsPage', () => {
  let component: SettingsPage;
  let fixture: ComponentFixture<SettingsPage>;
  let linkStore: InstanceType<typeof LinkStore>;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    localStorage.clear();
    await TestBed.configureTestingModule({ providers: [provideRouter([])] }).compileComponents();
    fixture = TestBed.createComponent(SettingsPage);
    component = fixture.componentInstance;
    linkStore = TestBed.inject(LinkStore);
    fixture.detectChanges();
    await vi.waitFor(() => expect(linkStore.isReady()).toBe(true));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('reads and compresses a selected photo, then renders its preview', async () => {
    const drawImage = vi.fn();
    vi.stubGlobal('FileReader', createFileReaderMock());
    vi.stubGlobal('Image', createImageMock());
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    const encodeImage = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(compressedImage);
    const { file, event } = createImageEvent();

    const pendingSelection = component.selectImage(event);
    expect(component.isProcessingImage()).toBe(true);
    await pendingSelection;
    fixture.detectChanges();

    expect(component.isProcessingImage()).toBe(false);
    expect(drawImage).toHaveBeenCalledWith(
      expect.objectContaining({ naturalWidth: 1024, naturalHeight: 512 }),
      0,
      0,
      512,
      256,
    );
    expect(encodeImage).toHaveBeenCalledWith('image/jpeg', 0.78);
    expect(component.formImageData()).toBe(compressedImage);
    expect(fixture.nativeElement.querySelector('.image-preview img')?.getAttribute('src')).toBe(compressedImage);
    expect(file.type).toBe('image/png');
  });

  it('saves a selected photo with a new endpoint', async () => {
    mockImageProcessing();
    component.formName = 'Dashboard';
    component.formUrl = 'https://dashboard.example.com';
    await component.selectImage(createImageEvent().event);

    component.saveLink();
    TestBed.flushEffects();
    await vi.waitFor(() =>
      expect(JSON.parse(localStorage.getItem('linkboard.links') ?? '[]')[0].imageDataUrl).toBe(compressedImage),
    );

    expect(linkStore.links()).toHaveLength(1);
    expect(linkStore.links()[0].imageDataUrl).toBe(compressedImage);
    expect(component.formImageData()).toBeUndefined();
  });

  it('keeps, replaces, and removes the photo while editing an endpoint', async () => {
    const originalImage = 'data:image/jpeg;base64,b2xk';
    linkStore.save('Dashboard', 'https://dashboard.example.com', undefined, originalImage);
    const link = linkStore.links()[0];
    component.editLink(link);
    fixture.detectChanges();

    expect(component.formImageData()).toBe(originalImage);
    expect(fixture.nativeElement.querySelector('.image-preview img')?.getAttribute('src')).toBe(originalImage);

    mockImageProcessing();
    await component.selectImage(createImageEvent().event);
    component.saveLink();
    TestBed.flushEffects();

    expect(linkStore.links()[0].imageDataUrl).toBe(compressedImage);

    component.editLink(linkStore.links()[0]);
    component.removeImage();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.image-preview')).toBeNull();

    component.saveLink();
    TestBed.flushEffects();
    await vi.waitFor(() =>
      expect(JSON.parse(localStorage.getItem('linkboard.links') ?? '[]')[0].imageDataUrl).toBeUndefined(),
    );

    expect(linkStore.links()[0].imageDataUrl).toBeUndefined();
  });

  it('rejects a non-image file without enabling a preview', async () => {
    const { event } = createImageEvent('text/plain');

    await component.selectImage(event);
    fixture.detectChanges();

    expect(component.formError).toContain('file immagine');
    expect(component.formImageData()).toBeUndefined();
    expect(component.isProcessingImage()).toBe(false);
    expect(fixture.nativeElement.querySelector('.image-preview')).toBeNull();
  });

  it('previews and confirms a replacement backup', async () => {
    const revision = linkStore.save('Old', 'https://old.example.com', undefined, compressedImage);
    TestBed.flushEffects();
    await linkStore.waitForPersistence(revision);

    await component.selectBackup(createBackupEvent());
    fixture.detectChanges();

    expect(component.pendingBackup()?.links).toEqual([
      { id: 'imported', name: 'Imported', url: 'https://imported.example.com' },
    ]);
    expect(fixture.nativeElement.textContent).toContain('Il file contiene 1 link');

    component.backupImportMode = 'replace';
    await component.importBackup();
    fixture.detectChanges();

    expect(linkStore.links()).toEqual([{ id: 'imported', name: 'Imported', url: 'https://imported.example.com' }]);
    expect(component.backupMessage()).toContain('Importati 1 link');
    expect(fixture.nativeElement.textContent).toContain('Importati 1 link');
  });
});

function createImageEvent(type = 'image/png'): { file: File; event: Event } {
  const file = new File(['photo'], 'photo.png', { type });
  const input = document.createElement('input');
  input.type = 'file';
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  return { file, event: { target: input } as unknown as Event };
}

function createBackupEvent(): Event {
  const file = new File(['backup'], 'backup.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', {
    value: async () =>
      JSON.stringify({
        format: 'linkboard-backup',
        version: 1,
        exportedAt: '2026-11-02T00:00:00.000Z',
        links: [{ id: 'imported', name: 'Imported', url: 'https://imported.example.com' }],
      }),
  });
  const input = document.createElement('input');
  input.type = 'file';
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  return { target: input } as unknown as Event;
}

function createFileReaderMock(): typeof FileReader {
  return class {
    result: string | ArrayBuffer | null = null;
    onload: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null;
    onerror: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null;

    readAsDataURL(): void {
      this.result = 'data:image/png;base64,aW5wdXQ=';
      queueMicrotask(() =>
        this.onload?.call(this as unknown as FileReader, new ProgressEvent('load') as ProgressEvent<FileReader>),
      );
    }
  } as unknown as typeof FileReader;
}

function createImageMock(): typeof Image {
  return class {
    naturalWidth = 1024;
    naturalHeight = 512;
    onload: ((this: GlobalEventHandlers, event: Event) => unknown) | null = null;
    onerror: ((this: GlobalEventHandlers, event: Event) => unknown) | null = null;

    set src(_value: string) {
      queueMicrotask(() => this.onload?.call(this as unknown as GlobalEventHandlers, new Event('load')));
    }
  } as unknown as typeof Image;
}

function mockImageProcessing(): void {
  vi.stubGlobal('FileReader', createFileReaderMock());
  vi.stubGlobal('Image', createImageMock());
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(compressedImage);
}
