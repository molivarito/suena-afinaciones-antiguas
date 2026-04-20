/**
 * consonance.js - Ranking de consonancia de acordes bajo distintas afinaciones.
 *
 * Set de acordes: 12 mayores (X13#11 = X7 + triada mayor sobre la 9) y
 * 12 menores (Xm13 = Xm7 + triada menor sobre la 9).
 */

// === DEFINICION DE LOS ACORDES ===

// Intervalos (semitonos) desde la fundamental
const MAJOR_INTERVALS = [0, 4, 7, 10, 14, 18, 21]; // 1 3 5 b7 9 #11 13
const MINOR_INTERVALS = [0, 3, 7, 10, 14, 17, 21]; // 1 b3 5 b7 9 11 13

// Pitch classes (0-11) con spelling preferido segun la imagen
const FUND_PCS = [
    {pc: 0,  name: 'C'},
    {pc: 1,  name: 'Db'},
    {pc: 2,  name: 'D'},
    {pc: 3,  name: 'Eb'},
    {pc: 4,  name: 'E'},
    {pc: 5,  name: 'F'},
    {pc: 6,  name: 'F#'},
    {pc: 7,  name: 'G'},
    {pc: 8,  name: 'Ab'},
    {pc: 9,  name: 'A'},
    {pc: 10, name: 'Bb'},
    {pc: 11, name: 'B'},
];

function buildChordSet(rootOctave) {
    const chords = [];
    const baseMidi = 12 * (rootOctave + 1); // C0 = MIDI 12 en convencion 69=A4
    for (const f of FUND_PCS) {
        chords.push({
            id: `maj-${f.name}`,
            quality: 'mayor',
            root: f.name,
            label: `${f.name}13(#11)`,
            notes: MAJOR_INTERVALS.map(i => baseMidi + f.pc + i),
        });
    }
    for (const f of FUND_PCS) {
        chords.push({
            id: `min-${f.name}`,
            quality: 'menor',
            root: f.name,
            label: `${f.name}m13`,
            notes: MINOR_INTERVALS.map(i => baseMidi + f.pc + i),
        });
    }
    return chords;
}

// === UTILIDADES MATEMATICAS ===

/**
 * Aproximacion racional por fracciones continuas (convergente con denom <= maxDenom).
 */
function nearestRational(x, maxDenom = 99) {
    if (x <= 0) return [0, 1];
    let h0 = 0, h1 = 1, k0 = 1, k1 = 0;
    let v = x;
    for (let iter = 0; iter < 40; iter++) {
        const a = Math.floor(v);
        const h2 = a * h1 + h0;
        const k2 = a * k1 + k0;
        if (k2 > maxDenom) break;
        h0 = h1; h1 = h2; k0 = k1; k1 = k2;
        const frac = v - a;
        if (frac < 1e-12) break;
        v = 1 / frac;
    }
    return [h1, k1];
}

function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

/** Π(n): gradus suavitatis de Euler sobre un entero positivo. */
function eulerGradusOfInt(n) {
    if (n <= 1) return 1;
    let g = 1;
    let m = n;
    for (let p = 2; p * p <= m; p++) {
        while (m % p === 0) { g += (p - 1); m = Math.floor(m / p); }
    }
    if (m > 1) g += (m - 1);
    return g;
}

// === METRICAS ===

/**
 * Rugosidad sensorial (modelo de Plomp-Levelt / Sethares).
 * Cada nota se modela con n armonicos de amplitud 1/k (timbre tipo cuerda).
 * Retorna la suma de disonancia sobre todos los pares de parciales.
 */
function roughnessSethares(freqs, nHarmonics = 6) {
    const partials = [];
    for (const f of freqs) {
        for (let k = 1; k <= nHarmonics; k++) {
            partials.push({ f: f * k, a: 1 / k });
        }
    }
    let sum = 0;
    for (let i = 0; i < partials.length; i++) {
        for (let j = i + 1; j < partials.length; j++) {
            const f1 = partials[i].f, f2 = partials[j].f;
            const l = partials[i].a * partials[j].a;
            const fmin = Math.min(f1, f2);
            const s = 0.24 / (0.0207 * fmin + 18.96);
            const fs = s * Math.abs(f2 - f1);
            sum += l * (Math.exp(-3.5 * fs) - Math.exp(-5.75 * fs));
        }
    }
    return sum;
}

