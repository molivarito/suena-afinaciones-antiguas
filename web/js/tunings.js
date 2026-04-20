/**
 * tunings.js - Sistemas de afinacion historicos.
 *
 * Cada afinacion se calcula algoritmicamente desde primeros principios
 * (cadenas de quintas puras y temperadas) para garantizar precision
 * musicologica. Los valores estan verificados contra fuentes canonicas.
 */

// Constantes acusticas fundamentales
const PURE_FIFTH   = 1200 * Math.log2(3 / 2);            // 701.955 cents
const PYTH_COMMA   = 1200 * Math.log2(Math.pow(3, 12) / Math.pow(2, 19)); // 23.460 cents
const SYNT_COMMA   = 1200 * Math.log2(81 / 80);           // 21.506 cents
const SCHISMA      = PYTH_COMMA - SYNT_COMMA;              // 1.954 cents

const NOTE_NAMES = ['Do', 'Do#', 'Re', 'Mib', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'Sib', 'Si'];
const NOTE_NAMES_EN = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

/**
 * Clase base para sistemas de afinacion.
 * Todas las subclases implementan _buildCents() que retorna un array de 12 valores
 * en cents desde C (indice 0) hasta B (indice 11).
 */
class TuningSystem {
    constructor(id, name, shortName, description, period) {
        this.id = id;
        this.name = name;
        this.shortName = shortName;
        this.description = description;
        this.period = period; // epoca historica
        this.cents = this._buildCents();
    }

    _buildCents() {
        throw new Error('Subclasses must implement _buildCents()');
    }

    /**
     * Retorna la frecuencia en Hz para una nota MIDI dada.
     * @param {number} midiNote - Nota MIDI (0-127), donde 69 = A4 = 440 Hz
     * @param {number} baseFreq - Frecuencia de referencia para A4 (default 440)
     */
    getFrequency(midiNote, baseFreq = 440) {
        const noteIndex = ((midiNote % 12) + 12) % 12; // 0-11
        const octave = Math.floor(midiNote / 12);
        const baseOctave = Math.floor(69 / 12); // octava de A4

        // Frecuencia de C en la octava de referencia
        const cFreq = baseFreq / Math.pow(2, this.cents[9] / 1200);
        // Frecuencia de la nota en la octava de referencia
        const noteFreq = cFreq * Math.pow(2, this.cents[noteIndex] / 1200);
        // Ajustar por diferencia de octavas
        return noteFreq * Math.pow(2, octave - baseOctave);
    }

    /**
     * Retorna la desviacion en cents respecto al temperamento igual para cada nota.
     */
    getDeviationsFromET() {
        return this.cents.map((c, i) => c - i * 100);
    }
}

// === IMPLEMENTACIONES ===

class EqualTemperament extends TuningSystem {
    constructor() {
        super(
            'equal',
            'Temperamento Igual',
            '12-TET',
            `El estandar universal de la musica occidental desde finales del siglo XIX. La octava se divide en doce semitonos <em>exactamente iguales</em>. Cada semitono representa una relacion de frecuencia identica (raiz 12 de 2).

<strong>Sonoridad:</strong> Caracter homogeneo y neutro. Libertad total de modulacion: una pieza puede transponerse a cualquier tonalidad y sonara funcionalmente identica. Sin embargo, ningún intervalo (excepto la octava) es acusticamente puro. Las terceras mayores son notablemente mas "tensas" (400 cents vs. 386 puros) y las quintas ligeramente estrechas (700 vs. 702 puros).`,
            'Siglo XIX - presente'
        );
    }
    _buildCents() {
        return Array.from({length: 12}, (_, i) => i * 100);
    }
}

class PythagoreanTuning extends TuningSystem {
    constructor() {
        super(
            'pythagorean',
            'Afinacion Pitagorica',
            'Pitagorica',
            `El sistema de afinacion teorico mas antiguo e influyente de la cultura occidental, atribuido a la escuela de Pitagoras. Todas las notas se generan a partir de una cadena de quintas acusticamente puras (ratio 3:2).

<strong>Sonoridad:</strong> Las quintas y cuartas son perfectas, expansivas y resonantes, ideal para musica melodica monofonica (canto gregoriano) y polifonia temprana. Su gran problema es la <strong>tercera mayor pitagorica</strong> (ratio 81:64, 408 cents), muy ancha y aspera. La <em>quinta del lobo</em> entre Sol# y Mib es extremadamente disonante (678 cents).`,
            'Antiguedad - s. XV'
        );
    }
    _buildCents() {
        // 8 quintas ascendentes desde C + 3 descendentes. Lobo entre G# y Eb.
        // Ratios exactos: C=1/1, C#=2187/2048, D=9/8, Eb=32/27, E=81/64, F=4/3,
        // F#=729/512, G=3/2, G#=6561/4096, A=27/16, Bb=16/9, B=243/128
        const ratios = [1/1, 2187/2048, 9/8, 32/27, 81/64, 4/3, 729/512, 3/2, 6561/4096, 27/16, 16/9, 243/128];
        return ratios.map(r => 1200 * Math.log2(r));
    }
}

