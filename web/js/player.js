/**
 * player.js - Motor de audio basado en Web Audio API.
 *
 * Sintetiza notas con frecuencias exactas segun el sistema de afinacion
 * seleccionado. Usa sintesis aditiva para crear timbres reconocibles
 * (piano, clavecin, organo, etc.) sin necesidad de archivos de muestras.
 */

class AudioPlayer {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.tuning = null;
        this.isPlaying = false;
        this.activeNotes = [];
        this.playbackCancel = null;
        this.currentTimbre = 'piano';
    }

    _ensureContext() {
        if (!this.ctx || this.ctx.state === 'closed') {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.35;
            this.masterGain.connect(this.ctx.destination);
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
    }

    /**
     * Toca una nota individual con frecuencia del sistema de afinacion.
     * @param {number} midiNote - Nota MIDI
     * @param {number} duration - Duracion en segundos
     * @param {number} startTime - Tiempo de inicio (audioContext time)
     * @param {number} velocity - Volumen 0-1
     * @returns {object} - Nodos de audio para limpieza
     */
    _playNote(midiNote, duration, startTime, velocity = 0.7) {
        if (!this.tuning) return null;

        const freq = this.tuning.getFrequency(midiNote);
        const timbre = TIMBRES[this.currentTimbre] || TIMBRES.piano;

        const gainNode = this.ctx.createGain();
        gainNode.connect(this.masterGain);

        const oscillators = [];

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
            oscillators.push(osc);
        });

        // Envolvente ADSR
        const a = timbre.attack, d = timbre.decay, s = timbre.sustain, r = timbre.release;
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(1, startTime + a);
        gainNode.gain.linearRampToValueAtTime(s, startTime + a + d);
        gainNode.gain.setValueAtTime(s, startTime + duration);
        gainNode.gain.linearRampToValueAtTime(0, startTime + duration + r);

        return { oscillators, gainNode };
    }

    /**
     * Reproduce una secuencia de eventos musicales.
     * @param {Array} events - [{notes: [midi,...], duration: seconds, offset: seconds}, ...]
     * @param {number} tempo - BPM (se usa para convertir quarterLength a segundos)
     * @returns {Promise} - Resuelve cuando termina la reproduccion
     */
    async playSequence(events, tempo = 120) {
        this._ensureContext();
        this.stop();

        this.isPlaying = true;
        const beatDuration = 60 / tempo; // duracion de una negra en segundos

        let cancelled = false;
        this.playbackCancel = () => { cancelled = true; };

        const startTime = this.ctx.currentTime + 0.05;
        const nodes = [];

        for (const event of events) {
            if (cancelled) break;
            const eventStart = startTime + event.offset * beatDuration;
            const eventDuration = event.duration * beatDuration;

            for (const midi of event.notes) {
                const n = this._playNote(midi, eventDuration, eventStart, event.velocity || 0.7);
                if (n) nodes.push(n);
            }
        }

        // Calcular duracion total
        const lastEvent = events[events.length - 1];
        const totalDuration = (lastEvent.offset + lastEvent.duration) * beatDuration;

        // Esperar a que termine
        return new Promise(resolve => {
            const checkInterval = setInterval(() => {
                if (cancelled || this.ctx.currentTime >= startTime + totalDuration + 0.5) {
                    clearInterval(checkInterval);
                    this.isPlaying = false;
                    resolve();
                }
            }, 100);

            // Guardar referencia para poder cancelar
            this._currentCheck = checkInterval;
            this._currentNodes = nodes;
        });
    }

    stop() {
        if (this.playbackCancel) {
            this.playbackCancel();
            this.playbackCancel = null;
        }
        if (this._currentCheck) {
            clearInterval(this._currentCheck);
        }
        if (this._currentNodes) {
            this._currentNodes.forEach(n => {
                n.oscillators.forEach(o => {
                    try { o.stop(); } catch(e) {}
                });
            });
            this._currentNodes = [];
        }
        this.isPlaying = false;
    }
}

// === TIMBRES (sintesis aditiva) ===

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
