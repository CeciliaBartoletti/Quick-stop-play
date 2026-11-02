# ⚡ Quick Girls — Edizione completa v2.0

**Un party game originale, per 3–6 amiche online da telefono**, con stanze private, carte-lettera segrete, categorie miste, 2 modalità di risposta, punteggi e audio opzionale. Non è un gioco ufficiale Quickstop e non è affiliato al suo editore.

## ✨ Funzionalità

- Stanze private con codice alfanumerico casuale di **6 caratteri**, link condivisibile (anche tramite WhatsApp).
- **3–6 giocatrici**, cinque carte con **lettere diverse** per ciascuna; le carte sono visibili solo alla proprietaria.
- Argomenti originali classici, divertenti e girls, modalità **Mix** predefinita; fino a 25 argomenti personalizzati per stanza.
- **Scritto:** scegli lettera, inserisci una parola che inizi con quella lettera e invia.
- **Voce:** pronuncia una parola e premi «Ho detto la parola»; testo facoltativo. Microfono integrato tramite **WebRTC** (senza registrazioni) oppure chiamata esterna.
- Il server accetta la **prima proposta**; la host approva o rifiuta la pertinenza. I controlli automatici verificano lettera, carta e duplicati scritti. C'è un timeout di 45 secondi per le verifiche in sospeso.
- Dopo **3 risposte approvate**, cambio automatico del tema. La host può anche saltare un tema dopo 10 secondi.
- Chi finisce le proprie carte vince la manche: **+5 punti bonus** più **+1 punto per ogni carta scartata** da ciascuna giocatrice. Classifica e storico degli ultimi 20 round.
- Riconnessione con identità/carte/punteggi sullo stesso browser; host trasferibile e possibilità di espellere dalla lobby.
- App installabile su molti telefoni (**PWA**), interfaccia responsive e accessibile, WebSocket real-time, dati su SQLite locale.
- **Senza dipendenze npm:** basta Node.js, versione **24 consigliata** (minimo 22.13), senza build frontend.

## ▶️ Avvia sul computer (e prova dal telefono)

1. Installa **Node.js 24** da https://nodejs.org.
2. Apri un terminale dentro la cartella estratta `quick-girls`.
3. Esegui `npm start` (oppure `node server.js`).
4. Vai su **http://localhost:3000** dal computer. Per provare dal telefono sulla stessa rete Wi-Fi puoi aprire `http://IP-DEL-COMPUTER:3000`; il browser potrebbe richiedere HTTPS per il microfono.
5. Per fare la prima partita: crea la stanza, condividi il link e entra da altri 2–5 dispositivi.

Per eseguire i test automatici: `npm test`.

## 🌐 Pubblicazione gratuita (Render Free)

**Questa edizione include già `render.yaml` con `plan: free` e senza disco a pagamento.** Puoi pubblicare l'app per giocare con 3–6 amiche senza acquistare un dominio. Verifica sempre il piano selezionato prima di confermare il deploy.

1. Crea un account su https://github.com, poi un repository, anche privato, chiamato `quick-girls`.
2. Estrai lo ZIP e carica nel repository **il contenuto della cartella** `quickgirls-gratis`: i file come `server.js` e `render.yaml` devono essere alla radice del repository. Per esempio su GitHub puoi usare **Add file → Upload files** e trascinare i file e le cartelle.
3. Apri https://dashboard.render.com e seleziona **New → Blueprint**.
4. Collega il repository GitHub: Render individua il `render.yaml` e propone un Web Service con piano **Free**. Verifica che compaia **Free / $0** e che non ci siano dischi o servizi a pagamento.
5. Avvia il deploy, aspetta che sia pronto e apri l'indirizzo HTTPS fornito da Render (esempio indicativo: `https://quick-girls-xxxx.onrender.com`).
6. Premi **Crea stanza**, condividi il link via WhatsApp, fai entrare le amiche e avvia la partita quando siete 3–6.

### ⚠️ Limiti del piano gratuito (importante)

- Dopo **15 minuti senza traffico** l'istanza può essere sospesa; il risveglio richiede tempo. Le connessioni WebSocket possono interrompersi, ma l'app tenta di riconnettersi.
- **Stanze, token e punteggi vengono persi** dopo una sospensione, un riavvio o un nuovo deploy: nel piano Free i file SQLite sono effimeri. Una partita può quindi essere interrotta e richiedere una nuova stanza.
- La disponibilità non è garantita e sono previsti limiti mensili di utilizzo. Il piano gratuito è pensato per test e giochi occasionali, non per garantire un servizio sempre disponibile.
- **La modalità voce richiede HTTPS**, incluso nel sito Render, ma alcune reti possono bloccare WebRTC: in tal caso usate una chiamata WhatsApp o Meet mentre giocate.
- Non è necessario inserire una carta di credito nel codice dell'app. Se Render mostra un'opzione a pagamento, **non confermarla**: torna alla schermata di scelta del piano e verifica `Free`.

