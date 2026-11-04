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
ls -l www/ngsw-worker.js www/ngsw.json
```

`npm ci` installa le dipendenze; non crea la build. `npm run build` genera i file statici in `www/`, usa il percorso pubblico `/linkboard/` configurato per questo hosting e abilita il service worker della PWA. La build copia anche `public/.htaccess`, manifest e icone. Il comando `ls` deve elencare entrambi i file del service worker: se non lo fa, assicurati di aver eseguito la build production dalla radice del progetto.

### Scaricare `www/` da Codespaces al PC

FileZilla deve poter leggere i file dal computer su cui è aperto. Se stai lavorando in GitHub Codespaces, scarica prima la build sul PC:

1. Sul PC installa GitHub CLI (`gh`) e accedi al tuo account, se non lo hai già fatto:

  ```bash
  gh auth login
  ```

2. Elenca i Codespaces disponibili e annota il nome di quello che contiene Linkboard:

  ```bash
  gh codespace list
  ```

3. Sul terminale locale del PC, crea una cartella di destinazione e copia la directory `www/` dal Codespace:

  ```bash
  mkdir -p "$HOME/linkboard-deploy"
  gh codespace cp --recursive --codespace NOME_CODESPACE remote:/workspaces/codespaces-blank/www "$HOME/linkboard-deploy/"
  ```

  Sostituisci `NOME_CODESPACE` con il nome mostrato dal comando precedente. Se il percorso del workspace nel Codespace è diverso, sostituisci `/workspaces/codespaces-blank` con il percorso corretto. Al termine troverai i file in `$HOME/linkboard-deploy/www/`.

4. In FileZilla seleziona sul lato locale `$HOME/linkboard-deploy/www/` e carica **il suo contenuto** nella cartella pubblica del server, come descritto sotto.

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

La build include già `www/.htaccess`, configurato per il percorso `/linkboard/`. Caricalo insieme a `index.html` nella cartella remota `/htdocs/linkboard`. Il contenuto del file è:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /linkboard/
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule ^ index.html [L]
</IfModule>
```

Se la cartella o l'URL pubblico è diverso, modifica `RewriteBase` e `--base-href` in base al percorso:

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

Per pubblicare un aggiornamento, esegui di nuovo `npm run build` e carica il nuovo contenuto di `www/`, sovrascrivendo i file remoti. Carica anche tutti i nuovi file nella cartella `icons/`: il manifest usa nomi versionati per le icone così che i browser non riutilizzino quelle memorizzate in precedenza.

Su Android, se la PWA installata continua a mostrare la vecchia icona dopo la pubblicazione, verifica che il sito serva il nuovo `manifest.webmanifest` e le icone `icon-192x192-v2.png` e `icon-512x512-v2.png`, poi rimuovi e reinstalla la PWA da Chrome. Per evitare di perdere i dati locali dell'app, esporta prima un backup da **Impostazioni > Esporta backup**. Cancellare i dati o la cache del sito può eliminare i link salvati.
