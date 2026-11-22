# Backup, esportazione e importazione

## Stato

La funzionalità è implementata. Questo documento descrive il formato, le scelte confermate e le dipendenze operative.

## Formato del backup

Il backup JSON è versionato e include gli identificativi stabili dei link. Ogni link può includere l’immagine JPEG, se presente; le associazioni NFC non vengono esportate:

```json
{
  "format": "linkboard-backup",
  "version": 1,
  "exportedAt": "2026-11-02T00:00:00.000Z",
  "links": [
    {
      "id": "uuid-stabile",
      "name": "Servizio",
      "url": "https://example.com/status"
    }
  ]
}
```

Il servizio rifiuta JSON malformato, formati/versioni non supportati, date non valide, ID vuoti o duplicati, nomi vuoti, URL diversi da HTTP(S), immagini non valide e file oltre 10 MB. I campi aggiuntivi non riconosciuti vengono ignorati.

## Importazione

La pagina Configurazione mostra il numero di link nel file e richiede conferma esplicita, con modalità:

- **Unisci:** aggiunge i link nuovi e aggiorna quelli che hanno lo stesso ID. Se il backup contiene un'immagine, sostituisce quella locale; se non la contiene, conserva l'immagine locale esistente.
- **Sostituisci:** rimpiazza tutta la raccolta e importa le immagini presenti nel backup; le immagini locali assenti dal file vengono rimosse.

L'importazione passa da `LinkBackupService` e `LinkStore`, quindi usa il `LINK_REPOSITORY` configurato (localStorage o REST) e attende l'esito della persistenza. In caso di errore di salvataggio, lo store ripristina lo stato precedente e la UI mostra l'errore.

## Identificativi e NFC

- I nuovi link ricevono un ID generato da `crypto.randomUUID()`; se non disponibile, la creazione fallisce esplicitamente.
- Le modifiche a un link ne mantengono l'ID. Export/import conserva gli ID affinché i tag scritti continuino a risolverli.
- Ogni tag contiene l'ID del link, codificato UTF-8 nel record MIME `application/vnd.linkboard.tag`; non contiene URL o una chiave di associazione locale.
- È consentito associare più tag allo stesso link. In una scansione, le letture duplicate dello stesso ID vengono deduplicate; sessioni di scansione diverse risolvono indipendentemente lo stesso ID.
- L'app non enumera né revoca singoli tag. Riscrivere il tag lo riassegna; eliminare il link fa sì che i tag con quell'ID non risolvano un endpoint.
- La prima implementazione non include fallback legacy: non erano ancora stati programmati tag con il formato precedente. Prima di evolvere il formato NFC, sarà necessario definire una strategia di compatibilità e migrazione.

## Passaggio tra dispositivi o provider

Esportare dal dispositivo/repository sorgente e importare con il repository di destinazione selezionato. Cambiare da localStorage a REST non trasferisce automaticamente i dati. Perché un tag già scritto funzioni sul nuovo dispositivo, la raccolta caricata deve contenere il link con lo stesso ID. Il backup può contenere URL privati: va trattato come un file personale.

## Diagramma dei consumer e delle dipendenze

```mermaid
flowchart TD
  User[Utente]
  Settings[SettingsPage]
  Home[HomePage]
  Backup[LinkBackupService]
  Store[LinkStore<br/>SignalStore]
  Nfc[LinkNfcService]
  Repository[LINK_REPOSITORY<br/>InjectionToken]
  Local[LocalStorageLinkRepository]
  Rest[RestLinkRepository]
  BackupFile[File API web<br/>Filesystem + Share Android]
  LinkStorage[(Persistenza link<br/>localStorage oppure REST)]
  Tag[Tag NFC<br/>linkId]

  User --> Settings
  User --> Home
  Settings -->|export / import| Backup
  Backup -->|legge / aggiorna raccolta| Store
  Backup -->|analizza e salva/condivide JSON| BackupFile
  Settings -->|CRUD link| Store
  Settings -->|scrive ID| Nfc
  Home -->|legge link e risolve ID| Store
  Home -->|scansiona| Nfc
  Store -->|effect di persistenza| Repository
  Repository --> Local
  Repository --> Rest
  Local --> LinkStorage
  Rest --> LinkStorage
  Nfc <-->|scrive / legge linkId| Tag
```

## Verifiche

I test unitari coprono schema e validazione del backup, inclusione delle immagini in export/import, merge/replace, rollback se la persistenza fallisce, scrittura NFC diretta, più tag sullo stesso ID e anteprima/conferma UI. Build, lint e test vanno eseguiti durante la convalida delle modifiche; i test E2E richiedono le dipendenze browser di sistema.
