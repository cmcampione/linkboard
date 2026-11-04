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

import {
  MAX_BACKUP_SIZE_BYTES,
  LinkBackupService,
  type BackupImportMode,
  type LinkBackup,
} from '../link-backup.service';
import { LinkNfcService } from '../link-nfc.service';
import type { SavedLink } from '../link.repository';
import { LinkStore } from '../link.store';

function formatBackupLimit(): string {
  return `${MAX_BACKUP_SIZE_BYTES / (1024 * 1024)} MB`;
}

@Component({
  selector: 'app-settings',
  templateUrl: 'settings.page.html',
  styleUrls: ['settings.page.scss'],
  imports: [FormsModule, IonContent, IonIcon, RouterLink],
})
export class SettingsPage {
  private readonly linkStore = inject(LinkStore);
  private readonly nfc = inject(LinkNfcService);
  private readonly backup = inject(LinkBackupService);
  readonly links = this.linkStore.links;
  readonly persistenceError = this.linkStore.persistenceError;
  readonly isLoadingLinks = this.linkStore.isLoading;
  readonly isReady = this.linkStore.isReady;
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
  readonly pendingBackup = signal<LinkBackup | null>(null);
  readonly isImportingBackup = signal(false);
  readonly backupError = signal('');
  readonly backupMessage = signal('');
  backupImportMode: BackupImportMode = 'merge';

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
    try {
      this.linkStore.save(name, parsedUrl.href, this.editingId ?? undefined, this.formImageData());
      this.cancelEdit();
    } catch (error) {
      this.formError = error instanceof Error ? error.message : 'Impossibile creare un ID per il link.';
    }
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

  exportBackup(): void {
    this.backupError.set('');
    this.backupMessage.set('');
    if (!window.confirm('Il backup contiene nomi, URL e ID dei link. Gli URL potrebbero essere privati. Continuare?')) {
      return;
    }

    try {
      const serialized = this.backup.serializeBackup();
      const file = new Blob([serialized], { type: 'application/json' });
      const url = URL.createObjectURL(file);
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `linkboard-backup-${new Date().toISOString().replaceAll(':', '-')}.json`;
        anchor.click();
      } finally {
        URL.revokeObjectURL(url);
      }
      const includesImages = this.linkStore.links().some((link) => !!link.imageDataUrl);
      this.backupMessage.set(
        includesImages ? 'Backup esportato. Il file include le immagini dei link.' : 'Backup esportato. Le immagini non sono incluse nel file.',
      );
    } catch (error) {
      this.backupError.set(error instanceof Error ? error.message : 'Impossibile esportare il backup.');
    }
  }

  async selectBackup(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.backupError.set('');
    this.backupMessage.set('');
    this.pendingBackup.set(null);
    if (file.size > MAX_BACKUP_SIZE_BYTES) {
      this.backupError.set(`Il file di backup supera il limite di ${formatBackupLimit()}.`);
      return;
    }

    try {
      this.pendingBackup.set(this.backup.parseBackup(await file.text()));
      this.backupImportMode = 'merge';
    } catch (error) {
      this.backupError.set(error instanceof Error ? error.message : 'Impossibile leggere il file di backup.');
    }
  }

  async importBackup(): Promise<void> {
    const backup = this.pendingBackup();
    if (!backup || this.isImportingBackup()) return;

    this.isImportingBackup.set(true);
    this.backupError.set('');
    this.backupMessage.set('');
    try {
      await this.backup.importBackup(backup, this.backupImportMode);
      this.backupMessage.set(`Importati ${backup.links.length} link.`);
      this.pendingBackup.set(null);
    } catch (error) {
      this.backupError.set(error instanceof Error ? error.message : 'Impossibile importare il backup.');
    } finally {
      this.isImportingBackup.set(false);
    }
  }

  cancelBackupImport(): void {
    this.pendingBackup.set(null);
    this.backupError.set('');
  }

  async removeLink(id: string): Promise<void> {
    const revision = this.linkStore.remove(id);
    if (!revision) return;
    await this.linkStore.waitForPersistence(revision);
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
