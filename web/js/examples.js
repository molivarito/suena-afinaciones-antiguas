/**
 * examples.js - Ejemplos musicales para demostrar las diferencias entre afinaciones.
 *
 * Cada ejemplo genera un array de eventos con formato:
 *   { notes: [midi, ...], duration: quarterLengths, offset: quarterLengths, velocity: 0-1 }
 */

const MUSICAL_EXAMPLES = [
    {
        id: 'chromatic',
        icon: '\uD83C\uDFBC',
        name: 'Escala Cromatica',
        description: 'Las 12 notas cromaticas ascendentes de Do4 a Do5. Permite escuchar como cada nota difiere del temperamento igual.',
        generate: () => {
            const events = [];
            for (let i = 0; i <= 12; i++) {
                events.push({
                    notes: [60 + i],
                    duration: 0.5,
                    offset: i * 0.55,
                    velocity: 0.7
                });
            }
            return events;
        }
    },
    {
        id: 'major_scale',
        icon: '\uD83C\uDFB5',
        name: 'Escala de Do Mayor',
        description: 'La escala diatonica mayor. En afinacion justa y mesotonico, los intervalos son acusticamente puros. En pitagorica, las terceras son asperas.',
        generate: () => {
            const scale = [60, 62, 64, 65, 67, 69, 71, 72]; // C D E F G A B C
            const events = [];
            scale.forEach((note, i) => {
                events.push({
                    notes: [note],
                    duration: 0.75,
                    offset: i * 0.8,
                    velocity: 0.7
                });
            });
            return events;
        }
    },
    {
        id: 'major_third',
        icon: '\uD83C\uDFB6',
        name: 'Tercera Mayor (Do-Mi)',
        description: 'La tercera mayor es el intervalo que mas varia entre afinaciones. Pura (386c) en justa/mesotonnico, ancha (408c) en pitagorica, intermedia (400c) en temperamento igual.',
        generate: () => {
            // Primero las notas sueltas, luego juntas
            return [
                { notes: [60], duration: 1.0, offset: 0, velocity: 0.7 },
                { notes: [64], duration: 1.0, offset: 1.2, velocity: 0.7 },
                { notes: [60, 64], duration: 2.5, offset: 2.6, velocity: 0.65 },
            ];
        }
    },
    {
        id: 'perfect_fifth',
        icon: '\uD83C\uDFB6',
        name: 'Quinta Justa (Do-Sol)',
        description: 'La quinta justa (3:2) es pura en pitagorica y justa, y apenas estrecha en los temperamentos. Es el intervalo mas consonante despues de la octava.',
        generate: () => {
            return [
                { notes: [60], duration: 1.0, offset: 0, velocity: 0.7 },
                { notes: [67], duration: 1.0, offset: 1.2, velocity: 0.7 },
                { notes: [60, 67], duration: 2.5, offset: 2.6, velocity: 0.65 },
            ];
        }
    },
    {
        id: 'c_major_chord',
        icon: '\uD83C\uDFB9',
        name: 'Acorde de Do Mayor',
        description: 'El acorde de triada mayor (Do-Mi-Sol). En afinacion justa y mesotonnico suena sereno y resonante. En pitagorica, la tercera ancha le da tension.',
        generate: () => {
            return [
                { notes: [60], duration: 0.8, offset: 0, velocity: 0.7 },
                { notes: [64], duration: 0.8, offset: 0.5, velocity: 0.7 },
                { notes: [67], duration: 0.8, offset: 1.0, velocity: 0.7 },
                { notes: [60, 64, 67], duration: 3.0, offset: 2.0, velocity: 0.6 },
            ];
        }
    },
    {
        id: 'wolf_fifth',
        icon: '\uD83D\uDC3A',
        name: 'Quinta del Lobo (Sol#-Mib)',
        description: 'El intervalo "prohibido" de las afinaciones historicas. En pitagorica (~678c) y mesotonnico (~737c) es terriblemente disonante. En los temperamentos circulares suena normal.',
        generate: () => {
            // G#3 = 56, Eb4 = 63
            return [
                { notes: [56], duration: 1.0, offset: 0, velocity: 0.7 },
                { notes: [63], duration: 1.0, offset: 1.2, velocity: 0.7 },
                { notes: [56, 63], duration: 3.0, offset: 2.6, velocity: 0.65 },
            ];
        }
    },
    {
        id: 'all_triads',
        icon: '\uD83C\uDFB9',
        name: 'Todas las Triadas Mayores',
        description: 'Las 12 triadas mayores cromaticas. En temperamento igual, todas suenan identicas. En afinaciones historicas, cada tonalidad tiene un "color" unico.',
        generate: () => {
            const events = [];
            for (let i = 0; i < 12; i++) {
                const root = 48 + i; // C3 upward
                events.push({
                    notes: [root, root + 4, root + 7],
                    duration: 1.2,
                    offset: i * 1.5,
                    velocity: 0.6
                });
            }
            return events;
        }
    },
    {
        id: 'cadence',
        icon: '\uD83C\uDFBC',
        name: 'Cadencia I-IV-V-I',
        description: 'La progresion armonica mas fundamental de la musica occidental. Permite apreciar como el "color" armonico cambia segun la afinacion.',
        generate: () => {
            // C major: I(C-E-G) - IV(F-A-C) - V(G-B-D) - I(C-E-G)
            return [
                // I - Do Mayor
                { notes: [48, 60, 64, 67], duration: 2.0, offset: 0, velocity: 0.6 },
                // IV - Fa Mayor
                { notes: [53, 60, 65, 69], duration: 2.0, offset: 2.2, velocity: 0.6 },
                // V - Sol Mayor
                { notes: [55, 59, 67, 71], duration: 2.0, offset: 4.4, velocity: 0.6 },
                // I - Do Mayor (resolucion)
                { notes: [48, 60, 64, 67], duration: 3.0, offset: 6.6, velocity: 0.65 },
            ];
        }
    },
];