class JustIntonation extends TuningSystem {
    constructor() {
        super(
            'just',
            'Afinacion Justa (en Do)',
            'Justa',
            `Un sistema idealista que busca la maxima pureza y consonancia acustica. Se construye a partir de proporciones de numeros enteros pequenos y simples, como la quinta justa (3:2) y la tercera mayor pura (5:4).

<strong>Sonoridad:</strong> En Do Mayor, la sonoridad es increiblemente serena, estable y resonante; los acordes "vibran" al unisono de manera perfecta. Al alejarse del centro tonal, las proporciones dejan de encajar y aparecen intervalos extremadamente disonantes, haciendo inviables ciertas tonalidades.`,
            'Teorica (Renacimiento)'
        );
    }
    _buildCents() {
        // Escala cromatica justa de 5-limite en Do Mayor.
        // F# = 45/32 = cuarta aumentada estandar (= 9/8 x 5/4)
        const ratios = [1/1, 16/15, 9/8, 6/5, 5/4, 4/3, 45/32, 3/2, 8/5, 5/3, 9/5, 15/8];
        return ratios.map(r => 1200 * Math.log2(r));
    }
}

class MeantoneTuning extends TuningSystem {
    constructor() {
        super(
            'meantone',
            'Mesotonnico (1/4 de coma)',
            'Mesotonnico',
            `El temperamento por excelencia del Renacimiento tardio y gran parte del Barroco (aprox. 1500-1750). Su objetivo principal es conseguir <strong>terceras mayores perfectamente puras</strong> (ratio 5:4).

<strong>Sonoridad:</strong> Para lograr terceras puras, las quintas se "estrechan" ligeramente (696.6 cents). El resultado en tonalidades con pocas alteraciones es una sonoridad dulce, vocal y de una pureza extraordinaria. Sin embargo, toda la disonancia se acumula en una unica <em>quinta del lobo</em> (tipicamente entre Sol# y Mib), tan horriblemente disonante que resulta inutilizable.`,
            's. XVI - XVIII'
        );
    }
    _buildCents() {
        // Quinta mesotonnica = 5^(1/4) en ratio = 696.578 cents
        const fifth = 1200 * Math.log2(Math.pow(5, 1/4));
        const cents = new Array(12).fill(0);
        // Ascendentes
        [[7,1],[2,2],[9,3],[4,4],[11,5],[6,6],[1,7],[8,8]].forEach(([idx, n]) => {
            cents[idx] = ((n * fifth) % 1200 + 1200) % 1200;
        });
        // Descendentes
        [[5,1],[10,2],[3,3]].forEach(([idx, n]) => {
            cents[idx] = ((-n * fifth) % 1200 + 1200) % 1200;
        });
        return cents;
    }
}

class WerckmeisterTuning extends TuningSystem {
    constructor() {
        super(
            'werckmeister',
            'Werckmeister III',
            'Werckmeister',
            `Publicado en 1691, es uno de los primeros y mas celebres <strong>temperamentos "buenos"</strong> (o "bien temperados"). Fue disenado por Andreas Werckmeister para que <em>todas las tonalidades fueran utilizables</em>, asignando a cada una un "color" o caracter afectivo unico.

<strong>Sonoridad:</strong> Cuatro quintas se atemperan en 1/4 de la coma pitagorica, dejando ocho puras. Las tonalidades cercanas a Do Mayor suenan puras y estables, mientras que las mas distantes adquieren tension creciente. Es un sistema ideal para la musica de J.S. Bach, donde el caracter de cada tonalidad es un recurso expresivo.`,
            '1691'
        );
    }
    _buildCents() {
        // 4 quintas temperadas (C-G, G-D, D-A, B-F#) por 1/4 coma pitagorica
        // 8 quintas puras
        const tf = PURE_FIFTH - PYTH_COMMA / 4; // 696.090 cents
        const pf = PURE_FIFTH;
        const cents = new Array(12).fill(0);
        cents[7]  = tf;                            // G  (temperada)
        cents[2]  = (cents[7] + tf) % 1200;        // D  (temperada)
        cents[9]  = cents[2] + tf;                  // A  (temperada)
        cents[4]  = (cents[9] + pf) % 1200;        // E  (pura)
        cents[11] = cents[4] + pf;                  // B  (pura)
        cents[6]  = (cents[11] + tf) % 1200;        // F# (temperada)
        cents[1]  = (cents[6] + pf) % 1200;         // C# (pura)
        cents[8]  = cents[1] + pf;                  // G# (pura)
        cents[3]  = (cents[8] + pf) % 1200;         // Eb (pura)
        cents[10] = cents[3] + pf;                  // Bb (pura)
        cents[5]  = (cents[10] + pf) % 1200;        // F  (pura)
        return cents;
    }
}

