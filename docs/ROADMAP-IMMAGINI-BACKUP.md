# Immagini nei backup

## Obiettivo

Permettere di trasferire le immagini associate ai link esportandole nel backup JSON e ripristinandole durante l'importazione, anche su un altro dispositivo.

## Stato

Da implementare. La raccolta salva già le immagini come `imageDataUrl` (JPEG ridimensionato a un massimo di 512 px), ma il backup versione 1 esporta solo ID, nome e URL e limita il file a 1 MB.

## Comportamento proposto

- L'esportazione include `imageDataUrl` solo per i link che hanno un'immagine.
- Il campo resta facoltativo: i backup esistenti versione 1 senza immagini continuano a essere importabili.
- **Unisci:** un'immagine presente nel backup aggiorna quella del link con lo stesso ID; se il backup non ne contiene una, l'immagine locale viene conservata. I nuovi link senza immagine restano senza immagine.
- **Sostituisci:** ogni link importato usa l'immagine presente nel backup; in sua assenza resta senza immagine. Le immagini della raccolta sostituita vengono rimosse.
- Il backup continua a contenere i dati come JSON autonomo, senza file aggiuntivi o richieste di rete.

## Piano di lavoro

1. **Definire e validare il formato**
   - Estendere il tipo delle voci del backup con `imageDataUrl` facoltativo.
   - Accettare le immagini generate dall'app (Data URL JPEG con Base64 valido); rifiutare valori malformati, schemi non ammessi e contenuti oltre il limite per immagine.
   - Mantenere la lettura dei backup versione 1 senza immagini. Se l'aggiunta del campo non richiede una nuova versione, continuare a esportare versione 1; introdurre una nuova versione solo se cambia la struttura incompatibilmente.

2. **Adeguare esportazione e limiti**
   - Includere le immagini nel JSON e controllare la dimensione effettiva in byte UTF-8 prima di avviare il download.
   - Sostituire il limite attuale di 1 MB con un limite complessivo esplicito, applicato sia in esportazione sia in importazione. Proposta iniziale: 10 MB, da confermare in base alle dimensioni massime desiderate per i backup.
   - Applicare lo stesso limite prima della lettura del file nell'interfaccia e durante l'analisi nel servizio, evitando controlli discordanti.
   - Mostrare messaggi chiari per backup troppo grandi o immagini non valide; non scaricare né importare un backup rifiutato.

3. **Integrare l'importazione**
   - Applicare le regole proposte per **Unisci** e **Sostituisci** nel servizio di backup.
   - Mantenere l'operazione atomica: se la persistenza configurata (localStorage o REST) fallisce, ripristinare lo stato precedente e segnalare l'errore.
   - Aggiornare anteprima, conferma e messaggio di esito per indicare se il backup contiene immagini e se verranno applicate.

4. **Aggiornare la documentazione**
   - Aggiornare la guida sul backup in `README.md` e la documentazione di formato esistente, precisando che le immagini rendono il file più grande e possono contenere dati personali.
   - Indicare il limite effettivo e la compatibilità con i backup precedenti.

5. **Verificare**
   - Testare export con e senza immagini e il rispetto del limite in byte UTF-8.
   - Testare importazione di backup precedente senza immagini e di backup con immagini valide e non valide.
   - Testare merge con immagine locale, immagine importata o assente; testare replace con e senza immagine.
   - Testare file oltre il limite e rollback in caso di errore di persistenza.
   - Verificare che un backup esportato possa essere reimportato e che le immagini risultino effettivamente associate ai link.

## Superfici coinvolte

- `src/app/link-backup.service.ts`: formato, validazione, serializzazione e regole di merge/sostituzione.
- `src/app/link-backup.service.spec.ts`: test del servizio e della compatibilità.
- `src/app/settings/settings.page.ts` e `src/app/settings/settings.page.html`: limiti, messaggi e anteprima.
- `src/app/settings/settings.page.spec.ts`: test della UI di esportazione/importazione.
- `README.md` e `docs/ROADMAP-IMPORT-EXPORT.md`: documentazione del comportamento definitivo.

## Vincoli e note

- Le immagini sono già ridotte dall'app, ma il Base64 nel JSON aumenta la dimensione dei dati; il limite va misurato sui byte del file completo, non sul numero di caratteri.
- Con persistenza REST, le immagini incluse vengono inviate al backend insieme all'intera raccolta: il backend deve accettare la dimensione risultante.
- Il backup può contenere immagini personali oltre a URL privati: va trattato come un file personale e importato solo se ne è nota la provenienza.
