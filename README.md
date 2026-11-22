# Linkboard

Linkboard mostra un pulsante per ogni endpoint configurato. Il tap invia una chiamata REST `GET` senza aprire il browser; le risposte HTTP 2xx mostrano feedback verde, gli errori feedback rosso. Dalla pagina **Configurazione** puoi anche associare a ogni endpoint una foto scelta dalla galleria o dal dispositivo; viene ridimensionata e salvata insieme al link nel browser.

Per chiamare un endpoint da un browser, il server remoto deve consentire la richiesta cross-origin tramite CORS. In caso contrario il browser blocca la risposta e Linkboard mostra un errore di rete/CORS. Le chiamate hanno un timeout di 15 secondi.

## Avvio tramite NFC

Nella PWA, su Android compatibile con Web NFC e Chrome, dalla pagina **Configurazione** puoi scrivere su uno o più tag NFC l'ID stabile di un endpoint. Puoi scrivere lo stesso link su più tag. Aprendo la home, Linkboard tenta di avviare automaticamente la scansione e la mantiene attiva mentre l'app resta in primo piano. Se il browser richiede un gesto esplicito o blocca l'avvio automatico, tocca **Avvia scansione NFC** e poi avvicina un tag: Linkboard risolve l'ID nella raccolta caricata, invia la richiesta GET e mostra il relativo esito.

La scansione della PWA richiede HTTPS, NFC attivo e Linkboard aperta in primo piano; non funziona con l'app chiusa o in background. Il tag contiene l'ID del link, non l'URL né una mappatura salvata nel browser. Eliminando il link, il tag non risolverà più un endpoint.

### App Android nativa

Il branch `feature/native-nfc` aggiunge una versione Android Capacitor. L'app registra il tipo MIME NFC usato dalla PWA, quindi Android può aprirla quando viene letto un tag associato anche se Linkboard non era già aperta. L'app avvia la GET in automatico dopo aver caricato i link; dalla pagina **Configurazione** può anche scrivere i tag NFC.

La PWA nel browser e l'app nativa hanno archivi locali separati. Per utilizzare nell'app i link già configurati nella PWA, esporta un backup dalla PWA e importalo nell'app: il backup conserva gli ID necessari per riconoscere i tag esistenti. La lettura non funziona se il link associato non è presente nell'archivio dell'app. Il tag contiene solo l'ID, ma può essere copiato o riscritto: l'app esegue la GET senza una conferma aggiuntiva. Proteggi i link che attivano operazioni sensibili e non usare GET per modificare dati.

Android può richiedere che il telefono sia sbloccato o che l'utente selezioni l'app. NFC deve essere disponibile e attivo; la lettura da tag non equivale a una scansione silenziosa con schermo bloccato garantita su tutti i dispositivi. Le chiamate native usano il trasporto HTTP di Capacitor e non sono soggette al CORS del browser; la raggiungibilità del server, il timeout e le restrizioni di rete Android restano applicabili.

Per compilare il progetto Android servono Android SDK e JDK 21. Il Dev Container installa automaticamente Node.js 22, JDK 21 e Android SDK (API 36 e Build Tools 36.0.0); al primo avvio esegue anche `npm ci`. Per ricrearlo in un Codespace, scegli **Codespaces: Rebuild Container** dalla palette dei comandi. L'emulatore Android e Android Studio non sono inclusi nel container.

```bash
npm install
npm run android:build
npm run android:open
```

Il comando di build compila la web app con la base corretta per Capacitor e sincronizza gli asset nel progetto `android/`. Da Android Studio puoi avviare l'app su un dispositivo Android con NFC oppure generare un APK. Le prove finali di lettura e scrittura richiedono un telefono e tag NDEF reali.

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

### Costruire l’APK Android

1. Installa le dipendenze e compila e sincronizza la web app nel progetto Android:

```bash
npm install
npm run android:build
```

Il comando `npm run android:build` prepara automaticamente la directory `www/` con la build production e sincronizza il contenuto nel progetto `android/`; non è necessario eseguire separatamente `npm run build`.

2. Genera l’APK di debug dal progetto Android:

```bash
cd android
./gradlew assembleDebug
```

L’APK viene creato in `android/app/build/outputs/apk/debug/app-debug.apk`.

Per generare una build Android release non firmata:

```bash
cd android
./gradlew assembleRelease
```

L’APK viene creato in `android/app/build/outputs/apk/release/app-release-unsigned.apk`. Per distribuire questa build su dispositivi o tramite store, apri il progetto in Android Studio e configuralo con una chiave di firma valida tramite **Build > Generate Signed Bundle / APK**.
