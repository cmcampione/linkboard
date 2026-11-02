import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkOutline, closeOutline, globeOutline, linkOutline, searchOutline, settingsOutline } from 'ionicons/icons';
import { firstValueFrom, timeout } from 'rxjs';

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
  readonly links = this.linkStore.links;
  searchTerm = '';
  callStates: Record<string, CallState> = {};

  constructor(
    private readonly http: HttpClient,
    private readonly linkStore: LinkStore,
  ) {
    addIcons({ checkmarkOutline, closeOutline, globeOutline, linkOutline, searchOutline, settingsOutline });
  }

  get filteredLinks(): SavedLink[] {
    const query = this.searchTerm.trim().toLocaleLowerCase();
    const links = this.links();
    if (!query) return links;

    return links.filter((link) => `${link.name} ${this.hostname(link.url)}`.toLocaleLowerCase().includes(query));
  }

  requestState(id: string): CallState | undefined {
    return this.callStates[id];
  }

  async callLink(link: SavedLink): Promise<void> {
    if (this.callStates[link.id]?.status === 'loading') return;
    this.callStates = { ...this.callStates, [link.id]: { status: 'loading', message: 'Invio richiesta GET...' } };
    try {
      const response = await firstValueFrom(
        this.http.get(link.url, { observe: 'response', responseType: 'text' }).pipe(timeout({ first: 15000 })),
      );
      const succeeded = response.status >= 200 && response.status < 300;
      this.callStates = {
        ...this.callStates,
        [link.id]: {
          status: succeeded ? 'success' : 'error',
          message: succeeded ? `Risposta HTTP ${response.status}: chiamata riuscita.` : `Risposta HTTP ${response.status}.`,
        },
      };
    } catch (error) {
      const status = error instanceof HttpErrorResponse ? error.status : 0;
      this.callStates = {
        ...this.callStates,
        [link.id]: {
          status: 'error',
          message: status ? `Chiamata non riuscita: HTTP ${status}.` : 'Nessuna risposta: verifica rete e CORS.',
        },
      };
    }
  }

  hostname(url: string): string {
    return new URL(url).hostname.replace(/^www\./, '');
  }

}