/**
 * Altura de Tenney promedio sobre todos los intervalos por pares.
 * Cada ratio se reduce a [1, 2) y se aproxima como p/q; altura = log2(p*q).
 */
function tenneyHeight(freqs) {
    let sum = 0, n = 0;
    for (let i = 0; i < freqs.length; i++) {
        for (let j = i + 1; j < freqs.length; j++) {
            let r = freqs[j] / freqs[i];
            while (r >= 2) r /= 2;
            while (r < 1)  r *= 2;
            const [p, q] = nearestRational(r, 99);
            const g = gcd(p, q);
            const P = p / g, Q = q / g;
            sum += Math.log2(P * Q);
            n++;
        }
    }
    return sum / n;
}

/**
 * Gradus suavitatis de Euler promedio sobre ratios por pares.
 */
function eulerGradus(freqs) {
    let sum = 0, n = 0;
    for (let i = 0; i < freqs.length; i++) {
        for (let j = i + 1; j < freqs.length; j++) {
            let r = freqs[j] / freqs[i];
            while (r >= 2) r /= 2;
            while (r < 1)  r *= 2;
            const [p, q] = nearestRational(r, 99);
            const g = gcd(p, q);
            sum += eulerGradusOfInt((p / g) * (q / g));
            n++;
        }
    }
    return sum / n;
}

/**
 * Desviacion (en cents) respecto a la afinacion justa: para cada intervalo
 * por pares, se busca el ratio justo de 5-limite mas cercano y se suma la
 * desviacion absoluta en cents. Suma total del acorde.
 */
const JI_CENTS = [
    0,
    1200 * Math.log2(16/15),
    1200 * Math.log2(9/8),
    1200 * Math.log2(6/5),
    1200 * Math.log2(5/4),
    1200 * Math.log2(4/3),
    1200 * Math.log2(45/32),
    1200 * Math.log2(3/2),
    1200 * Math.log2(8/5),
    1200 * Math.log2(5/3),
    1200 * Math.log2(9/5),
    1200 * Math.log2(15/8),
    1200,
];

function justDeviation(freqs) {
    let sum = 0;
    for (let i = 0; i < freqs.length; i++) {
        for (let j = i + 1; j < freqs.length; j++) {
            let c = 1200 * Math.log2(freqs[j] / freqs[i]);
            c = ((c % 1200) + 1200) % 1200;
            let best = Infinity;
            for (const jc of JI_CENTS) {
                const d = Math.abs(c - jc);
                if (d < best) best = d;
            }
            sum += best;
        }
    }
    return sum;
}

