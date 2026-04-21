/**
 * player.js - Motor de audio basado en Web Audio API.
 *
 * Si hay un SoundFont cargado para el timbre actual, toca cada nota con la
 * muestra mas cercana ajustando `playbackRate = freqAfinada / freqMuestra`,
 * preservando las afinaciones historicas. Si no, cae a sintesis aditiva.
 *
 * Para secuencias largas usa un scheduler con look-ahead: solo agenda los
 * proximos LOOKAHEAD segundos y vuelve a correr con setTimeout. Esto evita
 * saturar el scheduler de Web Audio con miles de osciladores a la vez.
 */

const SOUNDFONT_MAP = {
    piano: 'acoustic_grand_piano',
    harpsichord: 'harpsichord',
    organ: 'church_organ',
    strings: 'string_ensemble_1',
    flute: 'flute',
    choir: 'choir_aahs',
};

const LOOKAHEAD_SEC = 2.0;
const TICK_MS = 500;
const A4_MIDI = 69;
const A4_HZ = 440;

function equalTemperedHz(midi) {
    return A4_HZ * Math.pow(2, (midi - A4_MIDI) / 12);
}

class AudioPlayer {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.tuning = null;
        this.isPlaying = false;
        this.playbackCancel = null;
        this.currentTimbre = 'piano';
        this.soundfont = null;
    }

    _ensureContext() {
        if (!this.ctx || this.ctx.state === 'closed') {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.5;
            this.masterGain.connect(this.ctx.destination);
            this.soundfont = new Soundfont(this.ctx);
            // precarga timbre inicial en background
            this._prefetchCurrentTimbre();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    setTuning(tuning) {
        this.tuning = tuning;
    }

    setTimbre(timbre) {
        this.currentTimbre = timbre;
        this._prefetchCurrentTimbre();
    }

    _prefetchCurrentTimbre() {
        if (!this.soundfont) return;
        const sfName = SOUNDFONT_MAP[this.currentTimbre];
        if (!sfName || this.soundfont.isLoaded(sfName)) return;
        this.soundfont.load(sfName).catch(() => {});
    }

    /** Reproduce una nota. Devuelve un objeto con nodos para cancelacion. */
    _playNote(midiNote, duration, startTime, velocity = 0.7) {
        if (!this.tuning) return null;

        const tunedFreq = this.tuning.getFrequency(midiNote);
        const sfName = SOUNDFONT_MAP[this.currentTimbre];
        const sfSample = sfName ? this.soundfont.getNearest(sfName, midiNote) : null;

        if (sfSample) {
            return this._playSample(sfSample, tunedFreq, duration, startTime, velocity);
        }
        return this._playSynth(tunedFreq, duration, startTime, velocity);
    }

    _playSample(sample, tunedFreq, duration, startTime, velocity) {
        const sampleRefFreq = equalTemperedHz(sample.sampleMidi);
        const rate = tunedFreq / sampleRefFreq;

        const src = this.ctx.createBufferSource();
        src.buffer = sample.buffer;
        src.playbackRate.value = rate;

        const gain = this.ctx.createGain();
        gain.gain.value = velocity;
        src.connect(gain);
        gain.connect(this.masterGain);

        const release = 0.15;
        gain.gain.setValueAtTime(velocity, startTime);
        gain.gain.setValueAtTime(velocity, startTime + duration);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration + release);

        src.start(startTime);
        src.stop(startTime + duration + release + 0.05);
        return { sources: [src], gainNode: gain };
    }

    _playSynth(freq, duration, startTime, velocity) {
        const timbre = TIMBRES[this.currentTimbre] || TIMBRES.piano;
        const gainNode = this.ctx.createGain();
        gainNode.connect(this.masterGain);

        const sources = [];
        timbre.harmonics.forEach(h => {
            const osc = this.ctx.createOscillator();
            osc.type = h.type || 'sine';
            osc.frequency.value = freq * h.ratio;
            const harmGain = this.ctx.createGain();
            harmGain.gain.value = h.gain * velocity;
            osc.connect(harmGain);
            harmGain.connect(gainNode);
            osc.start(startTime);
            osc.stop(startTime + duration + timbre.release);
            sources.push(osc);
        });

        const a = timbre.attack, d = timbre.decay, s = timbre.sustain, r = timbre.release;
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(1, startTime + a);
        gainNode.gain.linearRampToValueAtTime(s, startTime + a + d);
        gainNode.gain.setValueAtTime(s, startTime + duration);
        gainNode.gain.linearRampToValueAtTime(0, startTime + duration + r);

        return { sources, gainNode };
    }

    /**
     * Reproduce una secuencia con scheduler de look-ahead.
     * @param {Array} events - [{notes, duration, offset}, ...] en unidades de pulso
     * @param {number} tempo - BPM
     */
    async playSequence(events, tempo = 120) {
        this._ensureContext();
        this.stop();
        if (!events || events.length === 0) return;

        // Espera la carga del SoundFont actual (si esta en curso) antes de agendar,
        // para evitar caer a sintesis si el usuario acaba de apretar play.
        const sfName = SOUNDFONT_MAP[this.currentTimbre];
        if (sfName && !this.soundfont.isLoaded(sfName) && this.soundfont.loading.has(sfName)) {
            try { await this.soundfont.loading.get(sfName); } catch (e) {}
        }

        this.isPlaying = true;
        const beatDuration = 60 / tempo;
        const startTime = this.ctx.currentTime + 0.1;

        let cancelled = false;
        this.playbackCancel = () => { cancelled = true; };

        let nextIdx = 0;
        const totalEnd = startTime + (events[events.length - 1].offset + events[events.length - 1].duration) * beatDuration;
        const activeNodes = [];

        const scheduleUpTo = (horizon) => {
            while (nextIdx < events.length) {
                const ev = events[nextIdx];
                const at = startTime + ev.offset * beatDuration;
                if (at > horizon) break;
                const dur = ev.duration * beatDuration;
                for (const midi of ev.notes) {
                    const n = this._playNote(midi, dur, at, ev.velocity || 0.7);
                    if (n) activeNodes.push(n);
                }
                nextIdx++;
            }
        };

        return new Promise(resolve => {
            const tick = () => {
                if (cancelled) {
                    this.isPlaying = false;
                    return resolve();
                }
                scheduleUpTo(this.ctx.currentTime + LOOKAHEAD_SEC);
                if (nextIdx >= events.length) {
                    const remainingMs = Math.max(100, (totalEnd - this.ctx.currentTime + 0.5) * 1000);
                    this._endTimer = setTimeout(() => {
                        this.isPlaying = false;
                        resolve();
                    }, remainingMs);
                    return;
                }
                this._tickTimer = setTimeout(tick, TICK_MS);
            };
            this._activeNodes = activeNodes;
            tick();
        });
    }

    stop() {
        if (this.playbackCancel) {
            this.playbackCancel();
            this.playbackCancel = null;
        }
        if (this._tickTimer) { clearTimeout(this._tickTimer); this._tickTimer = null; }
        if (this._endTimer) { clearTimeout(this._endTimer); this._endTimer = null; }
        if (this._activeNodes) {
            this._activeNodes.forEach(n => {
                (n.sources || []).forEach(s => { try { s.stop(); } catch (e) {} });
            });
            this._activeNodes = [];
        }
        this.isPlaying = false;
    }
}

