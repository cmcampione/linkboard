# Roadmap: cifratura di link e tag

## Obiettivo

Proteggere i link salvati in Linkboard e i dati associati ai tag NFC, in modo che URL e nomi non siano leggibili da chi accede ai dati persistiti o ai backup. La cifratura deve avvenire nel client, prima che i dati vengano salvati in `localStorage` o inviati a un eventuale server REST.

## Stato attuale

- La persistenza predefinita usa `localStorage`.
- È disponibile un repository REST di esempio, ma il backend non è incluso nel progetto.
- I backup JSON includono ID, nomi e URL in chiaro.
- I tag NFC contengono l'ID del link, non il suo URL.

## Modello di sicurezza e limiti

- Cifrare i dati nel browser prima della persistenza, così che storage e server ricevano solo contenuti cifrati.
- Derivare la chiave da una passphrase scelta dall'utente; non salvare la passphrase o la chiave derivata.
- La perdita della passphrase rende i dati non recuperabili, salvo un eventuale meccanismo di recupero progettato separatamente.
- La cifratura dei dati persistiti non protegge da codice malevolo eseguito nella pagina, da un dispositivo compromesso o da chi usa Linkboard quando è già sbloccata.
- Il blocco dell'app riduce l'esposizione, ma JavaScript non può garantire la cancellazione sicura della chiave dalla memoria.
- Un tag NFC può essere letto e copiato: non deve essere considerato un fattore di autenticazione.

## Fasi proposte

### 1. Definire perimetro e comportamento

- Stabilire quali dati cifrare: link, associazioni NFC, eventuali immagini e dati derivati.
- Definire quando chiedere la passphrase, come bloccare la raccolta e se prevedere sblocco automatico.
- Per la prima versione, proteggere dati locali e backup; trattare l'integrazione REST come fase successiva.

### 2. Progettare il formato crittografico

- Usare la Web Crypto API disponibile nel browser.
- Cifrare con AES-GCM e derivare la chiave dalla passphrase tramite un algoritmo di derivazione robusto e un sale casuale.
- Generare un nonce distinto per ogni cifratura e salvare con il testo cifrato le sole informazioni tecniche necessarie alla decifratura.
- Includere una versione del formato, così da poter evolvere in futuro l'algoritmo o la struttura dei dati.
- Non implementare algoritmi crittografici propri e non persistere passphrase o chiavi derivate.

### 3. Aggiungere sblocco e blocco

- Introdurre un flusso per creare una passphrase e sbloccare la raccolta esistente.
- Mantenere la chiave in memoria solo durante l'utilizzo della raccolta e rimuoverne i riferimenti al blocco o alla chiusura dell'app.
- Definire il comportamento per passphrase errata, dati non decifrabili e formato non supportato, mostrando errori espliciti senza sovrascrivere i dati.
- Richiedere lo sblocco prima di mostrare i link o avviare operazioni che ne hanno bisogno, incluse le operazioni NFC.

### 4. Cifrare persistenza e migrare i dati esistenti

- Integrare cifratura e decifratura nel flusso del repository e dello store.
- Al primo sblocco di una raccolta in chiaro, cifrare i dati esistenti.
- Rimuovere i dati originali in chiaro solo dopo aver verificato che la scrittura cifrata sia riuscita.
- Se la migrazione fallisce, conservare l'originale e informare l'utente; non simulare un salvataggio riuscito.
- Validare il contenuto dopo la decifratura prima di renderlo disponibile allo store.

### 5. Rendere i tag NFC non descrittivi

- Scrivere sul tag un token casuale e opaco, senza URL, nome o ID significativo del link.
- Conservare la corrispondenza tra token e link nella raccolta cifrata.
- Risolvere il token solo quando la raccolta è sbloccata; gestire in modo esplicito tag sconosciuti o associazioni non più valide.
- Mantenere la possibilità di copiare un tag come limite noto: la cifratura evita di esporre i dati del link sul tag, ma non autentica chi lo legge.

### 6. Proteggere backup e persistenza REST

- Aggiungere un formato di backup cifrato, protetto da passphrase e versionato.
- Conservare un percorso esplicito per importare eventuali backup in chiaro esistenti, avvisando l'utente del loro contenuto non protetto.
- Per REST, inviare e ricevere contenuti cifrati lato client, senza inviare la passphrase al server.
- Adeguare separatamente il backend, se introdotto, per autenticazione, autorizzazioni, trasporto HTTPS e conservazione dei dati cifrati.
- Non inserire segreti o chiavi nel bundle frontend.

### 7. Test, documentazione e rilascio

- Aggiungere test per cifratura/decifratura, passphrase errata, dati corrotti e formati non supportati.
- Verificare migrazione, errori di persistenza, blocco/sblocco e comportamento dopo ricaricamento dell'app.
- Testare esportazione e importazione di backup cifrati e il trattamento dei backup in chiaro.
- Verificare che un tag NFC non contenga dati descrittivi e che la scansione richieda una raccolta sbloccata.
- Aggiornare le istruzioni d'uso, spiegando passphrase, recupero, backup e limiti della protezione.

## Criteri di completamento della prima versione

- La raccolta locale persistita non contiene in chiaro i link protetti.
- La passphrase e la chiave derivata non vengono salvate né inviate al server.
- L'utente può bloccare e sbloccare la raccolta; una passphrase errata non altera i dati.
- La migrazione dei dati preesistenti non elimina la copia in chiaro finché la scrittura cifrata non è stata verificata.
- I backup cifrati possono essere importati solo fornendo la passphrase corretta.
- I tag NFC contengono solo token opachi e la loro associazione resta nei dati cifrati.
- Errori di lettura, decifratura o scrittura sono mostrati esplicitamente senza perdita silenziosa dei dati.

## Fuori ambito iniziale

- Recupero della passphrase senza un meccanismo dedicato progettato e verificato.
- Protezione da malware o script malevoli eseguiti nel contesto dell'app.
- Autenticazione dell'utente tramite il tag NFC.
- Sincronizzazione REST cifrata, finché non è definito e implementato anche il relativo backend.
