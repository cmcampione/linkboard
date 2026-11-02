import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  checkmarkOutline,
  closeOutline,
  globeOutline,
  linkOutline,
  searchOutline,
  settingsOutline,
} from 'ionicons/icons';
import { firstValueFrom, TimeoutError, timeout } from 'rxjs';

import { LinkNfcService } from '../link-nfc.service';
import type { SavedLink } from '../link.repository';
import { LinkStore } from '../link.store';

interface CallState {
  status: 'loading' | 'success' | 'error';
  message: string;
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [FormsModule, IonContent, IonIcon, RouterLink],
})
export class HomePage {
  private readonly http = inject(HttpClient);
  private readonly linkStore = inject(LinkStore);
  private readonly nfc = inject(LinkNfcService);
  readonly links = this.linkStore.links;
  readonly persistenceError = this.linkStore.persistenceError;
  readonly isLoadingLinks = this.linkStore.isLoading;
  readonly nfcSupported = this.nfc.isSupported;
  readonly isScanningNfc = signal(false);
  readonly nfcMessage = signal('');
  searchTerm = '';
  private readonly callStates = signal<Record<string, CallState>>({});
  private stopNfcScan: (() => void) | null = null;

  constructor() {
    addIcons({ checkmarkOutline, closeOutline, globeOutline, linkOutline, searchOutline, settingsOutline });
    inject(DestroyRef).onDestroy(() => this.stopNfcScanner());
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

  blurNavigationFocus(event: Event): void {
    (event.currentTarget as HTMLElement).blur();
  }

  async callLink(link: SavedLink, timeoutMs = 15000): Promise<void> {
    if (this.callStates()[link.id]?.status === 'loading') return;
    this.setCallState(link.id, { status: 'loading', message: 'Invio richiesta GET...' });
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

  async toggleNfcScan(): Promise<void> {
    if (this.stopNfcScan) {
      this.stopNfcScanner();
      this.nfcMessage.set('Scansione NFC interrotta.');
      return;
    }

    this.nfcMessage.set('');
    try {
      this.stopNfcScan = await this.nfc.startScanning(
        (linkId) => {
          const link = this.links().find((item) => item.id === linkId);
          if (!link) {
            this.nfcMessage.set('Il link associato al tag non è più configurato.');
            return;
          }

          this.nfcMessage.set(`Tag letto: avvio la chiamata per ${link.name}.`);
          void this.callLink(link).then(() => {
            const result = this.requestState(link.id);
            if (result) this.nfcMessage.set(`Tag letto: ${result.message}`);
          });
        },
        () => this.nfcMessage.set('Tag NFC non associato a un link di Linkboard.'),
        (error) => {
          this.stopNfcScanner();
          this.nfcMessage.set(this.nfc.errorMessage(error));
        },
      );
      this.isScanningNfc.set(true);
      this.nfcMessage.set('Scansione attiva. Avvicina un tag associato.');
    } catch (error) {
      this.stopNfcScanner();
      this.nfcMessage.set(this.nfc.errorMessage(error));
    }
  }

  private setCallState(id: string, state: CallState): void {
    this.callStates.update((current) => ({ ...current, [id]: state }));
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
