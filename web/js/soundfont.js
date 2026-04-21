/**
 * soundfont.js - Cargador perezoso de instrumentos SoundFont.
 *
 * Descarga desde el CDN de gleitz/midi-js-soundfonts (FluidR3 GM) el archivo
 * .js del instrumento, que define `MIDI.Soundfont.<nombre> = { 'C4': dataUri, ... }`.
 * Decodifica las muestras MP3 a AudioBuffer y las indexa por numero MIDI.
 *
 * Para respetar afinaciones historicas, el reproductor toca cada nota con la
 * muestra mas cercana ajustando `playbackRate = freqAfinada / freqMuestra`.
 */

const SF_BASE = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM';

class Soundfont {
    constructor(audioCtx) {
        this.ctx = audioCtx;
        this.cache = new Map();    // instrumentName -> Map<midi, AudioBuffer>
        this.loading = new Map();  // instrumentName -> Promise
    }

    async load(name) {
        if (this.cache.has(name)) return this.cache.get(name);
        if (this.loading.has(name)) return this.loading.get(name);
        const p = this._doLoad(name).then(map => {
            this.cache.set(name, map);
            this.loading.delete(name);
            return map;
        }).catch(err => {
            this.loading.delete(name);
            throw err;
        });
        this.loading.set(name, p);
        return p;
    }

    isLoaded(name) {
        return this.cache.has(name);
    }

    async _doLoad(name) {
        const url = `${SF_BASE}/${name}-mp3.js`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`SoundFont no disponible: ${name}`);
        const script = await resp.text();
        const sandbox = { Soundfont: {} };
        new Function('MIDI', script)(sandbox);
        const notes = sandbox.Soundfont[name];
        if (!notes) throw new Error(`Formato inesperado en ${name}`);

        const map = new Map();
        const entries = Object.entries(notes);
        await Promise.all(entries.map(async ([noteName, dataUri]) => {
            try {
                const midi = noteNameToMidi(noteName);
                const b64 = dataUri.split(',')[1];
                const bin = atob(b64);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                const buf = await this.ctx.decodeAudioData(bytes.buffer);
                map.set(midi, buf);
            } catch (e) {
                // skip unparseable note
            }
        }));
        if (map.size === 0) throw new Error(`Sin muestras decodificables en ${name}`);
        return map;
    }

    /** Devuelve { buffer, sampleMidi } de la muestra mas cercana. */
    getNearest(name, midi) {
        const sf = this.cache.get(name);
        if (!sf) return null;
        if (sf.has(midi)) return { buffer: sf.get(midi), sampleMidi: midi };
        let bestMidi = null;
        let bestDist = Infinity;
        for (const m of sf.keys()) {
            const d = Math.abs(m - midi);
            if (d < bestDist) { bestDist = d; bestMidi = m; }
        }
        return bestMidi != null ? { buffer: sf.get(bestMidi), sampleMidi: bestMidi } : null;
    }
}

function noteNameToMidi(name) {
    const m = name.match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
    if (!m) throw new Error('nombre de nota invalido: ' + name);
    const step = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 }[m[1].toUpperCase()];
    const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
    const octave = parseInt(m[3], 10);
    return (octave + 1) * 12 + step + acc;
}

window.Soundfont = Soundfont;