// === TIMBRES (fallback de sintesis aditiva) ===

const TIMBRES = {
    piano: {
        name: 'Piano',
        attack: 0.005, decay: 0.3, sustain: 0.4, release: 0.3,
        harmonics: [
            { ratio: 1,   gain: 1.0, type: 'sine' },
            { ratio: 2,   gain: 0.5, type: 'sine' },
            { ratio: 3,   gain: 0.25, type: 'sine' },
            { ratio: 4,   gain: 0.12, type: 'sine' },
            { ratio: 5,   gain: 0.06, type: 'sine' },
            { ratio: 6,   gain: 0.03, type: 'sine' },
        ]
    },
    harpsichord: {
        name: 'Clavecin',
        attack: 0.001, decay: 0.15, sustain: 0.2, release: 0.15,
        harmonics: [
            { ratio: 1,   gain: 0.8, type: 'sawtooth' },
            { ratio: 2,   gain: 0.4, type: 'square' },
            { ratio: 3,   gain: 0.3, type: 'sawtooth' },
            { ratio: 4,   gain: 0.15, type: 'sine' },
        ]
    },
    organ: {
        name: 'Organo',
        attack: 0.08, decay: 0.1, sustain: 0.85, release: 0.2,
        harmonics: [
            { ratio: 1,   gain: 1.0, type: 'sine' },
            { ratio: 2,   gain: 0.8, type: 'sine' },
            { ratio: 3,   gain: 0.6, type: 'sine' },
            { ratio: 4,   gain: 0.4, type: 'sine' },
            { ratio: 5,   gain: 0.2, type: 'sine' },
            { ratio: 6,   gain: 0.1, type: 'sine' },
            { ratio: 8,   gain: 0.05, type: 'sine' },
        ]
    },
    strings: {
        name: 'Cuerdas',
        attack: 0.15, decay: 0.2, sustain: 0.7, release: 0.4,
        harmonics: [
            { ratio: 1,   gain: 1.0, type: 'sine' },
            { ratio: 2,   gain: 0.6, type: 'sine' },
            { ratio: 3,   gain: 0.35, type: 'sine' },
            { ratio: 4,   gain: 0.2, type: 'sine' },
            { ratio: 5,   gain: 0.1, type: 'sine' },
        ]
    },
    flute: {
        name: 'Flauta',
        attack: 0.06, decay: 0.1, sustain: 0.6, release: 0.15,
        harmonics: [
            { ratio: 1,   gain: 1.0, type: 'sine' },
            { ratio: 2,   gain: 0.15, type: 'sine' },
            { ratio: 3,   gain: 0.05, type: 'sine' },
        ]
    },
    choir: {
        name: 'Coro',
        attack: 0.2, decay: 0.3, sustain: 0.6, release: 0.5,
        harmonics: [
            { ratio: 1,   gain: 1.0, type: 'sine' },
            { ratio: 2,   gain: 0.5, type: 'sine' },
            { ratio: 3,   gain: 0.35, type: 'sine' },
            { ratio: 4,   gain: 0.15, type: 'sine' },
            { ratio: 5,   gain: 0.08, type: 'sine' },
        ]
    }
};
