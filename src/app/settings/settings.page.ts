import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  checkmarkOutline,
  closeOutline,
  createOutline,
  globeOutline,
  linkOutline,
  trashOutline,
} from 'ionicons/icons';

import { LinkStore, type SavedLink } from '../link-store.service';

@Component({
  selector: 'app-settings',
  templateUrl: 'settings.page.html',
  styleUrls: ['settings.page.scss'],
  imports: [FormsModule, IonContent, IonIcon, RouterLink],
})
export class SettingsPage {
  readonly links = this.linkStore.links;
  editingId: string | null = null;
  formName = '';
  formUrl = '';
  formError = '';

  constructor(private readonly linkStore: LinkStore) {
    addIcons({
      arrowBackOutline,
      checkmarkOutline,
      closeOutline,
      createOutline,
      globeOutline,
      linkOutline,
      trashOutline,
    });
  }

  saveLink(): void {
    const rawUrl = this.formUrl.trim();
    const hasProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(rawUrl);

    if (hasProtocol && !/^https?:\/\//i.test(rawUrl)) {
      this.formError = 'Sono supportati solo indirizzi http e https.';
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
    } catch {
      this.formError = 'Inserisci un indirizzo web valido.';
      return;
    }

    if (!parsedUrl.hostname) {
      this.formError = 'Inserisci un indirizzo web valido.';
      return;
    }

    const name = this.formName.trim() || this.hostname(parsedUrl.href);
    const saved = this.linkStore.save(name, parsedUrl.href, this.editingId ?? undefined);

    if (!saved) {
      this.formError = 'Impossibile salvare i link in questo browser.';
      return;
    }

    this.cancelEdit();
  }

  editLink(link: SavedLink): void {
    this.editingId = link.id;
    this.formName = link.name;
    this.formUrl = link.url;
    this.formError = '';
  }

  removeLink(id: string): void {
    if (!this.linkStore.remove(id)) {
      this.formError = 'Impossibile aggiornare i link in questo browser.';
    }
  }

  cancelEdit(): void {
    this.editingId = null;
    this.formName = '';
    this.formUrl = '';
    this.formError = '';
  }

  hostname(url: string): string {
    return new URL(url).hostname.replace(/^www\./, '');
  }
}