# Linkboard

Linkboard mostra un pulsante per ogni endpoint configurato. Il tap invia una chiamata REST `GET` senza aprire il browser; le risposte HTTP 2xx mostrano feedback verde, gli errori feedback rosso. Dalla pagina **Configurazione** puoi anche associare a ogni endpoint una foto scelta dalla galleria o dal dispositivo; viene ridimensionata e salvata insieme al link nel browser.

Per chiamare un endpoint da un browser, il server remoto deve consentire la richiesta cross-origin tramite CORS. In caso contrario il browser blocca la risposta e Linkboard mostra un errore di rete/CORS. Le chiamate hanno un timeout di 15 secondi.

## Avvio tramite NFC

Su Android compatibile con Web NFC e Chrome, dalla pagina **Configurazione** puoi associare uno o più tag NFC a un endpoint. Tieni il telefono vicino al tag quando richiesto. Dalla home tocca **Avvia scansione NFC**, poi avvicina un tag associato: Linkboard invia la richiesta GET e mostra il relativo esito.

La scansione richiede HTTPS, NFC attivo e Linkboard aperta in primo piano; non funziona con l'app chiusa o in background. Le associazioni sono salvate nel browser del dispositivo e non si sincronizzano. Per usare i tag su un altro dispositivo, associali nuovamente da quel dispositivo. La chiamata resta soggetta ai normali requisiti di rete, CORS e timeout.

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
