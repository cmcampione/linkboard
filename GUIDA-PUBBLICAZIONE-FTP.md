# Pubblicare Linkboard su un server FTP

Questa procedura pubblica Linkboard come sito statico. La compilazione si esegue sul computer di sviluppo; sul server si caricano soltanto i file generati, non il progetto Angular.

## 1. Verificare l'hosting

Assicurati che il piano hosting offra:

- uno spazio web per file statici;
- un accesso FTP, FTPS o SFTP;
- un certificato HTTPS attivo;
- la possibilità di configurare il fallback delle rotte dell'applicazione.

Recupera host, utente, password e porta dal pannello del provider. Preferisci **SFTP** o **FTPS**: FTP semplice trasmette le credenziali senza cifratura.

## 2. Creare la build production

Dalla cartella del progetto, esegui:

```bash
npm ci
npm run build
```

La build pronta viene generata nella cartella `www/`. Verifica che contenga `index.html`, `manifest.webmanifest`, `ngsw-worker.js` e `ngsw.json`.

## 3. Collegarsi con FileZilla

1. Apri FileZilla e seleziona **File > Gestore siti > Nuovo sito**.
2. Inserisci l'host e l'utente forniti dal provider.
3. Seleziona **SFTP** (porta di solito `22`) oppure **FTP - Richiedi FTP esplicito su TLS** (FTPS, spesso porta `21`), secondo quanto supportato dall'hosting.
4. Inserisci la password nel client FTP, non in questo documento e non nel repository.
5. Connettiti e apri nella colonna locale la cartella `www/`.

## 4. Caricare i file

Nella colonna remota apri la cartella pubblica del sito. I nomi più comuni sono `public_html`, `htdocs`, `httpdocs` o `wwwroot`; il provider può indicare il percorso corretto.

Seleziona **il contenuto** di `www/` e caricalo nella cartella pubblica. Il file `index.html` deve trovarsi direttamente nella radice pubblica del sito, non in una sottocartella `www/` aggiuntiva. Non caricare `src/`, `node_modules/` o i file sorgente Angular.

Se il client chiede come gestire file già esistenti, scegli di sovrascriverli. Mostra anche i file nascosti nel client FTP quando devi caricare configurazioni come `.htaccess`.

## 5. Configurare le rotte Angular

Linkboard usa le rotte `/home` e `/settings`. Il server deve servire `index.html` quando si apre direttamente una rotta applicativa o si aggiorna la pagina; altrimenti `/settings` potrebbe restituire un errore 404.

Su hosting Apache, crea un file `.htaccess` nella stessa cartella di `index.html` con:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

Se il sito è pubblicato in una sottocartella, ad esempio `https://esempio.it/linkboard/`, modifica `RewriteBase` e la destinazione della regola in base al percorso, e genera la build con il base href corrispondente:

```bash
npm run build -- --base-href /linkboard/
```

Su Nginx o hosting gestiti, configura un fallback equivalente (`try_files ... /index.html`) dal pannello oppure chiedi al provider di abilitarlo.

## 6. Abilitare HTTPS

Attiva il certificato SSL dal pannello hosting e usa l'indirizzo HTTPS del sito. L'HTTPS è necessario per installare la PWA nella maggior parte dei browser e per registrare correttamente il service worker; fa eccezione `localhost` durante lo sviluppo.

## 7. Verificare la pubblicazione

1. Apri `https://tuo-dominio.example/` e controlla che appaia Linkboard.
2. Apri direttamente `https://tuo-dominio.example/settings`, poi aggiorna la pagina: deve restare sulla configurazione, senza 404.
3. Negli strumenti sviluppatore del browser controlla che `manifest.webmanifest`, `ngsw-worker.js` e `ngsw.json` rispondano correttamente.
4. Da smartphone usa il menu del browser per **Installare l'app** o **Aggiungerla alla schermata Home**.
5. Prova una chiamata REST: l'endpoint deve consentire CORS per il dominio pubblicato, altrimenti il browser ne blocca la risposta.

## Dati e aggiornamenti

Link, immagini e impostazioni vengono salvati nel browser del singolo dispositivo (`localStorage`); non vengono caricati sul server e non si sincronizzano automaticamente tra dispositivi.

Per pubblicare un aggiornamento, esegui di nuovo `npm run build` e carica il nuovo contenuto di `www/`, sovrascrivendo i file remoti. Dopo una pubblicazione, se un browser continua a mostrare la versione precedente, chiudi e riapri la PWA oppure cancellane i dati/cache dal browser.
