import { Component, inject, signal } from '@angular/core';
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
  imageOutline,
  linkOutline,
  trashOutline,
} from 'ionicons/icons';

import { LinkStore, type SavedLink } from '../link-store.service';
import { LinkNfcService, type NfcAssociation } from '../link-nfc.service';

@Component({
  selector: 'app-settings',
  templateUrl: 'settings.page.html',
  styleUrls: ['settings.page.scss'],
  imports: [FormsModule, IonContent, IonIcon, RouterLink],
})
export class SettingsPage {
  private readonly linkStore = inject(LinkStore);
  private readonly nfc = inject(LinkNfcService);
  readonly links = this.linkStore.links;
  readonly nfcSupported = this.nfc.isSupported;
  editingId: string | null = null;
  formName = '';
  formUrl = '';
  formError = '';
  readonly formImageData = signal<string | undefined>(undefined);
  readonly isProcessingImage = signal(false);
  readonly activeNfcLinkId = signal<string | null>(null);
  readonly nfcMessage = signal('');
  readonly nfcError = signal('');

  constructor() {
    addIcons({
      arrowBackOutline,
      checkmarkOutline,
      closeOutline,
      createOutline,
      globeOutline,
      imageOutline,
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
    const saved = this.linkStore.save(name, parsedUrl.href, this.editingId ?? undefined, this.formImageData());

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
    this.formImageData.set(link.imageDataUrl);
    this.formError = '';
  }

  async selectImage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.formError = 'Seleziona un file immagine.';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.formError = 'L’immagine deve essere inferiore a 10 MB.';
      return;
    }

    this.isProcessingImage.set(true);
    try {
      this.formImageData.set(await this.compressImage(file));
      this.formError = '';
    } catch {
      this.formError = 'Non è stato possibile leggere questa immagine.';
    } finally {
      this.isProcessingImage.set(false);
    }
  }

  removeImage(): void {
    this.formImageData.set(undefined);
  }

  removeLink(id: string): void {
    if (!this.linkStore.remove(id)) {
      this.formError = 'Impossibile aggiornare i link in questo browser.';
      return;
    }

    if (!this.nfc.removeAssociationsForLink(id)) {
      this.nfcError.set('Endpoint eliminato, ma non è stato possibile rimuovere le associazioni NFC dal browser.');
    }
  }

  tagAssociationsFor(linkId: string): NfcAssociation[] {
    return this.nfc.associationsForLink(linkId);
  }

  async associateTag(link: SavedLink): Promise<void> {
    if (this.activeNfcLinkId()) return;

    this.activeNfcLinkId.set(link.id);
    this.nfcMessage.set('');
    this.nfcError.set('');
    try {
      await this.nfc.associateLink(link.id);
      this.nfcMessage.set(`Tag NFC associato a ${link.name}.`);
    } catch (error) {
      this.nfcError.set(this.nfc.errorMessage(error));
    } finally {
      this.activeNfcLinkId.set(null);
    }
  }

  removeTag(token: string): void {
    this.nfcError.set('');
    this.nfcMessage.set('');
    if (!this.nfc.removeAssociation(token)) {
      this.nfcError.set('Impossibile rimuovere l’associazione NFC in questo browser.');
    }
  }

  cancelEdit(): void {
    this.editingId = null;
    this.formName = '';
    this.formUrl = '';
    this.formImageData.set(undefined);
    this.isProcessingImage.set(false);
    this.formError = '';
  }

  hostname(url: string): string {
    return new URL(url).hostname.replace(/^www\./, '');
  }

  blurNavigationFocus(event: Event): void {
    (event.currentTarget as HTMLElement).blur();
  }

  private compressImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('File read failed'));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error('Image decode failed'));
        image.onload = () => {
          const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext('2d');
          if (!context) {
            reject(new Error('Canvas unavailable'));
            return;
          }

          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.78));
        };
        image.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }
}
