# Linkboard

Linkboard mostra un pulsante per ogni endpoint configurato. Il tap invia una chiamata REST `GET` senza aprire il browser; le risposte HTTP 2xx mostrano feedback verde, gli errori feedback rosso. Dalla pagina **Configurazione** puoi anche associare a ogni endpoint una foto scelta dalla galleria o dal dispositivo; viene ridimensionata e salvata insieme al link nel browser.

Per chiamare un endpoint da un browser, il server remoto deve consentire la richiesta cross-origin tramite CORS. In caso contrario il browser blocca la risposta e Linkboard mostra un errore di rete/CORS. Le chiamate hanno un timeout di 15 secondi.

## Avvio tramite NFC

Su Android compatibile con Web NFC e Chrome, dalla pagina **Configurazione** puoi scrivere su uno o più tag NFC l'ID stabile di un endpoint. Puoi scrivere lo stesso link su più tag. Dalla home tocca **Avvia scansione NFC**, poi avvicina un tag: Linkboard risolve l'ID nella raccolta caricata, invia la richiesta GET e mostra il relativo esito.

La scansione richiede HTTPS, NFC attivo e Linkboard aperta in primo piano; non funziona con l'app chiusa o in background. Il tag contiene l'ID del link, non l'URL né una mappatura salvata nel browser. Per usare un tag su un altro dispositivo, importa lì il backup contenente lo stesso link e ID. Eliminando il link, il tag non risolverà più un endpoint. La chiamata resta soggetta ai normali requisiti di rete, CORS e timeout.

## Backup, esportazione e importazione

Dalla pagina **Configurazione** puoi esportare i link in un file JSON versionato e importarli scegliendo **Unisci** o **Sostituisci**. Il backup include gli ID, i nomi e gli URL, ma non le immagini né una collezione di associazioni NFC. Il limite di importazione è 1 MB.

- **Unisci** aggiunge i nuovi ID e aggiorna quelli già presenti; conserva le immagini locali dei link che corrispondono per ID.
- **Sostituisci** rimpiazza tutta la raccolta; i link importati non hanno immagini.
- Dopo l'importazione puoi assegnare immagini specifiche al dispositivo dalla configurazione.

Il file può contenere URL privati: esportalo e importalo solo se ne conosci la provenienza e conservalo come un backup personale. Per trasferire link tra dispositivi o tra `localStorage` e REST, esporta dal repository sorgente e importa dopo aver selezionato il repository di destinazione. L'importazione usa la persistenza configurata nell'app.

## Avvio nel browser

```bash
npm install
npm start
```

Il server ascolta su `0.0.0.0:4200`. Apri `http://localhost:4200` sul PC oppure esponi la porta 4200 dal tuo ambiente server/Codespaces per raggiungerla da un altro dispositivo.

## Stato applicativo

Lo stato condiviso dei link è gestito con NgRx SignalStore (`@ngrx/signals`). La persistenza è disaccoppiata tramite `LinkRepository`: l’implementazione predefinita usa `localStorage`; è disponibile anche `RestLinkRepository`, che legge con `GET` e sostituisce la raccolta con `PUT`. Un effect dello store serializza i salvataggi e mostra gli errori di caricamento o persistenza. Lo stato temporaneo delle pagine e le operazioni NFC restano nei componenti e nel servizio NFC.

### Scegliere la persistenza

Per usare `localStorage`, lascia `linkPersistence: 'localStorage'` nella configurazione `src/environments/environment.ts` (sviluppo) e `src/environments/environment.prod.ts` (build production).

Per collegare un backend REST di esempio, modifica la configurazione dell’ambiente usato dalla build:

```ts
linkPersistence: 'rest',
linksApiUrl: 'https://tuo-server.example/api/links',
```

Il server deve implementare questo contratto:

- `GET /api/links` restituisce un array JSON di link (`id`, `name`, `url` ed eventualmente `imageDataUrl`);
- `PUT /api/links` riceve l’intero array e sostituisce la raccolta.

`/api/links` è un endpoint dimostrativo: non viene fornito un backend in questo progetto. Cambiare provider non trasferisce automaticamente i dati già presenti in `localStorage`: il server diventa la fonte letta dall’app. Prima di passare a REST, migra i dati esistenti sul server se vuoi conservarli. Il backend deve inoltre configurare CORS e autenticazione secondo il deployment; non inserire segreti nel bundle frontend.

Per verificare la versione PWA con service worker attivo:

```bash
npm run start:pwa
```

L’installazione come app richiede un contesto sicuro: pubblica la build tramite HTTPS, poi scegli “Installa app” o “Aggiungi alla schermata Home” nel browser mobile. In Codespaces usa l’indirizzo HTTPS della porta inoltrata.

## Build

```bash
npm run build
```

I file pronti per la distribuzione vengono generati in `www/`. Il service worker e il manifest rendono la build production installabile e disponibile offline dopo il primo caricamento.

## App nativa con Capacitor

Capacitor è già configurato. Per generare una piattaforma mobile servono l’SDK Android o Xcode e il relativo pacchetto Capacitor; la PWA non richiede questi strumenti.