const METRICS = {
    roughness: {
        name: 'Rugosidad (Sethares)',
        fn: roughnessSethares,
        short: 'Disonancia sensorial por batidos entre parciales.',
        long: `
<p><strong>Modelo psicoacustico de Plomp &amp; Levelt (1965), formalizado por William Sethares (1993).</strong>
Cuando dos parciales caen dentro de la llamada <em>banda critica</em> del oido (~ un tercio menor para frecuencias medias), producen un batido aspero que el cerebro interpreta como rugosidad.</p>

<p><strong>Como se calcula:</strong> cada nota se modela con 6 armonicos de amplitud 1/k (timbre tipo cuerda). Para cada par de parciales se aplica la funcion de disonancia:</p>
<p class="formula">d(f₁, f₂) = l₁·l₂ · (e<sup>-3.5·s·Δf</sup> − e<sup>-5.75·s·Δf</sup>)</p>
<p>donde <code>s</code> depende de la frecuencia mas baja. La metrica del acorde es la <strong>suma</strong> sobre todos los pares de parciales.</p>

<p><strong>Como leer el valor:</strong> <em>menor = mas consonante</em>. Depende del registro (frecuencias absolutas) y del numero de parciales elegido.</p>

<p><strong>Que captura bien:</strong> el caracter de las afinaciones historicas, porque desviaciones pequenas en cents mueven parciales dentro/fuera de batidos audibles. <strong>Que captura mal:</strong> consonancia tonal-armonica (no "sabe" que una quinta es mas estable que un tritono si ambos evitan batidos).</p>`,
    },
    tenney: {
        name: 'Altura de Tenney',
        fn: tenneyHeight,
        short: 'Simplicidad de las razones de frecuencia por pares.',
        long: `
<p><strong>James Tenney, <em>John Cage and the Theory of Harmony</em> (1983).</strong>
La idea clasica pitagorica: una razon simple como 3:2 es mas consonante que una compleja como 45:32.</p>

<p><strong>Como se calcula:</strong> para cada par de notas del acorde se toma la razon de frecuencias, se reduce a la octava [1, 2), se aproxima como fraccion irreducible <code>p/q</code> (fracciones continuas, denominador ≤ 99), y se calcula la <em>altura de Tenney</em>:</p>
<p class="formula">HT(p/q) = log₂(p · q)</p>
<p>La metrica del acorde es el <strong>promedio</strong> sobre todos los pares. Ejemplos: 2:1 → 1.0, 3:2 → 2.58, 5:4 → 4.32, 45:32 → 10.49.</p>

<p><strong>Como leer el valor:</strong> <em>menor = razones mas simples</em>. Puramente matematica: no depende del timbre ni del registro.</p>

<p><strong>Que captura bien:</strong> la "pureza" ideal del acorde en terminos de teoria de numeros. <strong>Que captura mal:</strong> los efectos psicoacusticos (dos razones igualmente "complejas" pueden sonar muy distinto segun el registro).</p>`,
    },
    euler: {
        name: 'Gradus Suavitatis (Euler)',
        fn: eulerGradus,
        short: 'Suavidad segun la descomposicion en factores primos.',
        long: `
<p><strong>Leonhard Euler, <em>Tentamen novae theoriae musicae</em> (1739).</strong>
Euler propuso medir la "suavidad" (<em>suavitas</em>) de una razon segun cuan costoso es construirla a partir de numeros primos.</p>

<p><strong>Como se calcula:</strong> para un entero <code>n = p₁<sup>e₁</sup> · p₂<sup>e₂</sup> · ...</code></p>
<p class="formula">Π(n) = 1 + Σ eᵢ · (pᵢ − 1)</p>
<p>Para cada par del acorde se toma la razon reducida <code>p/q</code> y se calcula <code>Π(p·q)</code>; la metrica del acorde es el <strong>promedio</strong>. Ejemplos: Π(1)=1, Π(2)=2, Π(3)=3, Π(6)=4, Π(15)=7, Π(45)=10.</p>

<p><strong>Como leer el valor:</strong> <em>menor = mas suave</em>. A diferencia de Tenney, penaliza especialmente los primos grandes (7, 11, 13): una septima septimal 7:4 tiene Π=10 igual que 9:8, pero Tenney las separa (4.81 vs 6.17).</p>

<p><strong>Que captura bien:</strong> la sensibilidad perceptiva a los primos (3 suena muy distinto a 5, y ambos a 7). <strong>Que captura mal:</strong> la diferencia entre razones igualmente descomponibles pero de distinta magnitud.</p>`,
    },
    justDev: {
        name: 'Desviacion de Justa (cents)',
        fn: justDeviation,
        short: 'Que tan lejos esta el acorde de las razones justas canonicas.',
        long: `
<p><strong>Metrica ad hoc util para comparar afinaciones historicas.</strong>
Responde a la pregunta: "¿que tan afinado esta este acorde, en esta afinacion, respecto a lo que seria la version en afinacion justa ideal?"</p>

<p><strong>Como se calcula:</strong> para cada par de notas del acorde se toma el intervalo en cents (reducido a la octava) y se busca el <em>ratio justo 5-limite mas cercano</em> en el catalogo:</p>
<p class="formula">1/1 · 16/15 · 9/8 · 6/5 · 5/4 · 4/3 · 45/32 · 3/2 · 8/5 · 5/3 · 9/5 · 15/8 · 2/1</p>
<p>La metrica del acorde es la <strong>suma</strong> de las desviaciones absolutas en cents.</p>

<p><strong>Como leer el valor:</strong> directamente en cents. 0 significa que todos los intervalos coinciden exactamente con un ratio justo. Valores de 100+ indican intervalos bastante desafinados respecto al ideal justo.</p>

<p><strong>Que captura bien:</strong> el sesgo de cada temperamento hacia ciertas tonalidades (por ejemplo, muestra claramente por que el mesotonico destroza las tonalidades con muchos sostenidos). <strong>Que captura mal:</strong> no es una medida de consonancia en sentido estricto: un intervalo de 5 cents fuera de 3:2 es practicamente indistinguible de puro, pero esta metrica lo suma linealmente.</p>`,
    },
};

