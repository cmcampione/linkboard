import { Injectable, signal } from '@angular/core';

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
    options: { overwrite: boolean },
  ): Promise<void>;
}

interface NfcWindow extends Window {
  NDEFReader?: new () => NdefReaderLike;
}

export interface NfcAssociation {
  token: string;
  linkId: string;
}

@Injectable({ providedIn: 'root' })
export class LinkNfcService {
  private readonly storageKey = 'linkboard.nfc-associations';
  private readonly recordType = 'application/vnd.linkboard.tag';
  private readonly state = signal(this.load());

  readonly associations = this.state.asReadonly();

  get isSupported(): boolean {
    return typeof window !== 'undefined' && window.isSecureContext && !!(window as NfcWindow).NDEFReader;
  }

  associationsForLink(linkId: string): NfcAssociation[] {
    return this.state().filter((association) => association.linkId === linkId);
  }

  async associateLink(linkId: string): Promise<void> {
    const reader = this.createReader();
    if (!crypto.randomUUID) {
      throw new Error('Questo dispositivo non permette di creare un identificativo NFC sicuro.');
    }

    const association = { token: crypto.randomUUID(), linkId };
    if (!this.persist([...this.state(), association])) {
      throw new Error('Impossibile salvare l’associazione NFC in questo browser.');
    }

    try {
      await reader.write(
        {
          records: [
            {
              recordType: 'mime',
              mediaType: this.recordType,
              data: new TextEncoder().encode(association.token),
            },
          ],
        },
        { overwrite: false },
      );
    } catch (error) {
      if (!this.removeAssociation(association.token)) {
        throw new Error('Scrittura NFC non riuscita e impossibile annullare l’associazione salvata.', { cause: error });
      }
      throw error;
    }
  }

  async startScanning(
    onLinkRead: (linkId: string) => void,
    onUnknownTag: () => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const reader = this.createReader();
    const controller = new AbortController();
    const handledTokens = new Set<string>();
    let reportedUnknownTag = false;

    reader.addEventListener('reading', (event) => {
      const message = (event as NdefReadingEventLike).message;
      const record = message.records.find((item) => item.mediaType === this.recordType);
      const token = record?.data ? this.decodeToken(record.data) : '';
      const association = this.state().find((item) => item.token === token);

      if (!association) {
        if (!reportedUnknownTag) {
          reportedUnknownTag = true;
          onUnknownTag();
        }
        return;
      }
      if (handledTokens.has(token)) return;

      handledTokens.add(token);
      onLinkRead(association.linkId);
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

  removeAssociation(token: string): boolean {
    return this.persist(this.state().filter((association) => association.token !== token));
  }

  removeAssociationsForLink(linkId: string): boolean {
    return this.persist(this.state().filter((association) => association.linkId !== linkId));
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

  private load(): NfcAssociation[] {
    try {
      const savedAssociations = localStorage.getItem(this.storageKey);
      const parsedAssociations: unknown = savedAssociations ? JSON.parse(savedAssociations) : [];
      return Array.isArray(parsedAssociations) ? parsedAssociations.filter(this.isAssociation) : [];
    } catch {
      return [];
    }
  }

  private isAssociation(value: unknown): value is NfcAssociation {
    if (typeof value !== 'object' || value === null) return false;
    const association = value as Record<string, unknown>;
    return typeof association['token'] === 'string' && typeof association['linkId'] === 'string';
  }

  private persist(associations: NfcAssociation[]): boolean {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(associations));
      this.state.set(associations);
      return true;
    } catch {
      return false;
    }
  }
}
