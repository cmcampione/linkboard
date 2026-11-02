import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
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

import { LinkStore, type SavedLink } from '../link-store.service';

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
  readonly links = this.linkStore.links;
  searchTerm = '';
  private readonly callStates = signal<Record<string, CallState>>({});

  constructor() {
    addIcons({ checkmarkOutline, closeOutline, globeOutline, linkOutline, searchOutline, settingsOutline });
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

  private setCallState(id: string, state: CallState): void {
    this.callStates.update((current) => ({ ...current, [id]: state }));
  }

  hostname(url: string): string {
    return new URL(url).hostname.replace(/^www\./, '');
  }
}