class KirnbergerTuning extends TuningSystem {
    constructor() {
        super(
            'kirnberger',
            'Kirnberger III',
            'Kirnberger',
            `Un fascinante temperamento irregular atribuido a Johann Kirnberger, alumno de J.S. Bach. Es un sistema hibrido que reconcilia la pureza de la afinacion justa con la versatilidad de los temperamentos circulares.

<strong>Sonoridad:</strong> Su rasgo mas distintivo es que mantiene la <strong>tercera Do-Mi perfectamente pura</strong> (386.3 cents = ratio 5:4), al igual que en la afinacion justa. Cuatro quintas se atemperan por 1/4 de coma sintonnica y una quinta se reduce un schisma. Esto dota a cada tonalidad de un caracter extremadamente distintivo.`,
            'c. 1779'
        );
    }
    _buildCents() {
        // 4 quintas temperadas (C-G, G-D, D-A, A-E) por 1/4 coma sintonnica
        // 1 quinta esquismatica (F#-C#)
        // 7 quintas puras
        const tf = PURE_FIFTH - SYNT_COMMA / 4;  // 696.578 cents
        const sf = PURE_FIFTH - SCHISMA;           // 700.001 cents
        const pf = PURE_FIFTH;
        const cents = new Array(12).fill(0);
        cents[7]  = tf;                             // G  (temperada 1/4 SC)
        cents[2]  = (cents[7] + tf) % 1200;         // D  (temperada)
        cents[9]  = cents[2] + tf;                   // A  (temperada)
        cents[4]  = (cents[9] + tf) % 1200;          // E  (temperada -> tercera pura!)
        cents[11] = cents[4] + pf;                   // B  (pura)
        cents[6]  = (cents[11] + pf) % 1200;         // F# (pura)
        cents[1]  = (cents[6] + sf) % 1200;          // C# (esquismatica)
        cents[8]  = cents[1] + pf;                   // G# (pura)
        cents[3]  = (cents[8] + pf) % 1200;          // Eb (pura)
        cents[10] = cents[3] + pf;                   // Bb (pura)
        cents[5]  = (cents[10] + pf) % 1200;         // F  (pura)
        return cents;
    }
}

class VallottiTuning extends TuningSystem {
    constructor() {
        super(
            'vallotti',
            'Vallotti',
            'Vallotti',
            `Un elegante y equilibrado temperamento circular desarrollado por Francesco Vallotti a mediados del siglo XVIII. Muy popular en Italia y uno de los mas utilizados hoy para interpretar musica del Barroco tardio.

<strong>Sonoridad:</strong> Construccion simple y simetrica: las seis quintas "naturales" (Fa a Si) se atemperan por 1/6 de coma pitagorica; las seis quintas "con sostenidos" (Si a Fa) se dejan puras. Resultado: un degradado sonoro suave donde las tonalidades con pocas alteraciones son consonantes y las mas distantes ganan tension expresiva gradual, sin ninguna tonalidad "mala".`,
            'c. 1750'
        );
    }
    _buildCents() {
        // 6 quintas temperadas (F-C-G-D-A-E-B) por 1/6 coma pitagorica
        // 6 quintas puras (B-F#-C#-G#-Eb-Bb-F)
        const tf = PURE_FIFTH - PYTH_COMMA / 6; // 698.045 cents
        const pf = PURE_FIFTH;
        const cents = new Array(12).fill(0);
        cents[7]  = tf;                             // G  (temperada)
        cents[2]  = (cents[7] + tf) % 1200;         // D  (temperada)
        cents[9]  = cents[2] + tf;                   // A  (temperada)
        cents[4]  = (cents[9] + tf) % 1200;          // E  (temperada)
        cents[11] = cents[4] + tf;                   // B  (temperada)
        cents[6]  = (cents[11] + pf) % 1200;         // F# (pura)
        cents[1]  = (cents[6] + pf) % 1200;          // C# (pura)
        cents[8]  = cents[1] + pf;                   // G# (pura)
        cents[3]  = (cents[8] + pf) % 1200;          // Eb (pura)
        cents[10] = cents[3] + pf;                   // Bb (pura)
        cents[5]  = (cents[10] + pf) % 1200;         // F  (pura)
        return cents;
    }
}

// === REGISTRO ===

const TUNING_SYSTEMS = [
    new EqualTemperament(),
    new PythagoreanTuning(),
    new JustIntonation(),
    new MeantoneTuning(),
    new WerckmeisterTuning(),
    new KirnbergerTuning(),
    new VallottiTuning(),
];

function getTuningById(id) {
    return TUNING_SYSTEMS.find(t => t.id === id);
}