// === CALCULO DE LA MATRIZ DE RESULTADOS ===

function chordFreqs(chord, tuning, baseFreq = 440) {
    return chord.notes.map(m => tuning.getFrequency(m, baseFreq));
}

function computeMatrix(chords, tunings, metricKey) {
    const fn = METRICS[metricKey].fn;
    const matrix = []; // matrix[chordIdx][tuningIdx] = value
    for (const c of chords) {
        const row = [];
        for (const t of tunings) {
            row.push(fn(chordFreqs(c, t)));
        }
        matrix.push(row);
    }
    return matrix;
}

// === VISUALIZACIONES ===

function colorFor(v, vmin, vmax) {
    // verde (consonante) -> amarillo -> rojo (disonante)
    if (vmax === vmin) return 'hsl(120, 60%, 45%)';
    const t = Math.max(0, Math.min(1, (v - vmin) / (vmax - vmin)));
    const hue = 120 * (1 - t); // 120 verde -> 0 rojo
    return `hsl(${hue}, 70%, 42%)`;
}

function renderHeatmap(container, chords, tunings, matrix) {
    let vmin = Infinity, vmax = -Infinity;
    for (const row of matrix) for (const v of row) {
        if (v < vmin) vmin = v;
        if (v > vmax) vmax = v;
    }
    let html = '<table class="cons-heatmap"><thead><tr><th>Acorde</th>';
    for (const t of tunings) html += `<th title="${t.name}">${t.shortName}</th>`;
    html += '</tr></thead><tbody>';
    for (let i = 0; i < chords.length; i++) {
        const c = chords[i];
        const qClass = c.quality === 'mayor' ? 'qmaj' : 'qmin';
        html += `<tr><td class="chord-name ${qClass}">${c.label}</td>`;
        for (let j = 0; j < tunings.length; j++) {
            const v = matrix[i][j];
            const color = colorFor(v, vmin, vmax);
            html += `<td class="hm-cell" data-ci="${i}" data-ti="${j}" style="background:${color}" title="${c.label} @ ${tunings[j].shortName}: ${v.toFixed(3)}">${v.toFixed(2)}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table>';
    container.innerHTML = html;
}

function renderBars(container, chords, tunings, matrix, tuningIdx) {
    const values = chords.map((c, i) => ({ i, c, v: matrix[i][tuningIdx] }));
    values.sort((a, b) => a.v - b.v);
    const vmin = values[0].v, vmax = values[values.length - 1].v;
    let html = `<div class="bars-header">Ranking en <strong>${tunings[tuningIdx].name}</strong> (de mas consonante a mas disonante)</div>`;
    html += '<div class="bars-list">';
    for (const row of values) {
        const pct = vmax === vmin ? 50 : 6 + 94 * (row.v - vmin) / (vmax - vmin);
        const color = colorFor(row.v, vmin, vmax);
        const qClass = row.c.quality === 'mayor' ? 'qmaj' : 'qmin';
        html += `<div class="bar-row" data-ci="${row.i}" data-ti="${tuningIdx}">
            <div class="bar-label ${qClass}">${row.c.label}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
            <div class="bar-value">${row.v.toFixed(3)}</div>
        </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
}

// === APP ===

class ConsonanceApp {
    constructor() {
        this.tunings = TUNING_SYSTEMS;
        this.player = new AudioPlayer();
        this.rootOctave = 3;
        this.chords = buildChordSet(this.rootOctave);
        this.metricKey = 'roughness';
        this.view = 'heatmap';
        this.selectedTuning = 0;

        this._bindUI();
        this.recompute();
    }

    _bindUI() {
        const metricSel = document.getElementById('metric-select');
        for (const [k, m] of Object.entries(METRICS)) {
            const opt = document.createElement('option');
            opt.value = k; opt.textContent = m.name;
            metricSel.appendChild(opt);
        }
        metricSel.value = this.metricKey;
        metricSel.addEventListener('change', e => {
            this.metricKey = e.target.value;
            this._updateMetricDesc();
            this.recompute();
        });
        this._updateMetricDesc();

        document.getElementById('metric-expand-toggle').addEventListener('click', () => {
            const el = document.getElementById('metric-long');
            const btn = document.getElementById('metric-expand-toggle');
            const open = el.classList.toggle('open');
            btn.textContent = open ? 'Ocultar detalles ▲' : 'Ver detalles de la metrica ▼';
        });

        const tuningSel = document.getElementById('tuning-select');
        this.tunings.forEach((t, i) => {
            const opt = document.createElement('option');
            opt.value = i; opt.textContent = t.name;
            tuningSel.appendChild(opt);
        });
        tuningSel.value = this.selectedTuning;
        tuningSel.addEventListener('change', e => {
            this.selectedTuning = parseInt(e.target.value);
            if (this.view === 'bars') this.render();
        });

        const timbreSel = document.getElementById('timbre-select');
        for (const [k, t] of Object.entries(TIMBRES)) {
            const opt = document.createElement('option');
            opt.value = k; opt.textContent = t.name;
            timbreSel.appendChild(opt);
        }
        timbreSel.value = 'piano';
        timbreSel.addEventListener('change', e => this.player.setTimbre(e.target.value));

        const octaveInput = document.getElementById('octave-input');
        octaveInput.value = this.rootOctave;
        octaveInput.addEventListener('change', e => {
            const v = parseInt(e.target.value);
            if (!isNaN(v) && v >= 1 && v <= 5) {
                this.rootOctave = v;
                this.chords = buildChordSet(v);
                this.recompute();
            }
        });

        for (const btn of document.querySelectorAll('.view-tab')) {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.view-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.view = btn.dataset.view;
                document.getElementById('tuning-select-wrap').style.display =
                    this.view === 'bars' ? '' : 'none';
                this.render();
            });
        }
        document.getElementById('tuning-select-wrap').style.display =
            this.view === 'bars' ? '' : 'none';
    }

    _updateMetricDesc() {
        const m = METRICS[this.metricKey];
        document.getElementById('metric-short').textContent = m.short;
        document.getElementById('metric-long').innerHTML = m.long;
    }

    recompute() {
        this.matrix = computeMatrix(this.chords, this.tunings, this.metricKey);
        this.render();
    }

    render() {
        const container = document.getElementById('view-container');
        if (this.view === 'heatmap') {
            renderHeatmap(container, this.chords, this.tunings, this.matrix);
        } else {
            renderBars(container, this.chords, this.tunings, this.matrix, this.selectedTuning);
        }
        container.querySelectorAll('[data-ci]').forEach(el => {
            el.addEventListener('click', () => {
                const ci = parseInt(el.dataset.ci);
                const ti = parseInt(el.dataset.ti);
                this.playChord(ci, ti);
            });
        });
    }

    playChord(chordIdx, tuningIdx) {
        const chord = this.chords[chordIdx];
        const tuning = this.tunings[tuningIdx];
        this.player.setTuning(tuning);
        this.player.stop();
        const events = [{
            notes: chord.notes,
            duration: 4,
            offset: 0,
            velocity: 0.6,
        }];
        document.getElementById('now-playing').textContent =
            `${chord.label} en ${tuning.shortName}  |  MIDI: [${chord.notes.join(', ')}]  |  ${METRICS[this.metricKey].name}: ${this.matrix[chordIdx][tuningIdx].toFixed(4)}`;
        this.player.playSequence(events, 60);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.consonanceApp = new ConsonanceApp();
});