Fonti Render (documentazione ufficiale): https://render.com/docs/free e https://render.com/docs/your-first-deploy.

### Vuoi dati conservati senza pagare?

Per conservare punteggi e stanze tra i riavvii serve **un database esterno gratuito** e un aggiornamento del backend (questa edizione usa SQLite locale). Per esempio Supabase Free mette a disposizione un database, ma può sospendere progetti inattivi e ha quote. Una strada alternativa è riscrivere il backend per Cloudflare Durable Objects, che offre un livello gratuito con storage persistente. **Nessuna delle due opzioni è già integrata in questa edizione.**

## 🎧 Audio integrato, come funziona

In modalità **Voce**, quando una partita è iniziata, le partecipanti toccano *Attiva audio* e danno il consenso al microfono. Il browser realizza una connessione audio diretta **WebRTC** fra le giocatrici; i suoni non sono registrati e non vengono salvati nel database. Un server STUN pubblico aiuta a stabilire la connessione; su alcune reti mobili, scolastiche o aziendali può servire un servizio **TURN**. Puoi configurarlo tramite `TURN_URL`, `TURN_USERNAME` e `TURN_CREDENTIAL` (variabili d'ambiente su Render). Senza TURN, e in assenza di connessione diretta, consigliamo una chiamata WhatsApp o Meet parallela. Il browser può chiedere un gesto dell'utente per riprodurre audio e il microfono richiede HTTPS in produzione.

La modalità **Voce** non trascrive automaticamente le parole: le risposte vengono convalidate dalla host dopo che chi parla ha giocato la carta. Questa scelta evita i problemi di riconoscimento vocale in un ambiente rumoroso.

## 🔐 Privacy, dati e limiti realistici

- Il **codice/link è la chiave d'accesso** alla stanza: condividilo solo con le persone che vuoi invitare. Non sono previsti account/password.
- Il database SQLite conserva nickname, punteggi, stanze, carte, risposte e token di riconnessione. Le stanze inattive da **7 giorni** sono cancellate automaticamente.
- Il browser conserva un token per ritrovare la tua stanza; cancellando i dati del sito potresti perdere l'accesso allo stesso posto. Se la host è offline, una giocatrice online può ricevere il ruolo.
- La verifica delle risposte è **umana**: la host ha l'ultima parola, soprattutto nella modalità voce. Nessuna intelligenza artificiale giudica il senso delle risposte.
- L'audio non viene registrato, ma è inviato in tempo reale alle altre giocatrici via WebRTC. Con TURN, il traffico audio può attraversare il relay configurato.
- Il servizio ospitato ha bisogno di un **processo Node.js sempre disponibile**; GitHub Pages/hosting statico da soli non bastano per sincronizzare le giocatrici.
- Il server WebSocket e il gioco sono stati testati automaticamente con più giocatrici simulate; **l'audio tra telefoni, gli ecosistemi iOS/Android, le reti mobili e il deploy sul tuo account non sono stati verificati dal vivo** e vanno collaudati con un gruppo reale prima di una serata importante.

## 🗂️ Struttura del progetto

```text
quick-girls/
├── server.js                  # Server HTTP + logica multiplayer
├── ws.js                      # Trasporto WebSocket nativo
├── game.js                    # Regole, punteggio, carte e stato per giocatrice
├── topics.js                  # Argomenti originali
├── store.js                   # Database SQLite persistente
├── public/
│   ├── index.html             # Interfaccia mobile
│   ├── style.css              # Grafica colorata
│   ├── app.js                 # Logica del client + audio WebRTC
│   ├── sw.js                  # PWA service worker
│   ├── manifest.webmanifest
│   ├── icon.svg, icon-192.png, icon-512.png
├── tests/                     # Test automatici multiplayer
├── render.yaml                # Pubblicazione gratuita Render (senza disco)
├── .node-version              # Node 24
└── package.json
```

## Come condividere il link

Il link ha la forma `https://tuo-sito/?room=ABC123`. Chi apre il link inserisce il nickname, poi preme **Entra con il codice**. Chi ha già giocato sulla stessa app può essere riconosciuta automaticamente dal browser.

© Contenuti e codice originali di questo progetto, realizzati per un party game tra amiche.
