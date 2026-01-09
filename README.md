# Ruota della Fortuna

Un'applicazione web interattiva che riproduce il celebre gioco televisivo "La Ruota della Fortuna". Perfetta per serate di gioco, eventi, feste o semplicemente per divertirsi con amici e familiari.

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)

---

## Indice

- [Caratteristiche](#caratteristiche)
- [Struttura del Gioco](#struttura-del-gioco)
- [Installazione](#installazione)
- [Come Giocare](#come-giocare)
- [Pannello Admin](#pannello-admin)
- [Struttura dei File](#struttura-dei-file)
- [Personalizzazione](#personalizzazione)
- [Supporta il Progetto](#supporta-il-progetto)
- [Licenza](#licenza)

---

## Caratteristiche

- **Gioco completo** con tutte le fasi del programma TV originale
- **Interfaccia moderna** con design accattivante e animazioni fluide
- **Effetti sonori** per ogni azione di gioco
- **Musica di sottofondo** nella homepage
- **Multiplayer locale** da 2 a 4 giocatori
- **Responsive design** funziona su desktop e tablet
- **Pannello admin** per gestire le frasi
- **265+ frasi precaricate** suddivise in categorie
- **Nessun server richiesto** funziona completamente offline

---

## Struttura del Gioco

Il gioco si articola in diverse fasi, completamente configurabili:

### 1. Round Fast
Velocità e intuito. Il giocatore che indovina la frase guadagna punti bonus. Vince chi è più rapido. Numero di round configurabile senza limiti.

### 2. Round Tradizionali
Gira la ruota per determinare il valore delle consonanti. Compra le vocali a €250 ciascuna. Indovina la frase per vincere il montepremi accumulato. Numero di round configurabile senza limiti.

### 3. Ultimo Round
Valore fisso per ogni consonante (determinato dalla ruota). Tutti i giocatori competono per l'ultimo round prima della finale. In caso di pareggio nel montepremi, si ripete il round.

### 4. Finale
Solo il giocatore con il montepremi più alto accede. Tre fasi a tempo: Round Finale, Testacoda, Round Libero. Indovina per vincere il premio finale.

---

## Installazione

### Requisiti
- Un browser web moderno (Chrome, Firefox, Edge, Safari)
- Nessuna installazione aggiuntiva richiesta

### Avvio rapido

1. **Scarica il progetto**
   ```bash
   git clone https://github.com/DiMichele/Ruota-Della-Fortuna.git
   ```

2. **Apri il gioco**
   - Naviga nella cartella del progetto
   - Apri `game.html` con il tuo browser

3. **Gioca**
   - Inserisci i nomi dei giocatori
   - Configura i round desiderati
   - Premi "Inizia Partita"

---

## Come Giocare

### Configurazione Iniziale
1. Inserisci i nomi dei giocatori (2-4 giocatori)
2. Seleziona quanti round Fast vuoi giocare (nessun limite massimo)
3. Seleziona quanti round Tradizionali vuoi giocare (nessun limite massimo)
4. Attiva/disattiva l'Ultimo Round
5. Clicca su "Inizia Partita"

### Durante il Gioco
- **Gira la Ruota**: Clicca sul pulsante della ruota o inserisci il valore
- **Consonanti**: Inserisci una consonante e conferma
- **Vocali**: Costa €250 - clicca "Compra Vocale"
- **Soluzione**: Inserisci la frase completa per vincere il round

### Caselle Speciali della Ruota

| Casella | Effetto |
|---------|---------|
| Valori | Da €100 a €2000 per consonante |
| PASSA | Passa il turno al prossimo giocatore |
| BANCAROTTA | Perdi tutto il montepremi del round |
| JOLLY | Ottieni un jolly (usalo come vocale gratis) |
| EXPRESS | Modalità veloce - continua finché non sbagli |
| RADDOPPIA | Raddoppia il valore della prossima consonante |

---

## Pannello Admin

Accedi al pannello admin cliccando sull'icona impostazioni in alto a destra.

### Funzionalità
- **Aggiungi nuove frasi** con categoria
- **Modifica frasi esistenti**
- **Elimina frasi**
- **Visualizza statistiche** delle frasi per categoria
- **Mostra/Nascondi** la frase corrente
- **Esporta/Importa** l'archivio frasi in JSON

### Categorie Disponibili
Sport, Film, Canzoni, Proverbi, Modi di Dire, Luoghi, Cibi, Animali, Natura, Arte, Scienza, Storia, Geografia, Tecnologia, Moda, Musica, Letteratura, Teatro, Televisione, Fumetti, Videogiochi, Economia, Politica, Religione, Filosofia, e molte altre.

---

## Struttura dei File

```
Ruota-della-Fortuna/
├── game.html                 # Pagina principale del gioco
├── README.md                 # Documentazione
├── .gitignore               # File ignorati da Git
└── resources/
    ├── admin.html           # Pannello di amministrazione
    ├── app.js               # Logica del gioco
    ├── styles.css           # Stili CSS
    ├── phrases.json         # Archivio frasi
    ├── wheel-icon.svg       # Icona della ruota
    ├── paypal_logo_icon.png # Icona PayPal
    ├── homepage_soundtrack.mp3  # Musica homepage
    ├── letter_sound.mp3     # Suono lettere
    ├── click3.wav           # Suono click
    ├── victoire2.mp3        # Suono vittoria
    ├── passa_sound.mp3      # Suono "Passa"
    └── bancarotta_sound.mp3 # Suono "Bancarotta"
```

---

## Personalizzazione

### Aggiungere Nuove Frasi
1. Apri il pannello Admin
2. Clicca "Aggiungi Frase"
3. Inserisci categoria e frase
4. Salva

### Modificare i Suoni
Sostituisci i file audio nella cartella `resources/` mantenendo gli stessi nomi.

### Personalizzare l'Aspetto
Modifica il file `resources/styles.css` per cambiare colori, font e layout.

---

## Supporta il Progetto

Se ti piace questo progetto e vuoi supportare lo sviluppo:

[![PayPal](https://img.shields.io/badge/PayPal-Dona-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://paypal.me/dimichele99)

---

## Autore

**Michele Di Gennaro**

- GitHub: [@DiMichele](https://github.com/DiMichele)
- PayPal: [paypal.me/dimichele99](https://paypal.me/dimichele99)

---

## Licenza

Questo progetto è distribuito con licenza MIT. Sei libero di usare, modificare e distribuire questo software.

---

## Ringraziamenti

- Ispirato al celebre game show "La Ruota della Fortuna"
- Grazie a tutti coloro che contribuiscono con suggerimenti e feedback
