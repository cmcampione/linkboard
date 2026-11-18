import { DOCUMENT } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import type { OnInit } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowDownOutline,
  arrowUpOutline,
  checkmarkOutline,
  closeOutline,
  globeOutline,
  linkOutline,
  searchOutline,
  settingsOutline,
} from 'ionicons/icons';
import { filter, firstValueFrom, take, TimeoutError, timeout } from 'rxjs';

import { LinkNfcService } from '../link-nfc.service';
import type { SavedLink } from '../link.repository';
import { LinkStore } from '../link.store';
import { NativeNfcLaunchService } from '../native-nfc-launch.service';

interface CallState {
  status: 'loading' | 'success' | 'unverified' | 'error';
  message: string;
}

const callResultDisplayDurationMs = 5000;

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [FormsModule, IonContent, IonIcon, RouterLink],
})
export class HomePage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private readonly linkStore = inject(LinkStore);
  private readonly nfc = inject(LinkNfcService);
  private readonly nativeNfc = inject(NativeNfcLaunchService);
  private readonly linksLoaded = firstValueFrom(
    toObservable(this.linkStore.isLoading).pipe(
      filter((isLoading) => !isLoading),
      take(1),
    ),
  );
  readonly links = this.linkStore.links;
  readonly persistenceError = this.linkStore.persistenceError;
  readonly isLoadingLinks = this.linkStore.isLoading;
  readonly nfcSupported = this.nfc.isSupported;
  readonly isNativeNfcApp = this.nativeNfc.isAndroidApp;
  readonly isScanningNfc = signal(false);
  readonly nfcMessage = signal('');
  searchTerm = '';
  private readonly callStates = signal<Record<string, CallState>>({});
  private readonly callResultTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private nfcMessageTimeout: ReturnType<typeof setTimeout> | null = null;
  private stopNfcScan: (() => void) | null = null;
  private stopNativeNfc: (() => void) | null = null;

  constructor() {
    addIcons({
      arrowDownOutline,
      arrowUpOutline,
      checkmarkOutline,
      closeOutline,
      globeOutline,
      linkOutline,
      searchOutline,
      settingsOutline,
    });
    inject(DestroyRef).onDestroy(() => {
      this.stopNfcScanner();
      this.stopNativeNfc?.();
      this.clearCallResultTimeouts();
      this.clearNfcMessageTimeout();
    });
  }

  ngOnInit(): void {
    if (this.nativeNfc.isAndroidApp) {
      void this.startNativeNfcListener();
      return;
    }
    if (this.nfcSupported) void this.toggleNfcScan();
  }

  get filteredLinks(): SavedLink[] {
    const query = this.searchTerm.trim().toLocaleLowerCase();
    const links = this.links();
    if (!query) return links;

    return links.filter((link) => `${link.name} ${this.hostname(link.url)}`.toLocaleLowerCase().includes(query));
  }

  requestState(id: string): CallState | undefined {
    return this.callStates()[id];
  }

  moveLink(id: string, direction: -1 | 1): void {
    const visibleLinks = this.filteredLinks;
    const index = visibleLinks.findIndex((link) => link.id === id);
    const target = visibleLinks[index + direction];
    if (index < 0 || !target) return;

    this.linkStore.swap(id, target.id);
  }

  blurNavigationFocus(event: Event): void {
    (event.currentTarget as HTMLElement).blur();
  }

  async callLink(link: SavedLink, timeoutMs = 15000): Promise<void> {
    if (this.callStates()[link.id]?.status === 'loading') return;
    this.setCallState(link.id, { status: 'loading', message: 'Invio richiesta GET...' });
    if (this.isPrivateHttpUrl(link.url)) {
      await this.callPrivateHttpLink(link, timeoutMs);
      return;
    }

    try {
      const response = await firstValueFrom(
        this.http.get(link.url, { observe: 'response', responseType: 'text' }).pipe(timeout({ first: timeoutMs })),
      );
      const succeeded = response.status >= 200 && response.status < 300;
      this.setCallState(link.id, {
        status: succeeded ? 'success' : 'error',
        message: succeeded
          ? `Risposta HTTP ${response.status}: chiamata riuscita.`
          : `Risposta HTTP ${response.status}.`,
      });
    } catch (error) {
      const status = error instanceof HttpErrorResponse ? error.status : 0;
      const message = status
        ? `Chiamata non riuscita: HTTP ${status}.`
        : error instanceof TimeoutError
          ? `Timeout dopo ${Math.ceil(timeoutMs / 1000)} secondi: nessuna risposta.`
          : 'Richiesta bloccata o non raggiungibile: verifica rete e CORS.';
      this.setCallState(link.id, { status: 'error', message });
    }
  }

  private async callPrivateHttpLink(link: SavedLink, timeoutMs: number): Promise<void> {
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(link.url, {
        method: 'GET',
        mode: 'no-cors',
        signal: controller.signal,
      });
      if (response.type === 'opaque') {
        this.setCallState(link.id, {
          status: 'unverified',
          message: 'Risposta ricevuta, ma il codice HTTP non è leggibile per CORS.',
        });
        return;
      }

      const succeeded = response.status >= 200 && response.status < 300;
      this.setCallState(link.id, {
        status: succeeded ? 'success' : 'error',
        message: succeeded
          ? `Risposta HTTP ${response.status}: chiamata riuscita.`
          : `Risposta HTTP ${response.status}.`,
      });
    } catch {
      this.setCallState(link.id, {
        status: 'error',
        message: timedOut
          ? `Timeout dopo ${Math.ceil(timeoutMs / 1000)} secondi: nessuna risposta.`
          : 'Richiesta non riuscita: verifica rete e dispositivo.',
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private isPrivateHttpUrl(url: string): boolean {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'http:') return false;

    const octets = parsedUrl.hostname.split('.').map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
      return false;
    }

    const [first, second] = octets;
    return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
  }

  async toggleNfcScan(): Promise<void> {
    if (this.stopNfcScan) {
      this.stopNfcScanner();
      this.setNfcMessage('Scansione NFC interrotta.');
      return;
    }
    if (this.isScanningNfc()) return;

    this.setNfcMessage('');
    this.isScanningNfc.set(true);
    try {
      this.stopNfcScan = await this.nfc.startScanning(
        (linkId) => void this.handleNfcLinkId(linkId),
        () => this.setNfcMessage('Tag NFC non associato a un link di Linkboard.'),
        (error) => {
          this.stopNfcScanner();
          this.setNfcMessage(this.nfc.errorMessage(error));
        },
      );
      this.setNfcMessage('Scansione attiva. Avvicina un tag associato.');
    } catch (error) {
      this.stopNfcScanner();
      this.setNfcMessage(this.nfc.errorMessage(error));
    }
  }

  private async startNativeNfcListener(): Promise<void> {
    const waitingMessage = 'In attesa di tag NFC...';
    this.setNfcMessage(waitingMessage);
    try {
      this.stopNativeNfc = await this.nativeNfc.listenForTags((linkId) => void this.handleNfcLinkId(linkId));
      const available = await this.nativeNfc.isAvailable();
      if (this.nfcMessage() === waitingMessage) {
        this.setNfcMessage(
          available ? 'Avvicina un tag NFC associato per avviare la chiamata.' : 'NFC non disponibile o disattivato.',
        );
      }
    } catch (error) {
      this.setNfcMessage(error instanceof Error ? error.message : 'Impossibile inizializzare la scansione NFC.');
    }
  }

  private async handleNfcLinkId(linkId: string): Promise<void> {
    if (this.isLoadingLinks()) await this.linksLoaded;
    const link = this.links().find((item) => item.id === linkId);
    if (!link) {
      this.setNfcMessage('Il link associato al tag non è più configurato.');
      return;
    }

    this.setNfcMessage(`Tag letto: avvio la chiamata per ${link.name}.`);
    await this.callLink(link);
    const result = this.requestState(link.id);
    if (result) this.setNfcMessage(`Tag letto: ${result.message}`, result.status !== 'loading');
  }

  private setNfcMessage(message: string, promptForNextScan = false): void {
    this.clearNfcMessageTimeout();
    this.nfcMessage.set(message);
    if (!promptForNextScan) return;

    this.nfcMessageTimeout = setTimeout(() => {
      this.nfcMessageTimeout = null;
      this.nfcMessage.set('Avvicina un altro tag NFC associato per una nuova scansione.');
    }, callResultDisplayDurationMs);
  }

  private clearNfcMessageTimeout(): void {
    if (this.nfcMessageTimeout) clearTimeout(this.nfcMessageTimeout);
    this.nfcMessageTimeout = null;
  }

  private setCallState(id: string, state: CallState): void {
    const previousTimeout = this.callResultTimeouts.get(id);
    if (previousTimeout) clearTimeout(previousTimeout);
    this.callResultTimeouts.delete(id);
    this.callStates.update((current) => ({ ...current, [id]: state }));

    if (state.status === 'loading') this.scrollCallResultIntoView(id);
    if (state.status !== 'success' && state.status !== 'error') return;

    this.scrollCallResultIntoView(id);
    const timeoutId = setTimeout(() => {
      if (this.callResultTimeouts.get(id) !== timeoutId) return;
      this.callResultTimeouts.delete(id);
      this.callStates.update((current) => {
        if (!current[id]) return current;
        const next = { ...current };
        delete next[id];
        return next;
      });
    }, callResultDisplayDurationMs);
    this.callResultTimeouts.set(id, timeoutId);
  }

  private clearCallResultTimeouts(): void {
    for (const timeoutId of this.callResultTimeouts.values()) clearTimeout(timeoutId);
    this.callResultTimeouts.clear();
  }

  private scrollCallResultIntoView(id: string): void {
    const view = this.document.defaultView;
    if (!view) return;

    view.requestAnimationFrame(() => {
      const card = Array.from(this.document.querySelectorAll<HTMLElement>('.launcher-card[data-link-id]')).find(
        (element) => element.dataset['linkId'] === id,
      );
      if (!card) return;

      const bounds = card.getBoundingClientRect();
      if (bounds.top < 0 || bounds.bottom > view.innerHeight) {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  private stopNfcScanner(): void {
    this.stopNfcScan?.();
    this.stopNfcScan = null;
    this.isScanningNfc.set(false);
  }

  hostname(url: string): string {
    return new URL(url).hostname.replace(/^www\./, '');
  }
}
