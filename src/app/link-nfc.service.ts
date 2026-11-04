import { Injectable } from '@angular/core';

interface NdefRecordLike {
  mediaType?: string;
  data: DataView | null;
}

interface NdefReadingEventLike extends Event {
  message: { records: NdefRecordLike[] };
}

interface NdefReaderLike extends EventTarget {
  scan(options: { signal: AbortSignal }): Promise<void>;
  write(
    message: { records: { recordType: 'mime'; mediaType: string; data: ArrayBuffer | ArrayBufferView }[] },
    options: { overwrite: boolean; signal: AbortSignal },
  ): Promise<void>;
}

interface NfcWindow extends Window {
  NDEFReader?: new () => NdefReaderLike;
}

@Injectable({ providedIn: 'root' })
export class LinkNfcService {
  private readonly recordType = 'application/vnd.linkboard.tag';

  get isSupported(): boolean {
    return typeof window !== 'undefined' && window.isSecureContext && !!(window as NfcWindow).NDEFReader;
  }

  async associateLink(linkId: string, signal: AbortSignal): Promise<void> {
    if (!linkId.trim()) throw new Error('Il link non ha un identificativo valido.');

    const reader = this.createReader();
    await reader.write(
      {
        records: [
          {
            recordType: 'mime',
            mediaType: this.recordType,
            data: new TextEncoder().encode(linkId),
          },
        ],
      },
      { overwrite: true, signal },
    );
  }

  async startScanning(
    onLinkRead: (linkId: string) => void,
    onUnknownTag: () => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const reader = this.createReader();
    const controller = new AbortController();
    const handledLinkIds = new Set<string>();
    let reportedUnknownTag = false;

    reader.addEventListener('reading', (event) => {
      const message = (event as NdefReadingEventLike).message;
      const record = message.records.find((item) => item.mediaType === this.recordType);
      const linkId = record?.data ? this.decodeToken(record.data) : '';

      if (!linkId) {
        if (!reportedUnknownTag) {
          reportedUnknownTag = true;
          onUnknownTag();
        }
        return;
      }
      if (handledLinkIds.has(linkId)) return;

      handledLinkIds.add(linkId);
      onLinkRead(linkId);
    });
    reader.addEventListener('readingerror', () => {
      controller.abort();
      onError(new Error('Il tag NFC non è leggibile. Avvicinalo di nuovo e riprova.'));
    });

    try {
      await reader.scan({ signal: controller.signal });
    } catch (error) {
      controller.abort();
      throw error;
    }

    return () => controller.abort();
  }

  errorMessage(error: unknown): string {
    if (error instanceof Error) {
      switch (error.name) {
        case 'NotAllowedError':
          return 'Consenti l’accesso NFC al browser e avvia di nuovo l’operazione.';
        case 'NotSupportedError':
          return 'NFC non è supportato da questo browser o da questo dispositivo.';
        case 'SecurityError':
          return 'L’accesso NFC richiede HTTPS e Linkboard aperta in primo piano.';
        case 'NetworkError':
          return 'Impossibile comunicare con il tag NFC. Verifica che sia compatibile e riprova.';
        case 'AbortError':
          return 'Operazione NFC interrotta.';
        default:
          return error.message || 'Operazione NFC non riuscita.';
      }
    }

    return 'Operazione NFC non riuscita.';
  }

  private createReader(): NdefReaderLike {
    if (typeof window === 'undefined' || !window.isSecureContext) {
      throw new Error('NFC richiede HTTPS e Linkboard aperta in primo piano.');
    }

    const Reader = (window as NfcWindow).NDEFReader;
    if (!Reader) {
      throw new Error('NFC Web non è disponibile. Usa Chrome su un dispositivo Android compatibile.');
    }

    return new Reader();
  }

  private decodeToken(data: DataView): string {
    return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }
}
