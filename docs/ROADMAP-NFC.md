# Roadmap: chiamare un link tramite NFC

## Obiettivo

Associare un tag NFC a uno dei link configurati in Linkboard e, quando il telefono lo legge, inviare la stessa richiesta GET che oggi parte dal pulsante del link. La schermata deve mostrare l'esito della chiamata.

**Perimetro PWA:** Android in primo piano; l'utente avvia la scansione dalla home. La PWA non gestisce i tag con app chiusa o in background. Il branch `feature/native-nfc` aggiunge una piattaforma Android Capacitor per ricevere il record NDEF via intent anche all'avvio dell'app.

## Comportamento attuale da preservare

- I link sono salvati nel `localStorage` del browser; non sono sincronizzati tra dispositivi.
- Il pulsante della home invia una richiesta HTTP GET tramite Angular `HttpClient`, con timeout di 15 secondi e feedback di successo o errore.
- Il browser può bloccare la richiesta se il server del link non consente CORS.
- La PWA e l'app Android nativa hanno archivi locali distinti; per risolvere gli ID NFC nell'app occorre importare un backup con gli stessi link.

## Vincoli della soluzione PWA

La PWA può leggere tag NFC con Web NFC soltanto in condizioni supportate dal browser e dal dispositivo: in pratica Android con Chrome, pagina servita in HTTPS e app aperta in primo piano. Linkboard tenta l'avvio automatico entrando nella home, ma il browser può richiedere un gesto esplicito: in quel caso l'utente deve toccare il pulsante di scansione. La scansione non continua quando la PWA è chiusa o in background.

L'app Android Capacitor usa un intent filter per il MIME `application/vnd.linkboard.tag`, lo stesso scritto dalla PWA e dall'app. Quando Android consegna il tag all'app, il plugin nativo estrae l'ID, la home attende il caricamento dei link e invia la GET. L'app può anche scrivere un tag con questo formato dalla pagina di configurazione. Il comportamento di apertura dipende da NFC attivo, stato del dispositivo e versione Android; non è garantito a schermo bloccato.

## Fasi proposte

### 1. Definire il flusso NFC

- Un tag identifica una sola associazione; uno stesso link può avere più tag.
- Linkboard scrive sul tag un identificativo opaco e conserva localmente l'associazione all'ID del link.
- In caso di tag sconosciuto, link eliminato, NFC non supportato o permesso negato, mostrare un messaggio esplicito.

**Stato:** flusso PWA e flusso nativo implementati; resta necessaria la verifica su un telefono Android e su tag NFC reali. I dati della PWA non sono condivisi automaticamente con l'app nativa: importare un backup conserva gli ID associati ai tag.

### 2. Verificare compatibilità e API

- Verificare `NDEFReader` e la disponibilità di Web NFC sul telefono Android e sulla versione di Chrome di destinazione.
- Verificare il comportamento della PWA installata, i permessi e l'accesso HTTPS sull'URL pubblicato.
- Definire il formato del record NDEF e come distinguere in modo stabile un tag già associato.
- Documentare i browser e i dispositivi non supportati e offrire un messaggio chiaro senza compromettere l'uso manuale dei link.

### 3. Progettare associazioni e conservazione dati

- Estendere il modello locale con associazioni fra identificativo del tag e ID del link, senza incorporare URL arbitrari nei dati NFC.
- Validare le associazioni caricate dal `localStorage` e gestire riferimenti a link rimossi o modificati.
- Decidere se le associazioni devono essere trasferibili: oggi i dati restano sul singolo browser e non vengono sincronizzati.
- Evitare di sovrascrivere accidentalmente dati già presenti sul tag; chiedere conferma quando necessario.

### 4. Aggiungere l'esperienza NFC

- Aggiungere una sezione accessibile dalla configurazione per associare un tag a un link esistente.
- Mostrare chiaramente gli stati di attesa, scansione, associazione completata e errore.
- Aggiungere alla home un comando per avviare/interrompere la scansione e ascoltare i tag solo mentre la scansione è attiva.
- Alla lettura di un tag associato, riutilizzare la logica di chiamata GET esistente e mostrare il risultato nella home.
- Prevenire chiamate duplicate dovute a letture ripetute dello stesso tag durante una singola scansione.

### 5. Test e rilascio

- Aggiungere test unitari per validazione e risoluzione delle associazioni, errori e link rimossi.
- Testare la scansione reale su un dispositivo Android compatibile e tag NFC NDEF; i test automatici da browser non sostituiscono la prova con hardware.
- Verificare assenza di chiamate quando si legge un tag sconosciuto e corretta gestione di timeout, errori HTTP e CORS.
- Aggiornare le istruzioni di pubblicazione e d'uso, specificando HTTPS, browser supportati e necessità di tenere Linkboard aperta.

## Criteri di completamento del percorso PWA

- L'utente può associare un tag a un link configurato senza modificare manualmente i dati del browser.
- Dopo aver avviato la scansione in Linkboard, avvicinare il tag associato invia una sola richiesta GET al link corretto.
- L'esito usa lo stesso feedback e la stessa gestione degli errori del pulsante esistente.
- Tag sconosciuti, API NFC non disponibili e permessi negati producono messaggi espliciti; il lancio manuale dei link continua a funzionare.
- Non viene dichiarato supporto per scansione in background o a schermo bloccato.

## Fuori ambito del primo rilascio

- Avvio automatico della chiamata con app chiusa, in background o telefono bloccato.
- Sincronizzazione delle associazioni fra browser o dispositivi.
- Scrittura automatica di tag senza conferma dell'utente.
