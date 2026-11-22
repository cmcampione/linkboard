import { Injectable } from '@angular/core';
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

interface NfcTagEvent {
  linkId: string;
}

interface NativeNfcPlugin {
  addListener(eventName: 'tagDetected', listenerFunc: (event: NfcTagEvent) => void): Promise<PluginListenerHandle>;
  cancelWrite(): Promise<void>;
  isAvailable(): Promise<{ available: boolean }>;
  writeTag(options: { linkId: string }): Promise<void>;
}

const NativeNfc = registerPlugin<NativeNfcPlugin>('NfcLaunch');

@Injectable({ providedIn: 'root' })
export class NativeNfcLaunchService {
  get isAndroidApp(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  async httpGet(url: string, timeoutMs: number): Promise<{ status: number }> {
    if (!this.isAndroidApp) throw new Error('Le chiamate native HTTP sono disponibili solo nell’app Android.');
    return CapacitorHttp.get({
      url,
      responseType: 'text',
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
    });
  }

  async isAvailable(): Promise<boolean> {
    if (!this.isAndroidApp) return false;
    const result = await NativeNfc.isAvailable();
    return result.available;
  }

  async listenForTags(onLinkId: (linkId: string) => void): Promise<() => void> {
    if (!this.isAndroidApp) throw new Error('La gestione NFC nativa è disponibile solo nell’app Android.');

    const listener = await NativeNfc.addListener('tagDetected', ({ linkId }) => {
      if (typeof linkId === 'string' && linkId.trim()) onLinkId(linkId);
    });
    return () => {
      void listener.remove();
    };
  }

  async writeTag(linkId: string, signal: AbortSignal): Promise<void> {
    if (!this.isAndroidApp) throw new Error('La scrittura NFC nativa è disponibile solo nell’app Android.');
    if (signal.aborted) throw new DOMException('Operazione NFC interrotta.', 'AbortError');

    const cancelWrite = () => {
      void NativeNfc.cancelWrite();
    };
    signal.addEventListener('abort', cancelWrite, { once: true });
    try {
      await NativeNfc.writeTag({ linkId });
    } finally {
      signal.removeEventListener('abort', cancelWrite);
    }
  }
}
