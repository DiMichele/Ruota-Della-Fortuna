/* ============================================
   RUOTA DELLA FORTUNA - APP.JS
   Logica condivisa per admin.html e game.html
   ============================================ */

// ==========================================
// COSTANTI
// ==========================================
const STORAGE_KEY_PHRASES = 'RUOTA_PHRASES_V1';
const STORAGE_KEY_SETTINGS = 'RUOTA_SETTINGS_V1';
const STORAGE_KEY_PANEL = 'RUOTA_PANEL_STATE_V1';

const BONUS_SOLUZIONE_NORMAL = 1000;
const BONUS_FAST = 1000;
const FAST_INTERVAL_MS = 3000; // 3 secondi per lettera
const FINAL_TIMER_SECONDS = 60;
const VOWEL_COST = 250;

// Layout tabellone: 12-14-14-12 = 52 celle
const BOARD_LAYOUT = [12, 14, 14, 12];
const TOTAL_CELLS = 52;

// Vocali e Consonanti
const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);
const CONSONANTS = new Set(['B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'X', 'Y', 'Z']);

// ==========================================
// STATO GLOBALE
// ==========================================
let state = {
  // Modalità: NORMAL, FAST, FINAL
  mode: 'NORMAL',
  
  // Struttura della partita
  game: {
    phase: 'SETUP', // SETUP, FAST_1, FAST_2, FAST_3, TRADITIONAL_1-5, CRUCIRUOTA, ULTIMO_ROUND, FINALE
    previousPhase: null, // Fase precedente per determinare cambio categoria
    loadedPhrases: {}, // Traccia quali fasi hanno già caricato una frase
    started: false,
    fastRoundsCompleted: 0,
    fastStreakPlayer: null, // Indice del giocatore che sta vincendo di fila
    fastStreakCount: 0,     // Quanti FAST ha vinto di fila
    traditionalRoundsCompleted: 0,
    cruciruotaCompleted: false,
    ultimoRoundCompleted: false,
    // Configurazione round
    config: {
      fastEnabled: true,
      fastCount: 3,
      traditionalEnabled: true,
      traditionalCount: 5,
      cruciruotaEnabled: true,
      cruciruotaCount: 1,
      ultimoEnabled: true,
      finaleEnabled: true
    },
    // Fasi attive (calcolate da config)
    activePhases: []
  },
  
  // Giocatori
  players: [],
  currentPlayerIndex: 0,
  
  // Frase corrente
  phrase: '',           // Frase originale (con accenti)
  phraseNormalized: '', // Frase normalizzata (senza accenti)
  category: '',
  
  // Slot del tabellone (array di oggetti)
  slots: [], // [{char, charOriginal, revealed, isSpace}]
  letterMap: new Map(), // lettera normalizzata -> Set(indici)
  
  // Lettere usate nel round corrente
  usedVowels: new Set(),
  usedConsonants: new Set(),
  
  // Archivio frasi
  phrases: [],
  phraseIndex: 0,
  phraseMode: 'random', // 'cyclic' o 'random'
  usedPhraseIndices: [], // Indici delle frasi già usate (per evitare ripetizioni)
  
  // Esito ruota corrente
  wheelValue: null,
  
  // Modalità FAST
  fast: {
    active: false,
    intervalId: null,
    remainingPositions: [],
    lastLetter: null,
    blockedPlayers: new Map(), // playerIndex -> unblockTime
    scores: new Map() // playerIndex -> score durante FAST
  },
  
  // Modalità EXPRESS
  express: {
    active: false,
    playerIndex: null,
    letterValue: 1000 // valore fisso per consonante
  },
  
  // Modalità FINAL
  final: {
    active: false,
    phase: 0, // 0=none, 1=game1, 2=testacoda, 3=round libero
    finalistIndex: null,
    lettersLocked: false,
    phasesWon: 0, // Contatore frasi indovinate (vince se >= 1)
    timer: {
      remaining: FINAL_TIMER_SECONDS,
      intervalId: null,
      running: false
    }
  },
  
  // Modalità ULTIMO ROUND
  ultimoRound: {
    active: false,
    fixedValue: 0,        // Valore fisso estratto dalla ruota
    valueSet: false       // Se il valore è stato impostato
  },
  
  // Modalità CRUCIRUOTA
  crupiruota: {
    active: false,
    usedPhraseIndices: [], // Frasi Cruciruota già usate
    savedBoards: {} // Tabelloni salvati per fase: { 'CRUCIRUOTA_1': { slots: [...], category: '...', phrase: '...', ... }, ... }
  },
  
  // UI
  ui: {
    controlPanelOpen: true,
    selectedPhraseIndex: -1
  }
};

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Normalizza il testo: maiuscolo e rimozione accenti
 */
function normalizeText(str) {
  return (str || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Sanitizza la frase: normalizza, rimuove spazi multipli e apostrofi
 */
function sanitizePhrase(raw) {
  return normalizeText(raw)
    .replace(/'\s*/g, '')  // Rimuove apostrofi e eventuali spazi dopo
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Shuffle di un array (Fisher-Yates)
 */
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Formatta il tempo in mm:ss
 */
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Ottiene timestamp formattato
 */
function getTimestamp() {
  return new Date().toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// ==========================================
// GESTIONE FRASI (JSON + localStorage)
// ==========================================

// Frasi di default (fallback se il file JSON non può essere caricato)
const DEFAULT_PHRASES = [
  // MODI DI DIRE
  { category: "MODI DI DIRE", phrase: "CHI DORME NON PIGLIA PESCI" },
  { category: "MODI DI DIRE", phrase: "MEGLIO TARDI CHE MAI" },
  { category: "MODI DI DIRE", phrase: "NON TUTTE LE CIAMBELLE RIESCONO COL BUCO" },
  { category: "MODI DI DIRE", phrase: "ACQUA IN BOCCA" },
  { category: "MODI DI DIRE", phrase: "IN BOCCA AL LUPO" },
  { category: "MODI DI DIRE", phrase: "PRENDERE DUE PICCIONI CON UNA FAVA" },
  { category: "MODI DI DIRE", phrase: "FARE DI TUTTA L'ERBA UN FASCIO" },
  { category: "MODI DI DIRE", phrase: "METTERE IL CARRO DAVANTI AI BUOI" },
  { category: "MODI DI DIRE", phrase: "AVERE LE MANI IN PASTA" },
  { category: "MODI DI DIRE", phrase: "GETTARE LA SPUGNA" },
  { category: "MODI DI DIRE", phrase: "ESSERE AL SETTIMO CIELO" },
  { category: "MODI DI DIRE", phrase: "ANDARE A LETTO CON LE GALLINE" },
  { category: "MODI DI DIRE", phrase: "CERCARE UN AGO NEL PAGLIAIO" },
  { category: "MODI DI DIRE", phrase: "AVERE LA CODA DI PAGLIA" },
  { category: "MODI DI DIRE", phrase: "METTERE I PUNTINI SULLE I" },
  
  // PROVERBI
  { category: "PROVERBI", phrase: "IL MATTINO HA L'ORO IN BOCCA" },
  { category: "PROVERBI", phrase: "CHI LA FA L'ASPETTI" },
  { category: "PROVERBI", phrase: "ROSSO DI SERA BEL TEMPO SI SPERA" },
  { category: "PROVERBI", phrase: "A CAVAL DONATO NON SI GUARDA IN BOCCA" },
  { category: "PROVERBI", phrase: "L'ERBA DEL VICINO E' SEMPRE PIU' VERDE" },
  { category: "PROVERBI", phrase: "CHI TROVA UN AMICO TROVA UN TESORO" },
  { category: "PROVERBI", phrase: "RIDE BENE CHI RIDE ULTIMO" },
  { category: "PROVERBI", phrase: "TANTO VA LA GATTA AL LARDO" },
  { category: "PROVERBI", phrase: "CHI TROPPO VUOLE NULLA STRINGE" },
  { category: "PROVERBI", phrase: "L'OCCASIONE FA L'UOMO LADRO" },
  { category: "PROVERBI", phrase: "L'UNIONE FA LA FORZA" },
  { category: "PROVERBI", phrase: "LA FRETTA E' CATTIVA CONSIGLIERA" },
  { category: "PROVERBI", phrase: "NON E' TUTTO ORO QUEL CHE LUCCICA" },
  { category: "PROVERBI", phrase: "IL TEMPO E' DENARO" },
  { category: "PROVERBI", phrase: "OGNI LASCIATA E' PERSA" },
  
  // FILM
  { category: "FILM", phrase: "IL PADRINO DI COPPOLA" },
  { category: "FILM", phrase: "LA VITA E' BELLA" },
  { category: "FILM", phrase: "NUOVO CINEMA PARADISO" },
  { category: "FILM", phrase: "IL GLADIATORE DI RIDLEY SCOTT" },
  { category: "FILM", phrase: "C'ERA UNA VOLTA IN AMERICA" },
  { category: "FILM", phrase: "L'ULTIMO IMPERATORE" },
  { category: "FILM", phrase: "LA DOLCE VITA DI FEDERICO FELLINI" },
  { category: "FILM", phrase: "OTTO E MEZZO" },
  { category: "FILM", phrase: "IL SIGNORE DEGLI ANELLI" },
  { category: "FILM", phrase: "PIRATI DEI CARAIBI" },
  { category: "FILM", phrase: "RITORNO AL FUTURO" },
  { category: "FILM", phrase: "HARRY POTTER E LA PIETRA FILOSOFALE" },
  { category: "FILM", phrase: "IL CAVALIERE OSCURO" },
  
  // CANZONI
  { category: "CANZONI", phrase: "NEL BLU DIPINTO DI BLU" },
  { category: "CANZONI", phrase: "SAPORE DI SALE DI GINO PAOLI" },
  { category: "CANZONI", phrase: "L'ITALIANO DI TOTO CUTUGNO" },
  { category: "CANZONI", phrase: "QUATTRO AMICI AL BAR" },
  { category: "CANZONI", phrase: "LA CANZONE DEL SOLE" },
  { category: "CANZONI", phrase: "NESSUN DORMA DI PUCCINI" },
  { category: "CANZONI", phrase: "IL CIELO IN UNA STANZA" },
  { category: "CANZONI", phrase: "CON TE PARTIRO'" },
  { category: "CANZONI", phrase: "VITA SPERICOLATA DI VASCO" },
  { category: "CANZONI", phrase: "UNA LACRIMA SUL VISO" },
  { category: "CANZONI", phrase: "SARÀ PERCHÉ TI AMO" },
  
  // LUOGHI
  { category: "LUOGHI", phrase: "PIAZZA SAN MARCO A VENEZIA" },
  { category: "LUOGHI", phrase: "IL COLOSSEO DI ROMA" },
  { category: "LUOGHI", phrase: "LA TORRE DI PISA" },
  { category: "LUOGHI", phrase: "IL DUOMO DI MILANO" },
  { category: "LUOGHI", phrase: "FONTANA DI TREVI" },
  { category: "LUOGHI", phrase: "LA COSTIERA AMALFITANA" },
  { category: "LUOGHI", phrase: "IL LAGO DI COMO" },
  { category: "LUOGHI", phrase: "LE CINQUE TERRE IN LIGURIA" },
  { category: "LUOGHI", phrase: "PIAZZA DEL CAMPO A SIENA" },
  { category: "LUOGHI", phrase: "I TRULLI DI ALBEROBELLO" },
  { category: "LUOGHI", phrase: "IL PONTE DI RIALTO A VENEZIA" },
  { category: "LUOGHI", phrase: "IL TEATRO ALLA SCALA DI MILANO" },
  
  // PERSONAGGI
  { category: "PERSONAGGI", phrase: "LEONARDO DA VINCI GENIO UNIVERSALE" },
  { category: "PERSONAGGI", phrase: "DANTE ALIGHIERI SOMMO POETA" },
  { category: "PERSONAGGI", phrase: "GIUSEPPE GARIBALDI EROE DEI DUE MONDI" },
  { category: "PERSONAGGI", phrase: "MICHELANGELO BUONARROTI ARTISTA RINASCIMENTALE" },
  { category: "PERSONAGGI", phrase: "GALILEO GALILEI PADRE DELLA SCIENZA" },
  { category: "PERSONAGGI", phrase: "CRISTOFORO COLOMBO NAVIGATORE GENOVESE" },
  { category: "PERSONAGGI", phrase: "GIULIO CESARE IMPERATORE ROMANO" },
  { category: "PERSONAGGI", phrase: "ALESSANDRO MANZONI SCRITTORE ITALIANO" },
  { category: "PERSONAGGI", phrase: "GIACOMO LEOPARDI POETA DI RECANATI" },
  { category: "PERSONAGGI", phrase: "MARCO POLO ESPLORATORE VENEZIANO" },
  { category: "PERSONAGGI", phrase: "GIUSEPPE VERDI COMPOSITORE ITALIANO" },
  { category: "PERSONAGGI", phrase: "RITA LEVI MONTALCINI" },
  
  // CIBI
  { category: "CIBI", phrase: "SPAGHETTI ALLA CARBONARA" },
  { category: "CIBI", phrase: "PIZZA MARGHERITA NAPOLETANA" },
  { category: "CIBI", phrase: "LASAGNE ALLA BOLOGNESE" },
  { category: "CIBI", phrase: "RISOTTO ALLA MILANESE" },
  { category: "CIBI", phrase: "GELATO ARTIGIANALE ITALIANO" },
  { category: "CIBI", phrase: "PARMIGIANA DI MELANZANE" },
  { category: "CIBI", phrase: "OSSOBUCO CON RISOTTO" },
  { category: "CIBI", phrase: "TORTELLINI IN BRODO" },
  { category: "CIBI", phrase: "COTOLETTA ALLA MILANESE" },
  { category: "CIBI", phrase: "PANNA COTTA AI FRUTTI DI BOSCO" },
  { category: "CIBI", phrase: "BISTECCA ALLA FIORENTINA" },
  
  // SPORT
  { category: "SPORT", phrase: "CALCIO DI RIGORE" },
  { category: "SPORT", phrase: "GIRO D'ITALIA IN BICICLETTA" },
  { category: "SPORT", phrase: "SERIE A DI CALCIO" },
  { category: "SPORT", phrase: "OLIMPIADI INVERNALI DI CORTINA" },
  { category: "SPORT", phrase: "LA FINALE DI CHAMPIONS LEAGUE" },
  { category: "SPORT", phrase: "IL GRAN PREMIO DI MONZA" },
  { category: "SPORT", phrase: "LA MARATONA DI NEW YORK" },
  { category: "SPORT", phrase: "I MONDIALI DI CALCIO" },
  { category: "SPORT", phrase: "LA COPPA DEL MONDO DI SCI" },
  
  // OGGETTI
  { category: "OGGETTI", phrase: "MACCHINA DA SCRIVERE" },
  { category: "OGGETTI", phrase: "TELEFONO CELLULARE MODERNO" },
  { category: "OGGETTI", phrase: "OCCHIALI DA SOLE" },
  { category: "OGGETTI", phrase: "OROLOGIO DA POLSO" },
  { category: "OGGETTI", phrase: "CHITARRA ELETTRICA ROCK" },
  { category: "OGGETTI", phrase: "MACCHINA FOTOGRAFICA DIGITALE" },
  
  // ANIMALI
  { category: "ANIMALI", phrase: "LA VOLPE E L'UVA" },
  { category: "ANIMALI", phrase: "IL LEONE RE DELLA SAVANA" },
  { category: "ANIMALI", phrase: "L'AQUILA REALE DELLE ALPI" },
  { category: "ANIMALI", phrase: "IL DELFINO TURSIOPE MEDITERRANEO" },
  { category: "ANIMALI", phrase: "LA TARTARUGA MARINA CARETTA" },
  
  // CITAZIONI FAMOSE
  { category: "CITAZIONI", phrase: "VENI VIDI VICI" },
  { category: "CITAZIONI", phrase: "ESSERE O NON ESSERE" },
  { category: "CITAZIONI", phrase: "PENSO DUNQUE SONO" },
  { category: "CITAZIONI", phrase: "IL DADO E' TRATTO" },
  { category: "CITAZIONI", phrase: "PARIGI VAL BENE UNA MESSA" },
  { category: "CITAZIONI", phrase: "L'IMPORTANTE NON E' VINCERE" },
  
  // LETTERATURA
  { category: "LETTERATURA", phrase: "I PROMESSI SPOSI" },
  { category: "LETTERATURA", phrase: "LA DIVINA COMMEDIA" },
  { category: "LETTERATURA", phrase: "IL PICCOLO PRINCIPE" },
  { category: "LETTERATURA", phrase: "PINOCCHIO DI CARLO COLLODI" },
  { category: "LETTERATURA", phrase: "IL NOME DELLA ROSA" },
  { category: "LETTERATURA", phrase: "L'INFINITO DI LEOPARDI" },
  { category: "LETTERATURA", phrase: "ORGOGLIO E PREGIUDIZIO" },
  
  // ESPRESSIONI LATINE
  { category: "LATINO", phrase: "CARPE DIEM COGLI L'ATTIMO" },
  { category: "LATINO", phrase: "AMOR VINCIT OMNIA" },
  { category: "LATINO", phrase: "IN VINO VERITAS" },
  { category: "LATINO", phrase: "MENS SANA IN CORPORE SANO" },
  
  // SCIENZA E TECNOLOGIA
  { category: "SCIENZA", phrase: "LA TEORIA DELLA RELATIVITA'" },
  { category: "SCIENZA", phrase: "IL SISTEMA SOLARE" },
  { category: "SCIENZA", phrase: "LA VIA LATTEA" },
  { category: "SCIENZA", phrase: "L'INTELLIGENZA ARTIFICIALE" },
  { category: "SCIENZA", phrase: "LA RIVOLUZIONE INDUSTRIALE" },
  { category: "SCIENZA", phrase: "IL DEOXYRIBONUCLEICO ACIDO" },
  
  // FRASI FAMOSE
  { category: "FRASI FAMOSE", phrase: "HOUSTON ABBIAMO UN PROBLEMA" },
  { category: "FRASI FAMOSE", phrase: "ET TELEFONO CASA" },
  { category: "FRASI FAMOSE", phrase: "FRANCAMENTE ME NE INFISCHIO" },
  { category: "FRASI FAMOSE", phrase: "CHE LA FORZA SIA CON TE" },
  { category: "FRASI FAMOSE", phrase: "DOMANI E' UN ALTRO GIORNO" },
  
  // MUSICA CLASSICA
  { category: "MUSICA CLASSICA", phrase: "LA QUINTA SINFONIA DI BEETHOVEN" },
  { category: "MUSICA CLASSICA", phrase: "LE QUATTRO STAGIONI DI VIVALDI" },
  { category: "MUSICA CLASSICA", phrase: "IL BARBIERE DI SIVIGLIA" },
  { category: "MUSICA CLASSICA", phrase: "LA TRAVIATA DI GIUSEPPE VERDI" },
  
  // STORIA
  { category: "STORIA", phrase: "LA CADUTA DEL MURO DI BERLINO" },
  { category: "STORIA", phrase: "LA SCOPERTA DELL'AMERICA" },
  { category: "STORIA", phrase: "LA RIVOLUZIONE FRANCESE" },
  { category: "STORIA", phrase: "L'UNITA' D'ITALIA" },
  { category: "STORIA", phrase: "LA PRIMA GUERRA MONDIALE" },
  { category: "STORIA", phrase: "L'IMPERO ROMANO D'OCCIDENTE" },
  { category: "STORIA", phrase: "LA SECONDA GUERRA MONDIALE" },
  { category: "STORIA", phrase: "IL RINASCIMENTO ITALIANO" },
  { category: "STORIA", phrase: "LA GUERRA FREDDA TRA USA E URSS" },
  
  // GEOGRAFIA
  { category: "GEOGRAFIA", phrase: "IL MONTE BIANCO NELLE ALPI" },
  { category: "GEOGRAFIA", phrase: "IL MAR MEDITERRANEO" },
  { category: "GEOGRAFIA", phrase: "LE DOLOMITI PATRIMONIO UNESCO" },
  { category: "GEOGRAFIA", phrase: "IL FIUME PO IN PIANURA PADANA" },
  { category: "GEOGRAFIA", phrase: "L'ETNA VULCANO ATTIVO" },
  { category: "GEOGRAFIA", phrase: "LA SARDEGNA ISOLA DEL MEDITERRANEO" },
  { category: "GEOGRAFIA", phrase: "IL VESUVIO DOMINA NAPOLI" },
  { category: "GEOGRAFIA", phrase: "LA SICILIA TRINACRIA" },
  
  // TELEVISIONE
  { category: "TELEVISIONE", phrase: "FESTIVAL DI SANREMO" },
  { category: "TELEVISIONE", phrase: "LA RUOTA DELLA FORTUNA" },
  { category: "TELEVISIONE", phrase: "CHI VUOL ESSERE MILIONARIO" },
  { category: "TELEVISIONE", phrase: "STRISCIA LA NOTIZIA" },
  { category: "TELEVISIONE", phrase: "IL GRANDE FRATELLO" },
  { category: "TELEVISIONE", phrase: "DOMENICA IN SU RAI UNO" },
  { category: "TELEVISIONE", phrase: "L'EREDITA' SU RAI UNO" },
  
  // NATURA
  { category: "NATURA", phrase: "L'ARCOBALENO DOPO LA PIOGGIA" },
  { category: "NATURA", phrase: "IL TRAMONTO SUL MARE" },
  { category: "NATURA", phrase: "LA FORESTA AMAZZONICA" },
  { category: "NATURA", phrase: "LE CASCATE DEL NIAGARA" },
  { category: "NATURA", phrase: "L'AURORA BOREALE NEL CIELO" },
  { category: "NATURA", phrase: "IL DESERTO DEL SAHARA" },
  { category: "NATURA", phrase: "LA BARRIERA CORALLINA AUSTRALIANA" },
  
  // FESTIVITA
  { category: "FESTIVITA", phrase: "IL PRANZO DI NATALE" },
  { category: "FESTIVITA", phrase: "LA NOTTE DI CAPODANNO" },
  { category: "FESTIVITA", phrase: "FERRAGOSTO AL MARE" },
  { category: "FESTIVITA", phrase: "LA PASQUA IN FAMIGLIA" },
  { category: "FESTIVITA", phrase: "IL CARNEVALE DI VENEZIA" },
  { category: "FESTIVITA", phrase: "LA FESTA DELLA REPUBBLICA" },
  { category: "FESTIVITA", phrase: "HALLOWEEN DOLCETTO O SCHERZETTO" },
  
  // MESTIERI
  { category: "MESTIERI", phrase: "IL MEDICO IN OSPEDALE" },
  { category: "MESTIERI", phrase: "L'AVVOCATO IN TRIBUNALE" },
  { category: "MESTIERI", phrase: "IL CUOCO IN CUCINA" },
  { category: "MESTIERI", phrase: "L'ARCHITETTO E IL PROGETTO" },
  { category: "MESTIERI", phrase: "IL PILOTA DI AEREO" },
  { category: "MESTIERI", phrase: "L'INSEGNANTE A SCUOLA" },
  { category: "MESTIERI", phrase: "IL POMPIERE SPEGNE L'INCENDIO" },
  
  // FAVOLE E FIABE
  { category: "FAVOLE", phrase: "CAPPUCCETTO ROSSO E IL LUPO" },
  { category: "FAVOLE", phrase: "BIANCANEVE E I SETTE NANI" },
  { category: "FAVOLE", phrase: "LA BELLA ADDORMENTATA NEL BOSCO" },
  { category: "FAVOLE", phrase: "CENERENTOLA E LA SCARPETTA" },
  { category: "FAVOLE", phrase: "IL GATTO CON GLI STIVALI" },
  { category: "FAVOLE", phrase: "HANSEL E GRETEL" },
  { category: "FAVOLE", phrase: "LA SIRENETTA DI ANDERSEN" },
  
  // TRASPORTI
  { category: "TRASPORTI", phrase: "IL TRENO AD ALTA VELOCITA" },
  { category: "TRASPORTI", phrase: "L'AEREO SUPERSONICO CONCORDE" },
  { category: "TRASPORTI", phrase: "LA METROPOLITANA DI MILANO" },
  { category: "TRASPORTI", phrase: "IL TRAM STORICO DI MILANO" },
  { category: "TRASPORTI", phrase: "LA GONDOLA A VENEZIA" },
  { category: "TRASPORTI", phrase: "IL TRAGHETTO PER LA SARDEGNA" },
  
  // ARTE
  { category: "ARTE", phrase: "LA GIOCONDA DI LEONARDO" },
  { category: "ARTE", phrase: "LA CAPPELLA SISTINA" },
  { category: "ARTE", phrase: "IL DAVID DI MICHELANGELO" },
  { category: "ARTE", phrase: "LA NASCITA DI VENERE" },
  { category: "ARTE", phrase: "L'ULTIMA CENA DI LEONARDO" },
  { category: "ARTE", phrase: "LA PRIMAVERA DI BOTTICELLI" },
  { category: "ARTE", phrase: "GLI UFFIZI DI FIRENZE" },
  
  // ECONOMIA
  { category: "ECONOMIA", phrase: "LA BORSA DI MILANO" },
  { category: "ECONOMIA", phrase: "IL MADE IN ITALY" },
  { category: "ECONOMIA", phrase: "L'EURO MONETA EUROPEA" },
  { category: "ECONOMIA", phrase: "IL COMMERCIO INTERNAZIONALE" },
  
  // MODA
  { category: "MODA", phrase: "LA SETTIMANA DELLA MODA" },
  { category: "MODA", phrase: "GIORGIO ARMANI RE DELLA MODA" },
  { category: "MODA", phrase: "LA SFILATA DI ALTA MODA" },
  { category: "MODA", phrase: "IL TESSUTO DI SETA" },
  
  // TECNOLOGIA
  { category: "TECNOLOGIA", phrase: "LO SMARTPHONE DI ULTIMA GENERAZIONE" },
  { category: "TECNOLOGIA", phrase: "IL COMPUTER PORTATILE" },
  { category: "TECNOLOGIA", phrase: "LA CONNESSIONE A INTERNET" },
  { category: "TECNOLOGIA", phrase: "I SOCIAL NETWORK" },
  { category: "TECNOLOGIA", phrase: "LA REALTA' VIRTUALE" },
  
  // GIOCHI
  { category: "GIOCHI", phrase: "GLI SCACCHI GIOCO DEGLI RE" },
  { category: "GIOCHI", phrase: "IL GIOCO DELL'OCA" },
  { category: "GIOCHI", phrase: "MONOPOLI IL GIOCO DA TAVOLO" },
  { category: "GIOCHI", phrase: "LA TOMBOLA DI NATALE" },
  { category: "GIOCHI", phrase: "IL CRUCIVERBA ENIGMISTICO" },
  
  // BEVANDE
  { category: "BEVANDE", phrase: "IL CAFFE' ESPRESSO ITALIANO" },
  { category: "BEVANDE", phrase: "IL VINO ROSSO TOSCANO" },
  { category: "BEVANDE", phrase: "IL CAPPUCCINO AL BAR" },
  { category: "BEVANDE", phrase: "L'ACQUA MINERALE FRIZZANTE" },
  { category: "BEVANDE", phrase: "LO SPRITZ APERITIVO VENETO" },
  
  // MONUMENTI
  { category: "MONUMENTI", phrase: "LA STATUA DELLA LIBERTA'" },
  { category: "MONUMENTI", phrase: "LA TORRE EIFFEL DI PARIGI" },
  { category: "MONUMENTI", phrase: "IL BIG BEN DI LONDRA" },
  { category: "MONUMENTI", phrase: "LA GRANDE MURAGLIA CINESE" },
  { category: "MONUMENTI", phrase: "LE PIRAMIDI DI GIZA" },
  { category: "MONUMENTI", phrase: "IL TAJ MAHAL IN INDIA" },
  
  // SUPERSTIZIONI
  { category: "SUPERSTIZIONI", phrase: "IL GATTO NERO PORTA SFORTUNA" },
  { category: "SUPERSTIZIONI", phrase: "ROMPERE UNO SPECCHIO" },
  { category: "SUPERSTIZIONI", phrase: "PASSARE SOTTO UNA SCALA" },
  { category: "SUPERSTIZIONI", phrase: "IL QUADRIFOGLIO PORTA FORTUNA" },
  { category: "SUPERSTIZIONI", phrase: "TOCCARE FERRO PORTA BENE" },
  
  // EMOZIONI
  { category: "EMOZIONI", phrase: "LACRIME DI GIOIA" },
  { category: "EMOZIONI", phrase: "UN COLPO DI FULMINE" },
  { category: "EMOZIONI", phrase: "FARFALLE NELLO STOMACO" },
  { category: "EMOZIONI", phrase: "LA FELICITA' E' CONTAGIOSA" },
  
  // SPAZIO
  { category: "SPAZIO", phrase: "IL PRIMO UOMO SULLA LUNA" },
  { category: "SPAZIO", phrase: "LA STAZIONE SPAZIALE INTERNAZIONALE" },
  { category: "SPAZIO", phrase: "IL SISTEMA SOLARE" },
  { category: "SPAZIO", phrase: "UN BUCO NERO NELLO SPAZIO" },
  { category: "SPAZIO", phrase: "LA COMETA DI HALLEY" }
];

/**
 * Carica le frasi dal file JSON e le combina con quelle in localStorage
 */
async function loadPhrases() {
  // Prima carica dal localStorage (frasi aggiunte dall'utente)
  let localPhrases = [];
  try {
    const data = localStorage.getItem(STORAGE_KEY_PHRASES);
    localPhrases = data ? JSON.parse(data) : [];
  } catch (e) {
    localPhrases = [];
  }
  
  // Usa direttamente le frasi di default (evita errori CORS con file://)
  // Le frasi custom vengono salvate in localStorage
  let jsonPhrases = [...DEFAULT_PHRASES];
  
  // Combina: prima le frasi di default, poi quelle locali (evitando duplicati)
  const allPhrases = [...jsonPhrases];
  
  for (const localPhrase of localPhrases) {
    const exists = allPhrases.some(p => 
      p.phrase === localPhrase.phrase && p.category === localPhrase.category
    );
    if (!exists) {
      allPhrases.push(localPhrase);
    }
  }
  
  state.phrases = allPhrases;
  
  // Se in modalità random, mescola immediatamente l'array per evitare pattern basati sulla categoria
  if (state.phraseMode === 'random' && state.phrases.length > 0) {
    const shuffled = [...state.phrases];
    // Mescola più volte per una migliore randomizzazione
    for (let shuffleRound = 0; shuffleRound < 3; shuffleRound++) {
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
    }
    state.phrases = shuffled;
    
  }
}

/**
 * Carica le frasi in modo sincrono (fallback per inizializzazione)
 */
function loadPhrasesSync() {
  try {
    const data = localStorage.getItem(STORAGE_KEY_PHRASES);
    state.phrases = data ? JSON.parse(data) : [];
  } catch (e) {
    state.phrases = [];
  }
}

/**
 * Salva le frasi nel localStorage (le frasi del JSON rimangono nel file)
 */
function savePhrases() {
  try {
    localStorage.setItem(STORAGE_KEY_PHRASES, JSON.stringify(state.phrases));
  } catch (e) {
  }
}

/**
 * Carica le impostazioni dal localStorage
 */
function loadSettings() {
  try {
    const data = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (data) {
      const settings = JSON.parse(data);
      // Se la modalità salvata è 'cyclic', forzala a 'random' per garantire randomizzazione
      // L'utente può cambiarla se necessario, ma di default deve essere random
      if (settings.phraseMode === 'cyclic') {
        state.phraseMode = 'random';
        // Salva la nuova modalità
        saveSettings();
      } else {
        state.phraseMode = settings.phraseMode || 'random';
      }
    } else {
      // Nessuna impostazione salvata, usa 'random' di default
      state.phraseMode = 'random';
    }
  } catch (e) {
    // In caso di errore, usa 'random' di default
    state.phraseMode = 'random';
  }
}

/**
 * Salva le impostazioni nel localStorage
 */
function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify({
      phraseMode: state.phraseMode
    }));
  } catch (e) {
  }
}

/**
 * Carica lo stato del pannello dal localStorage
 */
function loadPanelState() {
  try {
    const data = localStorage.getItem(STORAGE_KEY_PANEL);
    if (data !== null) {
      state.ui.controlPanelOpen = JSON.parse(data);
    }
  } catch (e) {
  }
}

/**
 * Salva lo stato del pannello nel localStorage
 */
function savePanelState() {
  try {
    localStorage.setItem(STORAGE_KEY_PANEL, JSON.stringify(state.ui.controlPanelOpen));
  } catch (e) {
  }
}

// ==========================================
// GESTIONE FRASI
// ==========================================

/**
 * Aggiunge una frase all'archivio
 * Salva la frase originale (con accenti) - la normalizzazione avviene solo in fase di gioco
 */
function addPhrase(category, phrase) {
  // Pulisci la frase ma mantieni gli accenti
  const cleaned = (phrase || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
  
  if (!cleaned) {
    return { ok: false, msg: 'Frase vuota.' };
  }
  
  // Per la validazione della lunghezza, conta le celle effettive
  const cellsNeeded = countPhraseCells(cleaned);
  
  if (cellsNeeded > TOTAL_CELLS) {
    return { 
      ok: false, 
      msg: `Frase troppo lunga: ${cellsNeeded} celle (max ${TOTAL_CELLS}).` 
    };
  }
  
  state.phrases.push({
    category: (category || '').trim().toUpperCase(),
    phrase: cleaned, // Salva con accenti
    createdAt: Date.now()
  });
  
  // Se in modalità random, rimischia l'array dopo aver aggiunto la frase
  // per mantenere l'ordine casuale e evitare pattern basati sulla categoria
  if (state.phraseMode === 'random' && state.phrases.length > 1) {
    const shuffled = [...state.phrases];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    state.phrases = shuffled;
  }
  
  savePhrases();
  return { ok: true, msg: 'Frase aggiunta.' };
}

/**
 * Modifica una frase esistente
 */
function editPhrase(index, category, phrase) {
  if (index < 0 || index >= state.phrases.length) {
    return { ok: false, msg: 'Indice non valido.' };
  }
  
  // Pulisci la frase ma mantieni gli accenti
  const cleaned = (phrase || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
  
  if (!cleaned) {
    return { ok: false, msg: 'Frase vuota.' };
  }
  
  // Per la validazione della lunghezza, conta le celle effettive
  const cellsNeeded = countPhraseCells(cleaned);
  
  if (cellsNeeded > TOTAL_CELLS) {
    return { 
      ok: false, 
      msg: `Frase troppo lunga: ${cellsNeeded} celle (max ${TOTAL_CELLS}).` 
    };
  }
  
  state.phrases[index] = {
    ...state.phrases[index],
    category: (category || '').trim().toUpperCase(),
    phrase: cleaned // Salva con accenti
  };
  
  savePhrases();
  return { ok: true, msg: 'Frase modificata.' };
}

/**
 * Elimina una frase dall'archivio
 */
function deletePhrase(index) {
  if (index < 0 || index >= state.phrases.length) {
    return { ok: false, msg: 'Indice non valido.' };
  }
  
  state.phrases.splice(index, 1);
  savePhrases();
  
  // Reset indice se necessario
  if (state.phraseIndex >= state.phrases.length) {
    state.phraseIndex = 0;
  }
  
  return { ok: true, msg: 'Frase eliminata.' };
}

/**
 * Ottiene la prossima frase dall'archivio
 */
function getNextPhrase() {
  if (state.phrases.length === 0) {
    return null;
  }
  
  // Log sempre visibile per debug
  
  let phraseData;
  let selectedIndex;
  
  if (state.phraseMode === 'random') {
    // Se tutte le frasi sono state usate, resetta
    if (state.usedPhraseIndices.length >= state.phrases.length) {
      state.usedPhraseIndices = [];
    }
    
    // APPROCCIO MIGLIORATO: invece di usare indici, seleziona direttamente dalle frasi disponibili
    // Questo garantisce una randomizzazione completa indipendente dall'ordine dell'array
    
    // Crea un array di frasi non ancora usate (confrontando per frase e categoria)
    const availablePhrases = [];
    const usedPhrasesSet = new Set();
    
    // Crea un set delle frasi già usate per un controllo veloce
    for (const idx of state.usedPhraseIndices) {
      const usedPhrase = state.phrases[idx];
      if (usedPhrase) {
        usedPhrasesSet.add(`${usedPhrase.category}|${usedPhrase.phrase}`);
      }
    }
    
    // Trova tutte le frasi disponibili
    for (let i = 0; i < state.phrases.length; i++) {
      const phrase = state.phrases[i];
      const phraseKey = `${phrase.category}|${phrase.phrase}`;
      if (!usedPhrasesSet.has(phraseKey)) {
        availablePhrases.push({ index: i, phrase: phrase });
      }
    }
    
    // Se non ci sono frasi disponibili, resetta
    if (availablePhrases.length === 0) {
      state.usedPhraseIndices = [];
      // Ricrea l'array disponibile con tutte le frasi
      availablePhrases.length = 0;
      for (let i = 0; i < state.phrases.length; i++) {
        availablePhrases.push({ index: i, phrase: state.phrases[i] });
      }
    }
    
    // Mescola l'array delle frasi disponibili
    for (let i = availablePhrases.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [availablePhrases[i], availablePhrases[j]] = [availablePhrases[j], availablePhrases[i]];
    }
    
    // Scegli una frase completamente casuale dall'array mescolato
    const randomPosition = Math.floor(Math.random() * availablePhrases.length);
    const selected = availablePhrases[randomPosition];
    selectedIndex = selected.index;
    phraseData = selected.phrase;
    
    // Aggiungi l'indice alla lista delle frasi usate
    state.usedPhraseIndices.push(selectedIndex);
    
    // Debug: verifica che la selezione sia casuale e mostra statistiche categorie
    // Log sempre visibile (non condizionale)
    
    // Mostra statistiche sulle categorie usate
    if (!state.categoryStats) {
      state.categoryStats = {};
    }
    state.categoryStats[phraseData.category] = (state.categoryStats[phraseData.category] || 0) + 1;
    
    // Ogni 5 frasi, mostra un riepilogo delle categorie
    if (state.usedPhraseIndices.length % 5 === 0) {
      
      // Verifica distribuzione
      const categoryCounts = {};
      state.phrases.forEach(p => {
        categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
      });
    }
  } else {
    // Modalità ciclica
    selectedIndex = state.phraseIndex % state.phrases.length;
    phraseData = state.phrases[selectedIndex];
    state.phraseIndex++;
  }
  
  return phraseData;
}

/**
 * Verifica e mostra tutte le categorie disponibili nell'archivio frasi
 */
function verifyAllCategories() {
  if (state.phrases.length === 0) {
    return { ok: false, msg: 'Nessuna frase disponibile' };
  }
  
  const allCategories = [...new Set(state.phrases.map(p => p.category))];
  const categoryCounts = {};
  const categoryPhrases = {};
  
  state.phrases.forEach((p, index) => {
    categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
    if (!categoryPhrases[p.category]) {
      categoryPhrases[p.category] = [];
    }
    categoryPhrases[p.category].push({ index, phrase: p.phrase });
  });
  
  
  // Verifica se l'array è mescolato (controlla se ci sono pattern)
  if (state.phraseMode === 'random') {
    
    // Conta quante frasi consecutive della stessa categoria ci sono
    let consecutiveSameCategory = 0;
    let maxConsecutive = 0;
    let lastCategory = null;
    
    for (let i = 0; i < Math.min(20, state.phrases.length); i++) {
      const currentCategory = state.phrases[i].category;
      if (currentCategory === lastCategory) {
        consecutiveSameCategory++;
        maxConsecutive = Math.max(maxConsecutive, consecutiveSameCategory);
      } else {
        consecutiveSameCategory = 1;
      }
      lastCategory = currentCategory;
    }
    
  } else {
  }
  
  return {
    ok: true,
    totalPhrases: state.phrases.length,
    totalCategories: allCategories.length,
    categories: allCategories,
    categoryCounts: categoryCounts,
    categoryPhrases: categoryPhrases
  };
}

// ==========================================
// TABELLONE
// ==========================================

/**
 * Conta il numero di celle richieste da una frase
 * Considera che "L'" occupa 1 cella + 1 spazio, gli spazi tra parole 1 cella
 */
function countPhraseCells(phrase) {
  const cleaned = (phrase || '')
    .toUpperCase()
    .replace(/'\s+/g, "'")  // Rimuove spazi dopo apostrofi
    .replace(/\s+/g, ' ')
    .trim();
  
  const words = cleaned.split(' ').filter(w => w.length > 0);
  let totalCells = 0;
  
  for (let i = 0; i < words.length; i++) {
    if (i > 0) totalCells++; // Spazio tra le parole
    totalCells += parseWordToTokens(words[i]).length;
  }
  
  return totalCells;
}

/**
 * Parsa una parola in token (gestisce apostrofi)
 * Es: "L'AMORE" -> ["L'", " ", "A", "M", "O", "R", "E"]
 * Aggiunge uno spazio dopo ogni lettera apostrofata per una migliore visualizzazione
 */
function parseWordToTokens(word) {
  const tokens = [];
  let i = 0;
  
  while (i < word.length) {
    const char = word[i];
    
    // Se il prossimo carattere è un apostrofo, uniscili e aggiungi spazio dopo
    if (i + 1 < word.length && word[i + 1] === "'") {
      tokens.push(char + "'");
      tokens.push(' '); // Spazio dopo l'apostrofo per separare visivamente
      i += 2;
    } else if (char === "'") {
      // Apostrofo isolato all'inizio - salta
      i++;
    } else {
      tokens.push(char);
      i++;
    }
  }
  
  return tokens;
}

/**
 * Normalizza un token (rimuove accenti e apostrofo per il matching)
 */
function normalizeToken(token) {
  // Rimuove apostrofo e normalizza
  return normalizeText(token.replace(/'/g, ''));
}

/**
 * Costruisce gli slot del tabellone dalla frase
 * - Gestisce apostrofi come parte della lettera
 * - Non spezza le parole su più righe
 */
function buildSlotsFromPhrase(phrase, category) {
  // Prepara la frase originale (con accenti, maiuscola, spazi puliti)
  // Rimuove spazi dopo apostrofi per evitare doppi spazi
  const original = (phrase || '')
    .toUpperCase()
    .replace(/'\s+/g, "'")  // Rimuove spazi dopo apostrofi
    .replace(/\s+/g, ' ')
    .trim();
  
  state.phrase = original;
  state.phraseNormalized = sanitizePhrase(phrase);
  state.category = (category || '').trim().toUpperCase();
  state.slots = [];
  state.letterMap = new Map();
  
  // Reset lettere usate per nuovo round
  state.usedVowels = new Set();
  state.usedConsonants = new Set();
  
  // Dividi la frase in parole
  const words = original.split(' ').filter(w => w.length > 0);
  
  // Parsa ogni parola in token
  const parsedWords = words.map(word => parseWordToTokens(word));
  
  // Inizializza tutte le celle come vuote
  for (let i = 0; i < TOTAL_CELLS; i++) {
    state.slots.push({ char: '', charOriginal: '', revealed: false, isSpace: false, isEmpty: true });
  }
  
  // Posiziona le parole sulle righe senza spezzarle
  let currentRow = 0;
  let positionInRow = 0;
  let globalIndex = 0;
  
  // Calcola l'indice globale per una posizione (riga, colonna)
  function getGlobalIndex(row, col) {
    let idx = 0;
    for (let r = 0; r < row; r++) {
      idx += BOARD_LAYOUT[r];
    }
    return idx + col;
  }
  
  for (let wordIdx = 0; wordIdx < parsedWords.length; wordIdx++) {
    const tokens = parsedWords[wordIdx];
    const wordLength = tokens.length;
    
    // Spazio prima della parola (tranne la prima)
    if (wordIdx > 0) {
      // Verifica se c'è spazio per lo spazio + parola nella riga corrente
      const spaceNeeded = 1 + wordLength;
      const spaceAvailable = BOARD_LAYOUT[currentRow] - positionInRow;
      
      if (spaceNeeded > spaceAvailable) {
        // Riempi il resto della riga con celle vuote e passa alla prossima
        while (positionInRow < BOARD_LAYOUT[currentRow]) {
          positionInRow++;
        }
        currentRow++;
        positionInRow = 0;
        
        if (currentRow >= BOARD_LAYOUT.length) break;
      } else {
        // Aggiungi lo spazio
        const spaceIdx = getGlobalIndex(currentRow, positionInRow);
        state.slots[spaceIdx] = { char: ' ', charOriginal: ' ', revealed: true, isSpace: true, isEmpty: false };
        positionInRow++;
      }
    }
    
    // Verifica se la parola entra nella riga corrente
    if (currentRow < BOARD_LAYOUT.length) {
      const spaceAvailable = BOARD_LAYOUT[currentRow] - positionInRow;
      
      if (wordLength > spaceAvailable) {
        // La parola non entra, passa alla riga successiva
        while (positionInRow < BOARD_LAYOUT[currentRow]) {
          positionInRow++;
        }
        currentRow++;
        positionInRow = 0;
        
        if (currentRow >= BOARD_LAYOUT.length) break;
      }
    }
    
    if (currentRow >= BOARD_LAYOUT.length) break;
    
    // Posiziona i token della parola
    for (const token of tokens) {
      if (currentRow >= BOARD_LAYOUT.length) break;
      
      const idx = getGlobalIndex(currentRow, positionInRow);
      
      // Se il token è uno spazio (inserito dopo apostrofo), trattalo come spazio
      if (token === ' ') {
        state.slots[idx] = {
          char: ' ',
          charOriginal: ' ',
          revealed: true,
          isSpace: true,
          isEmpty: false
        };
      } else {
        const normalizedChar = normalizeToken(token);
        
        state.slots[idx] = {
          char: normalizedChar,
          charOriginal: token,
          revealed: false,
          isSpace: false,
          isEmpty: false
        };
        
        // Mappa lettera normalizzata -> indici
        if (normalizedChar && normalizedChar.length === 1) {
          if (!state.letterMap.has(normalizedChar)) {
            state.letterMap.set(normalizedChar, new Set());
          }
          state.letterMap.get(normalizedChar).add(idx);
        }
      }
      
      positionInRow++;
      
      // Se siamo alla fine della riga, passa alla prossima
      if (positionInRow >= BOARD_LAYOUT[currentRow]) {
        currentRow++;
        positionInRow = 0;
      }
    }
  }
}

/**
 * Riproduce il suono quando viene rivelata una lettera
 */
function playLetterRevealSound() {
  try {
    // Determina il percorso base: se siamo in resources/, usa percorso relativo, altrimenti resources/
    const isInResources = window.location.pathname.includes('/resources/') || window.location.pathname.endsWith('admin.html');
    const basePath = isInResources ? '' : 'resources/';
    const sound = new Audio(basePath + 'letter_sound.mp3');
    sound.volume = 0.3; // Volume più basso per non essere troppo invasivo
    sound.play().catch(err => {
      // Ignora errori di riproduzione (es. browser che blocca l'audio)
    });
  } catch (err) {
  }
}

/**
 * Rivela una singola lettera
 */
function revealLetter(letter) {
  const L = normalizeText(letter).trim();
  
  if (!L || L.length !== 1) {
    return { ok: false, found: 0, msg: 'Inserisci una singola lettera.' };
  }
  
  const positions = state.letterMap.get(L);
  
  if (!positions || positions.size === 0) {
    return { ok: true, found: 0, msg: `Lettera ${L}: non presente.` };
  }
  
  let revealed = false;
  for (const idx of positions) {
    if (!state.slots[idx].revealed) {
      state.slots[idx].revealed = true;
      revealed = true;
    }
  }
  
  // Riproduci il suono solo se almeno una lettera è stata rivelata
  if (revealed) {
    playLetterRevealSound();
  }
  
  return { ok: true, found: positions.size, msg: `Lettera ${L}: trovate ${positions.size}.` };
}

/**
 * Rivela multiple lettere
 */
function revealLetters(letters) {
  const seen = new Set();
  let totalFound = 0;
  let anyRevealed = false;
  
  for (const l of letters) {
    const L = normalizeText(l).trim();
    if (!L || L.length !== 1 || seen.has(L)) continue;
    seen.add(L);
    
    const positions = state.letterMap.get(L);
    if (!positions) continue;
    
    for (const idx of positions) {
      if (!state.slots[idx].revealed) {
        state.slots[idx].revealed = true;
        anyRevealed = true;
      }
    }
    totalFound += positions.size;
  }
  
  // Riproduci il suono solo se almeno una lettera è stata rivelata
  if (anyRevealed) {
    playLetterRevealSound();
  }
  
  return totalFound;
}

/**
 * Nasconde tutte le lettere
 */
function hideAllLetters() {
  for (const slot of state.slots) {
    if (slot.char && !slot.isEmpty && !slot.isSpace) {
      slot.revealed = false;
    }
  }
  
  // Salva automaticamente lo stato se in modalità cruciruota
  autoSaveCruciruotaState();
}

/**
 * Rivela tutte le lettere
 */
function revealAll() {
  let anyRevealed = false;
  for (const slot of state.slots) {
    if (slot.char && !slot.isEmpty && !slot.isSpace) {
      if (!slot.revealed) {
        slot.revealed = true;
        anyRevealed = true;
      }
    }
  }
  
  // Riproduci il suono se sono state rivelate lettere
  if (anyRevealed) {
    playLetterRevealSound();
  }
  
  // Salva automaticamente lo stato se in modalità cruciruota
  autoSaveCruciruotaState();
}

/**
 * Verifica se una soluzione è corretta
 */
function checkSolution(attempt) {
  const attemptNorm = sanitizePhrase(attempt);
  return attemptNorm === state.phraseNormalized;
}

/**
 * Rivela prima e ultima lettera di ogni parola (TESTACODA)
 */
function revealTestacoda() {
  hideAllLetters();
  
  // Trova le parole basandosi sugli slot
  let inWord = false;
  let wordStart = -1;
  let lastLetterIdx = -1;
  let anyRevealed = false;
  
  for (let i = 0; i < state.slots.length; i++) {
    const slot = state.slots[i];
    
    if (slot.char && !slot.isEmpty && !slot.isSpace) {
      // È una lettera
      if (!inWord) {
        // Inizio di una nuova parola
        inWord = true;
        wordStart = i;
        slot.revealed = true; // Prima lettera
        anyRevealed = true;
      }
      lastLetterIdx = i;
    } else {
      // È uno spazio o cella vuota
      if (inWord) {
        // Fine della parola precedente
        if (lastLetterIdx !== wordStart && lastLetterIdx >= 0) {
          state.slots[lastLetterIdx].revealed = true; // Ultima lettera
          anyRevealed = true;
        }
        inWord = false;
      }
    }
  }
  
  // Gestisci l'ultima parola se finisce alla fine del tabellone
  if (inWord && lastLetterIdx !== wordStart && lastLetterIdx >= 0) {
    state.slots[lastLetterIdx].revealed = true;
    anyRevealed = true;
  }
  
  // Riproduci il suono se sono state rivelate lettere
  if (anyRevealed) {
    playLetterRevealSound();
  }
}

// ==========================================
// GIOCATORI
// ==========================================

/**
 * Imposta i giocatori da una stringa separata da virgole
 */
function setPlayers(playersString) {
  const names = playersString
    .split(',')
    .map(n => n.trim())
    .filter(n => n.length > 0);
  
  if (names.length < 2) {
    return { ok: false, msg: 'Inserisci almeno 2 giocatori.' };
  }
  
  state.players = names.map(name => ({
    name: name,
    match: 0,
    game: 0,
    hasJolly: false
  }));
  
  state.currentPlayerIndex = 0;
  return { ok: true, msg: `Giocatori impostati: ${names.join(', ')}` };
}

/**
 * Passa al prossimo giocatore
 */
function nextPlayer() {
  if (state.players.length === 0) return;
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
}

/**
 * Azzera il montepremi match di tutti
 */
function resetMatchAll() {
  for (const p of state.players) {
    p.match = 0;
  }
}

/**
 * Azzera il montepremi match degli altri (tranne il vincitore)
 */
function resetMatchOthers(winnerIndex) {
  for (let i = 0; i < state.players.length; i++) {
    if (i !== winnerIndex) {
      state.players[i].match = 0;
    }
  }
}

/**
 * Ottiene l'indice del candidato alla finale (vincitore unico)
 */
function getFinalCandidateIndex() {
  if (state.players.length === 0) return null;
  
  let maxScore = -Infinity;
  let bestIndex = null;
  let tie = false;
  
  for (let i = 0; i < state.players.length; i++) {
    const score = state.players[i].game;
    if (score > maxScore) {
      maxScore = score;
      bestIndex = i;
      tie = false;
    } else if (score === maxScore) {
      tie = true;
    }
  }
  
  return tie ? null : bestIndex;
}

// ==========================================
// GESTIONE VOCALI E CONSONANTI
// ==========================================

/**
 * Verifica se una lettera è una vocale
 */
function isVowel(letter) {
  return VOWELS.has(normalizeText(letter).trim());
}

/**
 * Verifica se una lettera è una consonante
 */
function isConsonant(letter) {
  return CONSONANTS.has(normalizeText(letter).trim());
}

/**
 * Verifica se una lettera è già stata usata
 */
function isLetterUsed(letter) {
  const L = normalizeText(letter).trim();
  return state.usedVowels.has(L) || state.usedConsonants.has(L);
}

/**
 * Marca una lettera come usata
 */
function markLetterUsed(letter) {
  const L = normalizeText(letter).trim();
  if (isVowel(L)) {
    state.usedVowels.add(L);
  } else if (isConsonant(L)) {
    state.usedConsonants.add(L);
  }
}

/**
 * Conta le vocali rimanenti nella frase (non ancora dette)
 */
function getRemainingVowelsInPhrase() {
  const vowelsInPhrase = new Set();
  for (const [letter] of state.letterMap) {
    if (isVowel(letter) && !state.usedVowels.has(letter)) {
      vowelsInPhrase.add(letter);
    }
  }
  return vowelsInPhrase;
}

/**
 * Conta le consonanti rimanenti nella frase (non ancora dette)
 */
function getRemainingConsonantsInPhrase() {
  const consonantsInPhrase = new Set();
  for (const [letter] of state.letterMap) {
    if (isConsonant(letter) && !state.usedConsonants.has(letter)) {
      consonantsInPhrase.add(letter);
    }
  }
  return consonantsInPhrase;
}

/**
 * Verifica se tutte le vocali nella frase sono state dette
 */
function areAllVowelsUsed() {
  return getRemainingVowelsInPhrase().size === 0;
}

/**
 * Verifica se tutte le consonanti nella frase sono state dette
 */
function areAllConsonantsUsed() {
  return getRemainingConsonantsInPhrase().size === 0;
}

/**
 * Verifica se il giocatore può comprare una vocale
 */
function canBuyVowel() {
  // Deve essere in modalità NORMAL
  if (state.mode !== 'NORMAL') return false;
  // Non durante FAST mode
  if (state.fast && state.fast.active) return false;
  // Deve esserci una frase caricata
  if (!state.phrase || !state.letterMap || state.letterMap.size === 0) return false;
  // Devono esserci giocatori
  if (state.players.length === 0) return false;
  
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer) return false;
  
  // Il giocatore deve avere abbastanza soldi
  if (currentPlayer.match < VOWEL_COST) return false;
  // Devono esserci vocali non ancora dette
  if (areAllVowelsUsed()) return false;
  
  return true;
}

/**
 * Compra una vocale
 */
function buyVowel(vowelInput) {
  if (state.players.length === 0) {
    return { ok: false, msg: 'Imposta prima i giocatori.' };
  }
  
  const vowel = normalizeText(vowelInput).trim();
  const currentPlayer = state.players[state.currentPlayerIndex];
  
  if (!vowel || vowel.length !== 1) {
    return { ok: false, msg: 'Inserisci una singola vocale.' };
  }
  
  if (!isVowel(vowel)) {
    return { ok: false, msg: `${vowel} non è una vocale. Le vocali sono: A, E, I, O, U.` };
  }
  
  if (isLetterUsed(vowel)) {
    // Vocale già detta - perde il turno
    const playerName = currentPlayer.name;
    nextPlayer();
    return { 
      ok: true, 
      type: 'alreadyUsed',
      msg: `La vocale ${vowel} è già stata detta! ${playerName} perde il turno.`
    };
  }
  
  if (currentPlayer.match < VOWEL_COST) {
    return { ok: false, msg: `Non hai abbastanza soldi. Servono €${VOWEL_COST}, hai €${currentPlayer.match}.` };
  }
  
  // Sottrai il costo
  currentPlayer.match -= VOWEL_COST;
  
  // Marca come usata
  markLetterUsed(vowel);
  
  // Rivela la vocale
  const result = revealLetter(vowel);
  
  if (result.found === 0) {
    return {
      ok: true,
      type: 'vowelNotFound',
      cost: VOWEL_COST,
      msg: `Vocale ${vowel} comprata per €${VOWEL_COST}: non presente nella frase.`
    };
  }
  
  return {
    ok: true,
    type: 'vowelFound',
    found: result.found,
    cost: VOWEL_COST,
    msg: `Vocale ${vowel} comprata per €${VOWEL_COST}: trovate ${result.found} occorrenze!`
  };
}

// ==========================================
// PARSING ESITO RUOTA
// ==========================================

/**
 * Interpreta il valore della ruota
 */
function parseWheelValue(input) {
  const normalized = normalizeText(input).trim();
  
  if (!normalized) return null;
  
  if (normalized === 'PASSA') {
    return { type: 'PASSA' };
  }
  
  if (normalized === 'BANCAROTTA') {
    return { type: 'BANCAROTTA' };
  }
  
  if (normalized === 'JOLLY') {
    return { type: 'JOLLY' };
  }
  
  if (normalized === 'RADDOPPIA') {
    return { type: 'RADDOPPIA' };
  }
  
  const num = parseInt(normalized, 10);
  if (Number.isFinite(num) && num >= 0) {
    return { type: 'NUM', value: num };
  }
  
  return { type: 'UNKNOWN', raw: normalized };
}

// ==========================================
// MODALITÀ NORMAL
// ==========================================

/**
 * Applica un'azione in modalità NORMAL (per consonanti)
 */
function applyNormalAction(wheelInput, guessInput) {
  if (state.players.length === 0) {
    return { ok: false, msg: 'Imposta prima i giocatori.' };
  }
  
  const wheel = parseWheelValue(wheelInput);
  state.wheelValue = wheel;
  
  const guess = normalizeText(guessInput).trim();
  const currentPlayer = state.players[state.currentPlayerIndex];
  
  // PASSA (da input lettera/soluzione)
  if (guess === 'PASSA') {
    // Se ha il Jolly, chiedi se usarlo
    if (currentPlayer.hasJolly) {
      return { 
        ok: true, 
        type: 'askJollyPass',
        msg: `PASSA! Vuoi usare il Jolly per continuare?` 
      };
    }
    nextPlayer();
    return { 
      ok: true, 
      type: 'pass',
      msg: `PASSA: turno a ${state.players[state.currentPlayerIndex].name}` 
    };
  }
  
  // BANCAROTTA (da input)
  if (guess === 'BANCAROTTA') {
    // Se ha il Jolly, chiedi se usarlo
    if (currentPlayer.hasJolly) {
      return { 
        ok: true, 
        type: 'askJollyBankrupt',
        msg: `BANCAROTTA! Vuoi usare il Jolly per evitarla?` 
      };
    }
    currentPlayer.match = 0;
    currentPlayer.game = 0;
    const playerName = currentPlayer.name;
    nextPlayer();
    return { 
      ok: true, 
      type: 'bankrupt',
      msg: `BANCAROTTA: ${playerName} azzerato. Turno a ${state.players[state.currentPlayerIndex].name}` 
    };
  }
  
  // Ruota = BANCAROTTA
  if (wheel && wheel.type === 'BANCAROTTA') {
    // Se ha il Jolly, chiedi se usarlo
    if (currentPlayer.hasJolly) {
      return { 
        ok: true, 
        type: 'askJollyBankrupt',
        msg: `BANCAROTTA! Vuoi usare il Jolly per evitarla?` 
      };
    }
    currentPlayer.match = 0;
    currentPlayer.game = 0;
    const playerName = currentPlayer.name;
    nextPlayer();
    return { 
      ok: true, 
      type: 'bankrupt',
      msg: `BANCAROTTA: ${playerName} azzerato. Turno a ${state.players[state.currentPlayerIndex].name}` 
    };
  }
  
  // Ruota = PASSA
  if (wheel && wheel.type === 'PASSA') {
    // Se ha il Jolly, chiedi se usarlo
    if (currentPlayer.hasJolly) {
      return { 
        ok: true, 
        type: 'askJollyPass',
        msg: `PASSA! Vuoi usare il Jolly per continuare?` 
      };
    }
    nextPlayer();
    return { 
      ok: true, 
      type: 'wheelPass',
      msg: `Ruota PASSA: turno a ${state.players[state.currentPlayerIndex].name}` 
    };
  }
  
  // Tentativo di soluzione (più di 1 carattere)
  if (guess.length > 1) {
    if (checkSolution(guessInput)) {
      const winnerIndex = state.currentPlayerIndex;
      const winner = state.players[winnerIndex];
      const won = winner.match + BONUS_SOLUZIONE_NORMAL;
      
      winner.game += won;
      resetMatchAll();
      revealAll();
      
      // Se siamo in un round tradizionale, gestisci l'avanzamento
      const currentPhase = state.game.phase;
      
      if (currentPhase && currentPhase.startsWith('TRADITIONAL')) {
        // Estrai il numero del round corrente (es: TRADITIONAL_1 -> 1)
        const currentRoundNum = parseInt(currentPhase.split('_')[1]) || 0;
        const maxRounds = state.game.config.traditionalCount || 0;
        
        // Determina se c'è un round tradizionale successivo
        const nextRoundNum = currentRoundNum + 1;
        const hasNextTraditionalRound = nextRoundNum <= maxRounds;
        
        if (hasNextTraditionalRound) {
          // C'è un round tradizionale successivo, avanza a quello
          const nextTraditionalPhase = `TRADITIONAL_${nextRoundNum}`;
          
          // Verifica che la fase esista nelle fasi attive
          if (state.game.activePhases.includes(nextTraditionalPhase)) {
            // Avanza al round tradizionale successivo
            state.game.phase = nextTraditionalPhase;
            // Il giocatore vincitore inizia il nuovo round
            state.currentPlayerIndex = winnerIndex;
            const nextPhraseData = getNextPhrase();
            return {
              ok: true,
              type: 'solved',
              winnerIndex: winnerIndex,
              won: won,
              shouldAdvancePhase: true,
              nextPhase: nextTraditionalPhase,
              msg: `SOLUZIONE ESATTA! ${winner.name} vince ${won} punti. Prossimo: ${getPhaseDisplayName(nextTraditionalPhase)}`
            };
          }
        }
        
        // Non c'è un round tradizionale successivo, avanza alla fase successiva (es: CRUCIRUOTA, ULTIMO_ROUND)
        const advanceResult = advanceToNextPhase();
        if (advanceResult.ok) {
          return {
            ok: true,
            type: 'solved',
            winnerIndex: winnerIndex,
            won: won,
            shouldAdvancePhase: true,
            nextPhase: advanceResult.phase,
            msg: `SOLUZIONE ESATTA! ${winner.name} vince ${won} punti. Round tradizionali completati!`
          };
        } else {
          // Partita terminata
          return {
            ok: true,
            type: 'solved',
            winnerIndex: winnerIndex,
            won: won,
            shouldAdvancePhase: false,
            msg: `SOLUZIONE ESATTA! ${winner.name} vince ${won} punti. Partita terminata!`
          };
        }
      } else {
        // Per altri tipi di round, carica semplicemente la prossima frase
        const nextPhraseData = getNextPhrase();
        return {
          ok: true,
          type: 'solved',
          winnerIndex: winnerIndex,
          won: won,
          nextPhrase: nextPhraseData,
          msg: `SOLUZIONE ESATTA! ${winner.name} vince ${won} punti.`
        };
      }
    } else {
      const playerName = currentPlayer.name;
      nextPlayer();
      return {
        ok: true,
        type: 'wrongSolution',
        msg: `Soluzione errata! Turno a ${state.players[state.currentPlayerIndex].name}`
      };
    }
  }
  
  // Lettera singola - richiede valore ruota (NUM, JOLLY, o RADDOPPIA)
  const validWheelTypes = ['NUM', 'JOLLY', 'RADDOPPIA'];
  if (!wheel || !validWheelTypes.includes(wheel.type)) {
    return { ok: false, msg: 'Inserisci un valore ruota valido (numero, JOLLY, o RADDOPPIA).' };
  }
  
  if (!guess || guess.length !== 1) {
    return { ok: false, msg: 'Inserisci una singola lettera.' };
  }
  
  // Verifica se è una vocale (deve usare buyVowel)
  if (isVowel(guess)) {
    return { ok: false, msg: `${guess} è una vocale! Usa il pulsante "Compra Vocale" (costa €${VOWEL_COST}).` };
  }
  
  // Verifica se la consonante è già stata usata
  if (isLetterUsed(guess)) {
    const playerName = currentPlayer.name;
    nextPlayer();
    return {
      ok: true,
      type: 'alreadyUsed',
      msg: `La consonante ${guess} è già stata detta! ${playerName} perde il turno.`
    };
  }
  
  // Marca la consonante come usata
  markLetterUsed(guess);
  
  const result = revealLetter(guess);
  
  if (!result.ok) {
    return { ok: false, msg: result.msg };
  }
  
  // Lettera NON trovata
  if (result.found === 0) {
    const playerName = currentPlayer.name;
    nextPlayer();
    return {
      ok: true,
      type: 'letterNotFound',
      msg: `${result.msg} Turno a ${state.players[state.currentPlayerIndex].name}`
    };
  }
  
  // Lettera TROVATA - gestione per tipo ruota
  
  // JOLLY: lettera corretta = assegna Jolly + 0 punti
  if (wheel.type === 'JOLLY') {
    if (!currentPlayer.hasJolly) {
      currentPlayer.hasJolly = true;
      return {
        ok: true,
        type: 'jollyWon',
        found: result.found,
        msg: `${result.msg} ${currentPlayer.name} ottiene il JOLLY! 🃏`
      };
    } else {
      // Ha già il Jolly, trattalo come 0 punti
      return {
        ok: true,
        type: 'letterFound',
        found: result.found,
        gain: 0,
        msg: `${result.msg} (Hai già il Jolly, nessun bonus)`
      };
    }
  }
  
  // RADDOPPIA: lettera corretta = raddoppia il montepremi manche
  if (wheel.type === 'RADDOPPIA') {
    const beforeDouble = currentPlayer.match;
    currentPlayer.match *= 2;
    const afterDouble = currentPlayer.match;
    return {
      ok: true,
      type: 'doubled',
      found: result.found,
      before: beforeDouble,
      after: afterDouble,
      msg: `${result.msg} RADDOPPIO! €${beforeDouble} → €${afterDouble}!`
    };
  }
  
  // Numero normale
  const gain = result.found * wheel.value;
  currentPlayer.match += gain;
  
  return {
    ok: true,
    type: 'letterFound',
    found: result.found,
    gain: gain,
    msg: `${result.msg} +${gain} punti a ${currentPlayer.name}.`
  };
}

/**
 * Usa il Jolly per evitare PASSA o BANCAROTTA
 */
function useJolly() {
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (currentPlayer.hasJolly) {
    currentPlayer.hasJolly = false;
    return { ok: true, msg: `${currentPlayer.name} usa il Jolly! Turno conservato.` };
  }
  return { ok: false, msg: 'Non hai il Jolly.' };
}

/**
 * Rifiuta di usare il Jolly e applica l'effetto
 */
function declineJolly(effectType) {
  const currentPlayer = state.players[state.currentPlayerIndex];
  
  if (effectType === 'bankrupt') {
    currentPlayer.match = 0;
    currentPlayer.game = 0;
    const playerName = currentPlayer.name;
    nextPlayer();
    return { 
      ok: true, 
      type: 'bankrupt',
      msg: `BANCAROTTA: ${playerName} azzerato. Turno a ${state.players[state.currentPlayerIndex].name}` 
    };
  } else if (effectType === 'pass') {
    nextPlayer();
    return { 
      ok: true, 
      type: 'pass',
      msg: `PASSA: turno a ${state.players[state.currentPlayerIndex].name}` 
    };
  }
  
  return { ok: false, msg: 'Tipo effetto non valido.' };
}

// ==========================================
// MODALITÀ FAST
// ==========================================

/**
 * Prepara le posizioni delle lettere per FAST mode
 * Ogni lettera appare singolarmente (una cella alla volta)
 */
function prepareFastPositions() {
  // Raccoglie tutte le posizioni delle lettere (non spazi, non vuote, non già rivelate)
  // Solo lettere effettivamente presenti nel tabellone
  const positions = [];
  state.slots.forEach((slot, idx) => {
    // Verifica che sia una lettera valida: ha un carattere, non è vuota, non è uno spazio, non è già rivelata
    if (slot.char && 
        slot.char.trim() !== '' && 
        !slot.isEmpty && 
        !slot.isSpace &&
        !slot.revealed) { // Non includere lettere già rivelate
      positions.push(idx);
    }
  });
  
  // Verifica che ci siano posizioni disponibili
  if (positions.length === 0) {
    return;
  }
  
  // Mescola le posizioni in ordine casuale
  state.fast.remainingPositions = shuffle(positions);
}

/**
 * Avvia la modalità FAST
 */
function startFastMode(onTick, onEnd) {
  if (state.fast.active) {
    return { ok: false, msg: 'FAST già attiva.' };
  }
  
  if (!state.phraseNormalized) {
    return { ok: false, msg: 'Carica prima una frase.' };
  }
  
  state.mode = 'FAST';
  state.fast.active = true;
  state.fast.lastLetter = null;
  
  hideAllLetters();
  prepareFastPositions();
  
  state.fast.intervalId = setInterval(() => {
    // Verifica che FAST sia ancora attiva
    if (!state.fast.active) {
      if (state.fast.intervalId) {
        clearInterval(state.fast.intervalId);
        state.fast.intervalId = null;
      }
      return;
    }
    
    // Verifica che ci siano ancora posizioni disponibili
    if (!state.fast.remainingPositions || state.fast.remainingPositions.length === 0) {
      // IMPORTANTE: Non avanzare automaticamente quando le lettere sono esaurite
      // Il round FAST deve continuare finché qualcuno non indovina la frase
      // Ferma solo la rivelazione automatica delle lettere
      stopFastMode();
      if (onEnd) {
        // Chiama onEnd solo per notificare, ma NON per avanzare la fase
        onEnd('Lettere esaurite. Il round continua finché qualcuno non indovina.');
      }
      return;
    }
    
    // Rimuovi posizioni già rivelate o non valide finché non ne trovi una valida
    let position = null;
    let slot = null;
    
    while (state.fast.remainingPositions.length > 0) {
      position = state.fast.remainingPositions.shift();
      
      // Verifica che la posizione sia valida
      if (position === undefined || position === null || position < 0 || position >= state.slots.length) {
        continue;
      }
      
      slot = state.slots[position];
      
      // Verifica che lo slot sia valido e non già rivelato
      if (!slot) {
        continue;
      }
      
      if (slot.revealed) {
        // Già rivelata, salta
        continue;
      }
      
      if (!slot.char || slot.isEmpty || slot.isSpace) {
        // Non è una lettera valida, salta
        continue;
      }
      
      // Trovata una posizione valida!
      break;
    }
    
    // Se non abbiamo trovato una posizione valida, ferma
    if (!slot || !position) {
      stopFastMode();
      if (onEnd) onEnd('Nessuna lettera valida rimasta.');
      return;
    }
    
    // Rivela la lettera
    slot.revealed = true;
    const letter = slot.charOriginal || slot.char;
    state.fast.lastLetter = letter;
    
    // Riproduci il suono quando viene rivelata una lettera nel FAST
    playLetterRevealSound();
    
    if (onTick) {
      onTick(letter, 1);
    }
  }, FAST_INTERVAL_MS);
  
  return { ok: true, msg: 'FAST avviata.' };
}

/**
 * Ferma la modalità FAST
 */
function stopFastMode() {
  if (state.fast.intervalId) {
    clearInterval(state.fast.intervalId);
    state.fast.intervalId = null;
  }
  state.fast.active = false;
  state.mode = 'NORMAL';
}

/**
 * Tenta una soluzione in modalità FAST
 */
function tryFastSolution(playerIndex, guessInput) {
  if (!state.fast.active) {
    return { ok: false, msg: 'FAST non attiva.' };
  }
  
  const player = state.players[playerIndex];
  if (!player) {
    return { ok: false, msg: 'Giocatore non valido.' };
  }
  
  if (checkSolution(guessInput)) {
    player.game += BONUS_FAST;
    stopFastMode();
    revealAll();
    
    const nextPhraseData = getNextPhrase();
    
    return {
      ok: true,
      correct: true,
      nextPhrase: nextPhraseData,
      msg: `ESATTO! ${player.name} vince ${BONUS_FAST} punti.`
    };
  } else {
    return {
      ok: true,
      correct: false,
      msg: 'Soluzione errata (nessuna penalità).'
    };
  }
}

// ==========================================
// MODALITÀ FINAL
// ==========================================

/**
 * Avvia la modalità FINALE
 */
function startFinalMode() {
  const candidateIndex = getFinalCandidateIndex();
  
  if (candidateIndex === null) {
    return { ok: false, msg: 'FINALE non disponibile: pareggio nel montepremi.' };
  }
  
  // Ferma FAST se attiva
  if (state.fast.active) {
    stopFastMode();
  }
  
  state.mode = 'FINAL';
  state.final.active = true;
  state.final.phase = 1;
  state.final.finalistIndex = candidateIndex;
  state.final.lettersLocked = false;
  state.final.phasesWon = 0;
  state.final.timer.remaining = FINAL_TIMER_SECONDS;
  state.final.timer.running = false;
  
  // Carica frase per fase 1
  const phraseData = getNextPhrase();
  if (!phraseData) {
    state.mode = 'NORMAL';
    state.final.active = false;
    return { ok: false, msg: 'Archivio frasi vuoto.' };
  }
  
  buildSlotsFromPhrase(phraseData.phrase, phraseData.category);
  hideAllLetters();
  revealLetters(['N', 'R', 'T', 'E']);
  
  const finalist = state.players[candidateIndex];
  
  return {
    ok: true,
    finalistIndex: candidateIndex,
    finalistName: finalist.name,
    msg: `FINALE: ${finalist.name} inizia. FASE 1 - NRTE rivelate.`
  };
}

/**
 * Applica le lettere scelte nel FINALE (fase 1)
 */
function applyFinalLetters(consonantsInput, vowelInput) {
  if (state.mode !== 'FINAL' || state.final.phase !== 1) {
    return { ok: false, msg: 'Non sei in FASE 1 del FINALE.' };
  }
  
  if (state.final.lettersLocked) {
    return { ok: false, msg: 'Lettere già applicate.' };
  }
  
  // Parse consonanti - accetta formato "L, M, S" o "L M S" o "LMS"
  const consRaw = normalizeText(consonantsInput).replace(/[,\s]+/g, ' ').trim();
  const consonants = consRaw.split(' ').filter(c => c.length === 1);
  
  // Parse vocale
  const vowel = normalizeText(vowelInput).trim();
  
  // Validazioni
  if (consonants.length !== 3) {
    return { ok: false, msg: 'Inserisci ESATTAMENTE 3 consonanti.' };
  }
  
  if (!vowel || vowel.length !== 1) {
    return { ok: false, msg: 'Inserisci 1 vocale.' };
  }
  
  const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);
  
  if (!VOWELS.has(vowel)) {
    return { ok: false, msg: 'La vocale deve essere A, E, I, O, U.' };
  }
  
  for (const c of consonants) {
    if (VOWELS.has(c)) {
      return { ok: false, msg: `${c} è una vocale, inserisci solo consonanti.` };
    }
  }
  
  // Check duplicati
  const all = [...consonants, vowel];
  const set = new Set(all);
  if (set.size !== all.length) {
    return { ok: false, msg: 'Lettere duplicate non ammesse.' };
  }
  
  // Rivela lettere (N, R, T, E di default + scelte del giocatore)
  revealLetters(['N', 'R', 'T', 'E', ...consonants, vowel]);
  state.final.lettersLocked = true;
  
  return {
    ok: true,
    consonants: consonants,
    vowel: vowel,
    msg: `Lettere applicate: ${consonants.join(' ')} + ${vowel}. Timer parte!`
  };
}

/**
 * Avvia il timer del finale
 */
function startFinalTimer(onTick, onTimeout) {
  if (state.final.timer.running) return;
  
  state.final.timer.running = true;
  
  state.final.timer.intervalId = setInterval(() => {
    state.final.timer.remaining--;
    
    if (onTick) {
      onTick(state.final.timer.remaining);
    }
    
    if (state.final.timer.remaining <= 0) {
      stopFinalTimer();
      state.final.active = false;
      state.mode = 'NORMAL';
      if (onTimeout) {
        onTimeout();
      }
    }
  }, 1000);
}

/**
 * Ferma il timer del finale
 */
function stopFinalTimer() {
  if (state.final.timer.intervalId) {
    clearInterval(state.final.timer.intervalId);
    state.final.timer.intervalId = null;
  }
  state.final.timer.running = false;
}

/**
 * Passa al TESTACODA (fase 2)
 */
function goToTestacoda() {
  if (state.mode !== 'FINAL' || state.final.phase !== 1) {
    return { ok: false, msg: 'PASSA disponibile solo in FASE 1.' };
  }
  
  // Pausa timer
  stopFinalTimer();
  
  // Carica seconda frase
  const phraseData = getNextPhrase();
  if (!phraseData) {
    return { ok: false, msg: 'Archivio frasi vuoto per TESTACODA.' };
  }
  
  buildSlotsFromPhrase(phraseData.phrase, phraseData.category);
  state.final.phase = 2;
  revealTestacoda();
  
  return {
    ok: true,
    timeRemaining: state.final.timer.remaining,
    msg: 'TESTACODA attivo. Timer riparte.'
  };
}

/**
 * Passa al ROUND LIBERO (fase 3)
 */
function goToRoundLibero() {
  if (state.mode !== 'FINAL' || state.final.phase !== 2) {
    return { ok: false, msg: 'PASSA disponibile solo in FASE 2 (Testacoda).' };
  }
  
  // Pausa timer
  stopFinalTimer();
  
  // Carica terza frase
  const phraseData = getNextPhrase();
  if (!phraseData) {
    return { ok: false, msg: 'Archivio frasi vuoto per ROUND LIBERO.' };
  }
  
  buildSlotsFromPhrase(phraseData.phrase, phraseData.category);
  state.final.phase = 3;
  hideAllLetters(); // Nel round libero non ci sono lettere iniziali
  
  return {
    ok: true,
    timeRemaining: state.final.timer.remaining,
    msg: 'ROUND LIBERO attivo. Timer riparte.'
  };
}

/**
 * Applica una lettera nel ROUND LIBERO (fase 3)
 * Lettera corretta: viene mostrata
 * Lettera sbagliata: -3 secondi
 */
function applyFinalFreeLetter(letterInput) {
  if (state.mode !== 'FINAL' || state.final.phase !== 3) {
    return { ok: false, msg: 'Funzione disponibile solo nel ROUND LIBERO.' };
  }
  
  const letter = normalizeText(letterInput).trim();
  
  if (!letter || letter.length !== 1) {
    return { ok: false, msg: 'Inserisci una singola lettera.' };
  }
  
  const result = revealLetter(letter);
  
  if (result.found > 0) {
    return {
      ok: true,
      type: 'letterFound',
      found: result.found,
      letter: letter,
      msg: `${result.found}x ${letter} trovate!`
    };
  } else {
    // Penalità: -3 secondi
    state.final.timer.remaining = Math.max(0, state.final.timer.remaining - 3);
    return {
      ok: true,
      type: 'letterNotFound',
      penalty: 3,
      letter: letter,
      newTime: state.final.timer.remaining,
      msg: `${letter} non presente! -3 secondi`
    };
  }
}

/**
 * Tenta la soluzione nel FINALE
 * Gestisce la progressione tra fasi e il conteggio vittorie
 */
function tryFinalSolution(guessInput) {
  if (state.mode !== 'FINAL' || !state.final.active) {
    return { ok: false, msg: 'Non sei in modalità FINALE.' };
  }
  
  const finalist = state.players[state.final.finalistIndex];
  const currentPhase = state.final.phase;
  
  if (checkSolution(guessInput)) {
    // CORRETTO!
    state.final.phasesWon++;
    
    // Nelle fasi 1 e 2, NON fermare il timer - lascia che il frontend gestisca la pausa e la transizione
    // Solo nella fase 3 (Round Libero), terminare con vittoria
    if (currentPhase === 3) {
      stopFinalTimer();
      state.final.active = false;
      state.mode = 'NORMAL';
    }
    // Nelle fasi 1 e 2, NON fermare il timer - il frontend lo metterà in pausa quando necessario
    // Il timer continuerà a scorrere fino a quando il frontend non gestirà la transizione
    
    return {
      ok: true,
      correct: true,
      phase: currentPhase,
      phasesWon: state.final.phasesWon,
      finalistName: finalist.name,
      finalWin: true,
      msg: `CORRETTO! ${finalist.name} ha indovinato la frase ${state.final.phasesWon}!`
    };
  } else {
    // SBAGLIATO
    // Nel ROUND LIBERO (fase 3), sbagliare significa perdere tutto
    if (currentPhase === 3) {
      stopFinalTimer();
      state.final.active = false;
      state.mode = 'NORMAL';
      
      // Ha vinto se aveva già indovinato almeno una frase
      const finalWin = state.final.phasesWon >= 1;
      
      return {
        ok: true,
        correct: false,
        phase: currentPhase,
        phasesWon: state.final.phasesWon,
        finalistName: finalist.name,
        finalWin: finalWin,
        msg: finalWin 
          ? `Soluzione sbagliata, ma ${finalist.name} ha già vinto una frase! VITTORIA FINALE!`
          : `SCONFITTA! ${finalist.name} non ha indovinato nessuna frase.`
      };
    }
    
    // Nelle fasi 1 e 2, sbagliare fa perdere la frase ma si continua
    stopFinalTimer();
    state.final.active = false;
    state.mode = 'NORMAL';
    
    // Controlla se ha vinto almeno una frase
    const finalWin = state.final.phasesWon >= 1;
    
    return {
      ok: true,
      correct: false,
      phase: currentPhase,
      phasesWon: state.final.phasesWon,
      finalistName: finalist.name,
      finalWin: finalWin,
      msg: finalWin
        ? `Soluzione sbagliata! Ma ${finalist.name} ha vinto con ${state.final.phasesWon} frase/i!`
        : `SCONFITTA! ${finalist.name} ha sbagliato.`
    };
  }
}

// ==========================================
// MODALITÀ ULTIMO ROUND
// ==========================================

/**
 * Avvia la modalità ULTIMO ROUND
 */
function startUltimoRound() {
  if (state.players.length === 0) {
    return { ok: false, msg: 'Imposta prima i giocatori.' };
  }
  
  if (state.phrases.length === 0) {
    return { ok: false, msg: 'Carica prima delle frasi.' };
  }
  
  // Disattiva altre modalità
  state.fast.active = false;
  state.express.active = false;
  state.final.active = false;
  
  // Attiva ULTIMO ROUND
  state.mode = 'ULTIMO_ROUND';
  state.ultimoRound.active = true;
  state.ultimoRound.fixedValue = 0;
  state.ultimoRound.valueSet = false;
  
  // Carica una nuova frase
  const phraseData = getNextPhrase();
  if (!phraseData) {
    state.mode = 'NORMAL';
    state.ultimoRound.active = false;
    return { ok: false, msg: 'Archivio frasi vuoto.' };
  }
  
  buildSlotsFromPhrase(phraseData.phrase, phraseData.category);
  hideAllLetters();
  
  return {
    ok: true,
    msg: 'ULTIMO ROUND! Gira la ruota per determinare il valore fisso.'
  };
}

/**
 * Imposta il valore fisso per l'ULTIMO ROUND
 * Restituisce se il valore è valido o se bisogna rigirare
 */
function setUltimoRoundValue(wheelInput) {
  if (state.mode !== 'ULTIMO_ROUND' || !state.ultimoRound.active) {
    return { ok: false, msg: 'Non sei in modalità ULTIMO ROUND.' };
  }
  
  const wheel = parseWheelValue(wheelInput);
  
  // Caselle speciali = rigira
  if (wheel.type === 'BANKRUPT' || wheel.type === 'PASS' || 
      wheel.type === 'JOLLY' || wheel.type === 'RADDOPPIA' || 
      wheel.type === 'UNKNOWN') {
    return { 
      ok: true, 
      type: 'respin',
      msg: 'Casella speciale! Rigira la ruota.'
    };
  }
  
  // Valore numerico = ok
  if (wheel.type === 'NUM' && wheel.value > 0) {
    state.ultimoRound.fixedValue = wheel.value;
    state.ultimoRound.valueSet = true;
    return {
      ok: true,
      type: 'valueSet',
      value: wheel.value,
      msg: `Valore fisso impostato: €${wheel.value}! I giocatori giocano a turno.`
    };
  }
  
  return { ok: false, msg: 'Inserisci un valore valido.' };
}

/**
 * Applica un'azione in modalità ULTIMO ROUND
 */
function applyUltimoRoundAction(guessInput) {
  if (state.mode !== 'ULTIMO_ROUND' || !state.ultimoRound.active) {
    return { ok: false, msg: 'Non sei in modalità ULTIMO ROUND.' };
  }
  
  if (!state.ultimoRound.valueSet) {
    return { ok: false, msg: 'Devi prima impostare il valore girando la ruota.' };
  }
  
  const guess = normalizeText(guessInput).trim();
  const currentPlayer = state.players[state.currentPlayerIndex];
  const fixedValue = state.ultimoRound.fixedValue;
  
  // SOLUZIONE (più di una lettera)
  if (guess.length > 1) {
    const isCorrect = (guess === state.phraseNormalized);
    
    if (isCorrect) {
      // Calcola chi ha vinto
      const winner = state.players[state.currentPlayerIndex];
      const won = winner.match;
      winner.game += won;
      
      // Reset match di tutti
      resetMatchAll();
      revealAll();
      
      // Controlla se c'è pareggio nel montepremi gioco
      const hasUnique = hasUniqueWinner();
      
      // Disattiva ULTIMO ROUND
      state.ultimoRound.active = false;
      state.ultimoRound.valueSet = false;
      state.mode = 'NORMAL';
      
      // Se non c'è pareggio, avanza al FINALE
      if (hasUnique) {
        const finalistIndex = getFinalCandidateIndex();
      return {
        ok: true,
        type: 'solved',
        winnerIndex: state.currentPlayerIndex,
        winnerName: winner.name,
        won: won,
          msg: `SOLUZIONE ESATTA! ${winner.name} vince con €${won}!`,
          shouldAdvanceToFinal: true,
          finalistIndex: finalistIndex
        };
      } else {
        // C'è pareggio, ripeti l'ULTIMO_ROUND
        return {
          ok: true,
          type: 'solved',
          winnerIndex: state.currentPlayerIndex,
          winnerName: winner.name,
          won: won,
          msg: `SOLUZIONE ESATTA! ${winner.name} vince con €${won}! Pareggio nel montepremi. Si ripete l'ULTIMO ROUND.`,
          shouldRepeatUltimoRound: true
      };
      }
    } else {
      // Soluzione sbagliata - passa il turno (niente penalità)
      const playerName = currentPlayer.name;
      nextPlayer();
      return {
        ok: true,
        type: 'wrongSolution',
        msg: `Soluzione errata! Turno a ${state.players[state.currentPlayerIndex].name}`
      };
    }
  }
  
  // LETTERA SINGOLA
  if (!guess || guess.length !== 1) {
    return { ok: false, msg: 'Inserisci una consonante o la soluzione.' };
  }
  
  // Verifica se è una vocale (non permesse in ULTIMO ROUND)
  if (isVowel(guess)) {
    return { ok: false, msg: `Le vocali NON si comprano nell'ULTIMO ROUND!` };
  }
  
  // Verifica se già usata
  if (state.usedConsonants.has(guess)) {
    // Passa il turno senza penalità
    const playerName = currentPlayer.name;
    nextPlayer();
    return {
      ok: true,
      type: 'alreadyUsed',
      msg: `${guess} già detta! Turno a ${state.players[state.currentPlayerIndex].name}`
    };
  }
  
  // Marca come usata
  markLetterUsed(guess);
  
  const result = revealLetter(guess);
  
  if (!result.ok) {
    return { ok: false, msg: result.msg };
  }
  
  // Lettera NON trovata - passa il turno (niente penalità)
  if (result.found === 0) {
    const playerName = currentPlayer.name;
    nextPlayer();
    return {
      ok: true,
      type: 'letterNotFound',
      msg: `${guess} non presente! Turno a ${state.players[state.currentPlayerIndex].name}`
    };
  }
  
  // Lettera TROVATA
  const earned = fixedValue * result.found;
  currentPlayer.match += earned;
  
  // Passa SEMPRE il turno dopo aver detto una consonante
  const playerName = currentPlayer.name;
  nextPlayer();
  
  return {
    ok: true,
    type: 'letterFound',
    found: result.found,
    earned: earned,
    msg: `${result.found}x ${guess}! ${playerName} guadagna €${earned}. Turno a ${state.players[state.currentPlayerIndex].name}`
  };
}

/**
 * Ferma la modalità ULTIMO ROUND
 */
function stopUltimoRound() {
  state.ultimoRound.active = false;
  state.ultimoRound.valueSet = false;
  state.ultimoRound.fixedValue = 0;
  state.mode = 'NORMAL';
}

// ==========================================
// MODALITÀ CRUCIRUOTA
// ==========================================

/**
 * Avvia la modalità CRUCIRUOTA
 * Usa lo stesso layout del tradizionale ma con frasi specifiche
 */
function startCruciruota() {
  // Ferma altre modalità
  if (state.fast.active) stopFastMode();
  if (state.ultimoRound.active) stopUltimoRound();
  if (state.final.active) {
    stopFinalTimer();
    state.final.active = false;
  }
  
  state.mode = 'CRUCIRUOTA';
  state.crupiruota.active = true;
  
  // Ripristina il tabellone salvato per la fase corrente, se esiste
  const currentPhase = state.game.phase;
  const restored = restoreCruciruotaBoardState(currentPhase);
  
  if (!restored) {
    // Se non esiste un tabellone salvato, genera uno nuovo (fallback)
    state.usedVowels = new Set();
    state.usedConsonants = new Set();
    loadCruciruotaPhrase();
    // Salva il tabellone generato
    saveCruciruotaBoardState(currentPhase);
  }
  
  return {
    ok: true,
    category: state.category,
    msg: `CRUCIRUOTA: ${state.category}`
  };
}

/**
 * Salva lo stato corrente del tabellone cruciruota per una fase specifica
 */
function saveCruciruotaBoardState(phase) {
  state.crupiruota.savedBoards[phase] = {
    slots: JSON.parse(JSON.stringify(state.slots)), // Deep copy
    letterMap: new Map(state.letterMap), // Copy map
    category: state.category,
    phrase: state.phrase,
    phraseNormalized: state.phraseNormalized,
    usedVowels: new Set(state.usedVowels),
    usedConsonants: new Set(state.usedConsonants)
  };
}

/**
 * Ripristina lo stato del tabellone cruciruota per una fase specifica
 */
function restoreCruciruotaBoardState(phase) {
  const saved = state.crupiruota.savedBoards[phase];
  if (!saved) return false;
  
  state.slots = JSON.parse(JSON.stringify(saved.slots)); // Deep copy
  state.letterMap = new Map(saved.letterMap); // Copy map
  state.category = saved.category;
  state.phrase = saved.phrase;
  state.phraseNormalized = saved.phraseNormalized;
  state.usedVowels = new Set(saved.usedVowels);
  state.usedConsonants = new Set(saved.usedConsonants);
  
  return true;
}

/**
 * Carica uno schema per il Cruciruota (con parole incrociate)
 */
function loadCruciruotaPhrase() {
  const schemas = CRUCIRUOTA_SCHEMAS;
  
  // Reset se tutti gli schemi sono stati usati
  if (state.crupiruota.usedPhraseIndices.length >= schemas.length) {
    state.crupiruota.usedPhraseIndices = [];
  }
  
  // Seleziona uno schema casuale non usato
  let availableIndices = [];
  for (let i = 0; i < schemas.length; i++) {
    if (!state.crupiruota.usedPhraseIndices.includes(i)) {
      availableIndices.push(i);
    }
  }
  
  const randomIdx = availableIndices[Math.floor(Math.random() * availableIndices.length)];
  state.crupiruota.usedPhraseIndices.push(randomIdx);
  
  const schema = schemas[randomIdx];
  
  // Costruisci il tabellone dal schema del cruciverba
  buildCruciruotaBoard(schema);
}

/**
 * Costruisce il tabellone del Cruciruota da uno schema con parole incrociate
 */
function buildCruciruotaBoard(schema) {
  state.category = schema.category.toUpperCase();
  state.slots = [];
  state.letterMap = new Map();
  state.usedVowels = new Set();
  state.usedConsonants = new Set();
  
  // Estrai tutte le parole come stringa per la soluzione
  const allWords = schema.words.map(w => w.word).join(' ');
  state.phrase = allWords;
  state.phraseNormalized = normalizeText(allWords).replace(/[^A-Z]/g, '');
  state.originalPhrase = allWords;
  
  // Inizializza tutte le celle come vuote
  for (let i = 0; i < TOTAL_CELLS; i++) {
    state.slots.push({ char: '', charOriginal: '', revealed: false, isSpace: false, isEmpty: true });
  }
  
  // Helper per calcolare l'indice globale da (riga, colonna)
  function getGlobalIndex(row, col) {
    if (row < 0 || row >= BOARD_LAYOUT.length) return -1;
    if (col < 0 || col >= BOARD_LAYOUT[row]) return -1;
    
    let idx = 0;
    for (let r = 0; r < row; r++) {
      idx += BOARD_LAYOUT[r];
    }
    return idx + col;
  }
  
  // Posiziona ogni parola sulla griglia
  for (const wordDef of schema.words) {
    const word = wordDef.word.toUpperCase();
    const startRow = wordDef.row;
    const startCol = wordDef.col;
    const direction = wordDef.dir;
    
    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      let row, col;
      
      if (direction === 'H') {
        // Orizzontale
        row = startRow;
        col = startCol + i;
      } else {
        // Verticale
        row = startRow + i;
        col = startCol;
      }
      
      const globalIdx = getGlobalIndex(row, col);
      if (globalIdx === -1) continue; // Fuori dai limiti
      
      const normalizedChar = normalizeText(char);
      
      // Se la cella è già occupata (intersezione), verifica che la lettera sia la stessa
      if (!state.slots[globalIdx].isEmpty) {
        // Già occupata - dovrebbe essere la stessa lettera (intersezione)
        continue;
      }
      
      state.slots[globalIdx] = {
        char: normalizedChar,
        charOriginal: char,
        revealed: false,
        isSpace: false,
        isEmpty: false
      };
      
      // Mappa lettera -> indici
      if (normalizedChar && normalizedChar.length === 1) {
        if (!state.letterMap.has(normalizedChar)) {
          state.letterMap.set(normalizedChar, []);
        }
        state.letterMap.get(normalizedChar).push(globalIdx);
      }
    }
  }
}

/**
 * Salva automaticamente lo stato del tabellone cruciruota se attivo
 */
function autoSaveCruciruotaState() {
  if (state.crupiruota.active && state.game.phase) {
    const currentPhase = state.game.phase;
    if (currentPhase.startsWith('CRUCIRUOTA')) {
      saveCruciruotaBoardState(currentPhase);
    }
  }
}

/**
 * Carica la prossima frase per il Cruciruota
 * NOTA: Non dovrebbe essere chiamata se i tabelloni sono già stati generati all'inizio
 * Questa funzione è mantenuta per compatibilità, ma ripristina il tabellone salvato
 */
function getNextCruciruotaPhrase() {
  const currentPhase = state.game.phase;
  
  // Prova a ripristinare il tabellone salvato per questa fase
  const restored = restoreCruciruotaBoardState(currentPhase);
  
  if (!restored) {
    // Se non esiste, genera uno nuovo (fallback)
    loadCruciruotaPhrase();
    // Salva il tabellone generato
    saveCruciruotaBoardState(currentPhase);
  }
  
  return {
    ok: true,
    category: state.category,
    msg: `Nuova frase: ${state.category}`
  };
}

/**
 * Rivela tutte le lettere nel tabellone Cruciruota
 */
function revealAllCruciruota() {
  // Usa la stessa logica del tradizionale
  revealAll();
}

/**
 * Nasconde tutte le lettere nel tabellone Cruciruota
 */
function hideAllCruciruota() {
  // Usa la stessa logica del tradizionale
  hideAllLetters();
}

/**
 * Ferma la modalità CRUCIRUOTA
 */
function stopCruciruota() {
  state.crupiruota.active = false;
  state.mode = 'NORMAL';
}

// ==========================================
// GESTIONE PARTITA
// ==========================================

const FAST_BONUS_STREAK = 5000;  // Bonus per vincere tutti e 3 i FAST
const FAST_WIN_BONUS = 1000;    // Bonus per ogni FAST vinto

/**
 * Costruisce le fasi attive basandosi sulla configurazione
 */
function buildActivePhases(config) {
  const phases = [];
  
  // Round FAST
  if (config.fastEnabled && config.fastCount > 0) {
    for (let i = 1; i <= config.fastCount; i++) {
      phases.push(`FAST_${i}`);
    }
  }
  
  // Round Tradizionali
  if (config.traditionalEnabled && config.traditionalCount > 0) {
    for (let i = 1; i <= config.traditionalCount; i++) {
      phases.push(`TRADITIONAL_${i}`);
    }
  }
  
  // Cruciruota
  if (config.cruciruotaEnabled && config.cruciruotaCount > 0) {
    for (let i = 1; i <= config.cruciruotaCount; i++) {
      phases.push(`CRUCIRUOTA_${i}`);
    }
  }
  
  // Ultimo Round
  if (config.ultimoEnabled) {
    phases.push('ULTIMO_ROUND');
  }
  
  // Finale
  if (config.finaleEnabled) {
    phases.push('FINALE');
  }
  
  return phases;
}

/**
 * Imposta la configurazione della partita
 */
function setGameConfig(config) {
  state.game.config = { ...state.game.config, ...config };
}

/**
 * Inizia una nuova partita
 */
function startNewGame(config = null) {
  if (state.players.length < 2) {
    return { ok: false, msg: 'Servono almeno 2 giocatori.' };
  }
  
  // Usa la configurazione passata o quella esistente
  const gameConfig = config || state.game.config;
  
  // Costruisci le fasi attive
  const activePhases = buildActivePhases(gameConfig);
  
  if (activePhases.length === 0) {
    return { ok: false, msg: 'Seleziona almeno un tipo di round.' };
  }
  
  // Reset stato partita
  state.game = {
    phase: activePhases[0],
    previousPhase: null,
    loadedPhrases: {},
    started: true,
    fastRoundsCompleted: 0,
    fastStreakPlayer: null,
    fastStreakCount: 0,
    traditionalRoundsCompleted: 0,
    cruciruotaCompleted: false,
    ultimoRoundCompleted: false,
    config: gameConfig,
    activePhases: activePhases
  };
  
  // Reset indici frasi usate per una nuova randomizzazione
  state.usedPhraseIndices = [];
  state.categoryStats = {}; // Reset statistiche categorie
  
  // Se in modalità random, mescola l'array delle frasi all'inizio della partita
  // per evitare che vengano prese in ordine di categoria
  if (state.phraseMode === 'random' && state.phrases.length > 0) {
    // Crea una copia dell'array e mescolalo usando Fisher-Yates
    // Mescola più volte per garantire una randomizzazione migliore
    const shuffled = [...state.phrases];
    for (let shuffleRound = 0; shuffleRound < 3; shuffleRound++) {
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
    }
    state.phrases = shuffled;
    
    // Verifica e mostra tutte le categorie disponibili
    const allCategories = [...new Set(state.phrases.map(p => p.category))];
    const categoryCounts = {};
    state.phrases.forEach(p => {
      categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
    });
    
    // Verifica il mescolamento controllando le prime 10 frasi
    const first10Categories = state.phrases.slice(0, 10).map(p => p.category);
    const uniqueInFirst10 = [...new Set(first10Categories)].length;
    
  }
  
  // Genera e salva tutti i tabelloni cruciruota all'inizio della partita
  state.crupiruota.savedBoards = {};
  state.crupiruota.usedPhraseIndices = [];
  
  const cruciruotaPhases = activePhases.filter(p => p.startsWith('CRUCIRUOTA'));
  for (const phase of cruciruotaPhases) {
    // Genera un tabellone per questa fase
    loadCruciruotaPhrase();
    // Salva lo stato del tabellone generato
    saveCruciruotaBoardState(phase);
  }
  
  // Reset punteggi giocatori
  for (const player of state.players) {
    player.match = 0;
    player.game = 0;
  }
  
  state.currentPlayerIndex = 0;
  
  return { 
    ok: true, 
    phase: activePhases[0], 
    msg: `Partita iniziata! ${getPhaseDisplayName(activePhases[0])}` 
  };
}

/**
 * Ottiene il giocatore con il punteggio più alto (gioco)
 */
function getHighestScorePlayerIndex() {
  let maxScore = -1;
  let maxIndex = 0;
  for (let i = 0; i < state.players.length; i++) {
    if (state.players[i].game > maxScore) {
      maxScore = state.players[i].game;
      maxIndex = i;
    }
  }
  return maxIndex;
}

/**
 * Controlla se c'è un vincitore unico (nessun pareggio al primo posto)
 * Ritorna true se c'è un solo giocatore con il punteggio più alto
 */
function hasUniqueWinner() {
  if (state.players.length === 0) return false;
  
  let maxScore = -Infinity;
  let count = 0;
  
  // Trova il punteggio massimo
  for (const player of state.players) {
    if (player.game > maxScore) {
      maxScore = player.game;
    }
  }
  
  // Conta quanti giocatori hanno il punteggio massimo
  for (const player of state.players) {
    if (player.game === maxScore) {
      count++;
    }
  }
  
  return count === 1;
}

/**
 * Ottiene il giocatore con il punteggio più basso (gioco)
 */
function getLowestScorePlayerIndex() {
  let minScore = Infinity;
  let minIndex = 0;
  for (let i = 0; i < state.players.length; i++) {
    if (state.players[i].game < minScore) {
      minScore = state.players[i].game;
      minIndex = i;
    }
  }
  return minIndex;
}

/**
 * Completa un round FAST e passa al successivo
 */
function completeFastRound(winnerIndex) {
  const winner = state.players[winnerIndex];
  
  // Aggiungi bonus FAST direttamente al punteggio gioco
  winner.game += FAST_WIN_BONUS;
  
  // Gestisci streak
  if (state.game.fastStreakPlayer === winnerIndex) {
    state.game.fastStreakCount++;
  } else {
    state.game.fastStreakPlayer = winnerIndex;
    state.game.fastStreakCount = 1;
  }
  
  state.game.fastRoundsCompleted++;
  
  // Se ha vinto tutti e 3, bonus streak
  if (state.game.fastStreakCount === 3) {
    winner.game += FAST_BONUS_STREAK;
    return {
      ok: true,
      type: 'streakBonus',
      winnerName: winner.name,
      bonus: FAST_BONUS_STREAK,
      msg: `${winner.name} ha vinto tutti e 3 i FAST! BONUS €${FAST_BONUS_STREAK}!`
    };
  }
  
  return {
    ok: true,
    type: 'fastWin',
    winnerName: winner.name,
    roundsCompleted: state.game.fastRoundsCompleted,
    msg: `${winner.name} vince il FAST ${state.game.fastRoundsCompleted}!`
  };
}

/**
 * Avanza alla fase successiva della partita
 */
function advanceToNextPhase() {
  const activePhases = state.game.activePhases;
  const currentPhase = state.game.phase;
  const currentIndex = activePhases.indexOf(currentPhase);
  
  if (currentIndex === -1 || currentIndex >= activePhases.length - 1) {
    return { ok: false, msg: 'Partita terminata.' };
  }
  
  const nextPhase = activePhases[currentIndex + 1];
  state.game.phase = nextPhase;
  
  // Determina chi inizia la nuova fase
  let starterIndex = 0;
  let starterReason = '';
  
  if (nextPhase.startsWith('TRADITIONAL')) {
    // Chi ha più soldi inizia i tradizionali
    starterIndex = getHighestScorePlayerIndex();
    starterReason = 'Punteggio più alto';
  } else if (nextPhase.startsWith('CRUCIRUOTA')) {
    // Chi ha più soldi inizia il cruciruota
    starterIndex = getHighestScorePlayerIndex();
    starterReason = 'Punteggio più alto';
  } else if (nextPhase === 'ULTIMO_ROUND') {
    // Chi ha MENO soldi inizia
    starterIndex = getLowestScorePlayerIndex();
    starterReason = 'Punteggio più basso (ultima possibilità)';
  } else if (nextPhase === 'FINALE') {
    // Chi ha PIÙ soldi va al finale
    starterIndex = getHighestScorePlayerIndex();
    starterReason = 'Punteggio più alto - accede al Finale!';
  }
  
  state.currentPlayerIndex = starterIndex;
  
  return {
    ok: true,
    phase: nextPhase,
    starterIndex: starterIndex,
    starterName: state.players[starterIndex]?.name || 'Giocatore',
    starterReason: starterReason,
    msg: `Fase: ${getPhaseDisplayName(nextPhase)} - Inizia ${state.players[starterIndex]?.name}`
  };
}

/**
 * Salta a una fase specifica
 */
function jumpToPhase(targetPhase) {
  const activePhases = state.game.activePhases;
  if (!activePhases.includes(targetPhase)) {
    return { ok: false, msg: 'Fase non valida o non attiva.' };
  }
  
  state.game.phase = targetPhase;
  
  // Determina chi inizia
  let starterIndex = state.currentPlayerIndex;
  if (targetPhase === 'ULTIMO_ROUND') {
    starterIndex = getLowestScorePlayerIndex();
  } else if (targetPhase === 'FINALE') {
    starterIndex = getHighestScorePlayerIndex();
  } else {
    starterIndex = getHighestScorePlayerIndex();
  }
  
  state.currentPlayerIndex = starterIndex;
  
  return {
    ok: true,
    phase: targetPhase,
    starterIndex: starterIndex,
    msg: getPhaseDisplayName(targetPhase)
  };
}

/**
 * Termina la partita
 */
function endGame() {
  state.game.phase = 'SETUP';
  state.game.started = false;
  
  // Trova il vincitore
  const winnerIndex = getHighestScorePlayerIndex();
  const winner = state.players[winnerIndex];
  
  return {
    ok: true,
    winnerIndex: winnerIndex,
    winnerName: winner?.name || 'Nessuno',
    winnerScore: winner?.game || 0,
    msg: `Partita terminata! Vince ${winner?.name} con €${winner?.game}!`
  };
}

/**
 * Ottiene il nome visualizzabile di una fase
 */
function getPhaseDisplayName(phase) {
  // Estrai il numero e il tipo dalla fase
  if (phase.startsWith('FAST_')) {
    const num = phase.split('_')[1];
    return `${num} ROUND FAST`;
  } else if (phase.startsWith('TRADITIONAL_')) {
    const num = phase.split('_')[1];
    return `${num} ROUND TRADIZIONALE`;
  } else if (phase.startsWith('CRUCIRUOTA_')) {
    const num = phase.split('_')[1];
    return `${num} ROUND CRUCIRUOTA`;
  } else if (phase === 'ULTIMO_ROUND') {
    return 'ULTIMO ROUND';
  } else if (phase === 'FINALE') {
    return 'ROUND FINALE';
  } else if (phase === 'SETUP') {
    return 'Setup';
  }
  
  return phase;
}

/**
 * Ottiene le fasi disponibili per il salto
 */
function getAvailablePhases() {
  return state.game.activePhases || [];
}

// ==========================================
// RENDERING TABELLONE
// ==========================================

/**
 * Genera l'HTML del tabellone
 */
function renderBoardHTML() {
  let html = '';
  let slotIndex = 0;
  
  for (let row = 0; row < BOARD_LAYOUT.length; row++) {
    const cellsInRow = BOARD_LAYOUT[row];
    html += '<div class="board-row">';
    
    for (let col = 0; col < cellsInRow; col++) {
      const slot = state.slots[slotIndex] || { char: '', charOriginal: '', revealed: false, isSpace: false, isEmpty: true };
      
      let cellClasses = ['cell'];
      
      // Cella vuota o spazio - stile uniforme nero
      if (slot.isEmpty || slot.isSpace || !slot.char) {
        cellClasses.push('unused');
      } else {
        // Cella con lettera
        if (slot.revealed) {
          cellClasses.push('revealed', 'has-letter');
        } else {
          cellClasses.push('hidden');
        }
      }
      
      // Mostra il carattere originale (con accenti/apostrofo) quando rivelato
      const displayChar = (slot.revealed && slot.char) ? (slot.charOriginal || slot.char) : '';
      
      html += `<div class="${cellClasses.join(' ')}" data-index="${slotIndex}">`;
      html += `<span>${displayChar}</span>`;
      html += '</div>';
      
      slotIndex++;
    }
    
    html += '</div>';
  }
  
  return html;
}

/**
 * Genera l'HTML della categoria
 */
function renderCategoryHTML() {
  return state.category || '— CATEGORIA —';
}

/**
 * Genera l'HTML dei giocatori
 */
function renderPlayersHTML(mode = 'normal') {
  if (state.players.length === 0) {
    return '<div class="empty-state"><div class="empty-state-text">Nessun giocatore impostato</div></div>';
  }
  
  let html = '';
  
  state.players.forEach((player, index) => {
    const isActive = (state.mode === 'FINAL') 
      ? (index === state.final.finalistIndex)
      : (index === state.currentPlayerIndex);
    
    const colorIndex = (index % 6) + 1;
    
    html += `
      <div class="player-card ${isActive ? 'active' : ''}" data-color="${colorIndex}" data-index="${index}">
        <div class="player-info">
          <div class="player-name">${player.name}</div>
          <div class="player-index">Giocatore #${index + 1}</div>
        </div>
        <div class="player-scores">
          <div class="score-badge match">
            <span class="score-label">Match</span>
            <span class="score-value">${player.match.toLocaleString('it-IT')}</span>
          </div>
          <div class="score-badge game">
            <span class="score-label">Gioco</span>
            <span class="score-value">${player.game.toLocaleString('it-IT')}</span>
          </div>
        </div>
      </div>
    `;
  });
  
  return html;
}

/**
 * Genera l'HTML della lista frasi (per admin)
 */
function renderPhrasesListHTML() {
  if (state.phrases.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <div class="empty-state-text">Nessuna frase nell'archivio</div>
      </div>
    `;
  }
  
  let html = '';
  
  state.phrases.forEach((item, index) => {
    const isSelected = index === state.ui.selectedPhraseIndex;
    const cellsUsed = countPhraseCells(item.phrase);
    
    html += `
      <div class="phrase-item ${isSelected ? 'selected' : ''}" data-index="${index}">
        <div class="phrase-category">${item.category || 'Senza categoria'}</div>
        <div class="phrase-text">${item.phrase}</div>
        <div class="phrase-meta">
          <span class="phrase-length badge">${cellsUsed}/${TOTAL_CELLS} celle</span>
          <div class="phrase-actions">
            <button class="btn btn-sm btn-secondary btn-edit-phrase" data-index="${index}">Modifica</button>
            <button class="btn btn-sm btn-danger btn-delete-phrase" data-index="${index}">Elimina</button>
          </div>
        </div>
      </div>
    `;
  });
  
  return html;
}

// ==========================================
// EXPORT PER USO GLOBALE
// ==========================================

// Esporta tutto nello scope globale per uso dalle pagine HTML
window.RuotaApp = {
  // Stato
  state,
  
  // Costanti
  TOTAL_CELLS,
  BOARD_LAYOUT,
  BONUS_SOLUZIONE_NORMAL,
  BONUS_FAST,
  FINAL_TIMER_SECONDS,
  FAST_INTERVAL_MS,
  VOWEL_COST,
  VOWELS,
  CONSONANTS,
  
  // Utility
  normalizeText,
  sanitizePhrase,
  countPhraseCells,
  parseWordToTokens,
  shuffle,
  formatTime,
  getTimestamp,
  
  // Storage
  loadPhrases,
  savePhrases,
  loadSettings,
  saveSettings,
  loadPanelState,
  savePanelState,
  
  // Frasi
  addPhrase,
  editPhrase,
  deletePhrase,
  getNextPhrase,
  verifyAllCategories,
  
  // Tabellone
  buildSlotsFromPhrase,
  revealLetter,
  revealLetters,
  hideAllLetters,
  revealAll,
  checkSolution,
  revealTestacoda,
  playLetterRevealSound,
  
  // Vocali e Consonanti
  isVowel,
  isConsonant,
  isLetterUsed,
  markLetterUsed,
  getRemainingVowelsInPhrase,
  getRemainingConsonantsInPhrase,
  areAllVowelsUsed,
  areAllConsonantsUsed,
  canBuyVowel,
  buyVowel,
  
  // Giocatori
  setPlayers,
  nextPlayer,
  resetMatchAll,
  resetMatchOthers,
  getFinalCandidateIndex,
  
  // Parsing
  parseWheelValue,
  
  // Normal mode
  applyNormalAction,
  useJolly,
  declineJolly,
  
  // Fast mode
  prepareFastPositions,
  startFastMode,
  stopFastMode,
  tryFastSolution,
  
  // Final mode
  startFinalMode,
  applyFinalLetters,
  startFinalTimer,
  stopFinalTimer,
  goToTestacoda,
  goToRoundLibero,
  applyFinalFreeLetter,
  tryFinalSolution,
  
  // Ultimo Round mode
  startUltimoRound,
  setUltimoRoundValue,
  applyUltimoRoundAction,
  stopUltimoRound,
  
  // Cruciruota mode
  startCruciruota,
  loadCruciruotaPhrase,
  buildCruciruotaBoard,
  getNextCruciruotaPhrase,
  revealAllCruciruota,
  hideAllCruciruota,
  stopCruciruota,
  
  // Game management
  startNewGame,
  setGameConfig,
  buildActivePhases,
  completeFastRound,
  advanceToNextPhase,
  jumpToPhase,
  endGame,
  getPhaseDisplayName,
  getAvailablePhases,
  getHighestScorePlayerIndex,
  getLowestScorePlayerIndex,
  hasUniqueWinner,
  
  // Rendering
  renderBoardHTML,
  renderCategoryHTML,
  renderPlayersHTML,
  renderPhrasesListHTML
};

// Inizializzazione automatica al caricamento
document.addEventListener('DOMContentLoaded', async () => {
  // IMPORTANTE: Carica prima le impostazioni per sapere la modalità corretta
  loadSettings();
  
  // Poi carica le frasi (che mescolerà se la modalità è random)
  await loadPhrases();
  
  // Se la modalità è random e le frasi sono state caricate, rimischia per sicurezza
  if (state.phraseMode === 'random' && state.phrases.length > 0) {
    const shuffled = [...state.phrases];
    for (let shuffleRound = 0; shuffleRound < 3; shuffleRound++) {
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
    }
    state.phrases = shuffled;
  }
  
  loadPanelState();
  
});


