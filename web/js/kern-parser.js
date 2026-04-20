/**
 * kern-parser.js - Parser de archivos Humdrum **kern.
 *
 * Extrae notas, duraciones, offsets y metadatos de archivos en formato
 * Humdrum **kern (usado por el corpus de corales de Bach).
 *
 * Referencia: https://www.humdrum.org/rep/kern/
 */

class KernParser {
    /**
     * Parsea un archivo kern y retorna eventos musicales reproducibles.
     * @param {string} kernData - Contenido del archivo .krn
     * @returns {object} - { metadata, events, tempo }
     */
    static parse(kernData) {
        const lines = kernData.split('\n');
        const metadata = this._extractMetadata(lines);
        const spineCount = this._getSpineCount(lines);
        const tempo = metadata.tempo || 100;

        // Parse all data lines into time-aligned events
        const events = this._parseEvents(lines, spineCount, tempo);

        return { metadata, events, tempo };
    }

    static _extractMetadata(lines) {
        const meta = {};
        for (const line of lines) {
            if (line.startsWith('!!!COM:')) meta.composer = line.split(':').slice(1).join(':').trim();
            else if (line.startsWith('!!!OTL')) {
                const m = line.match(/!!!OTL[^:]*:\s*(.*)/);
                if (m) meta.title = m[1].trim();
            }
            else if (line.startsWith('!!!SCT:')) meta.catalog = line.split(':').slice(1).join(':').trim();
            else if (line.startsWith('*MM')) {
                const m = line.match(/\*MM(\d+)/);
                if (m) meta.tempo = parseInt(m[1]);
            }
        }
        return meta;
    }

    static _getSpineCount(lines) {
        for (const line of lines) {
            if (line.startsWith('**kern')) {
                return line.split('\t').filter(s => s.startsWith('**kern')).length;
            }
        }
        return 4; // default SATB
    }

    /**
     * Parse kern data lines into playback events.
     * Returns array of { notes: [midi], duration: quarterLengths, offset: quarterLengths }
     */
    static _parseEvents(lines, spineCount, tempo) {
        const events = [];
        let currentOffset = 0;
        let inSection = null; // for repeat handling

        for (const line of lines) {
            // Skip comments, metadata, empty lines
            if (line.startsWith('!') || line.startsWith('*') || line.trim() === '') continue;

            const tokens = line.split('\t');
            if (tokens.length < spineCount) continue;

            // Skip barlines
            if (tokens[0].startsWith('=')) continue;

            // Parse each spine (voice) in this line
            const notesAtTime = [];
            let minDuration = Infinity;

            for (let i = 0; i < Math.min(tokens.length, spineCount); i++) {
                const token = tokens[i].trim();
                if (!token || token === '.' || token === '*') continue;

                // Handle sub-tokens (beamed notes separated by space)
                const subTokens = token.split(' ');
                for (const subToken of subTokens) {
                    const parsed = this._parseKernToken(subToken);
                    if (parsed && parsed.midi !== null) {
                        notesAtTime.push(parsed);
                        if (parsed.duration < minDuration) {
                            minDuration = parsed.duration;
                        }
                    } else if (parsed && parsed.isRest) {
                        if (parsed.duration < minDuration) {
                            minDuration = parsed.duration;
                        }
                    }
                }
            }

            // If we found notes at this time point
            if (notesAtTime.length > 0) {
                // Group all simultaneous notes
                const midiNotes = notesAtTime.map(n => n.midi);
                const duration = minDuration === Infinity ? 1 : minDuration;

                events.push({
                    notes: midiNotes,
                    duration: duration,
                    offset: currentOffset,
                    velocity: 0.65
                });

                currentOffset += duration;
            } else if (minDuration !== Infinity) {
                // Rest - advance time
                currentOffset += minDuration;
            }
        }

        return events;
    }

    /**
     * Parse a single kern token into midi note and duration.
     * @param {string} token - e.g., "4c", "8gL", "2.f#", "4r"
     * @returns {object|null} - { midi, duration, isRest }
     */
    static _parseKernToken(token) {
        if (!token || token === '.') return null;

        // Clean decorations: ties, beaming, phrase, etc.
        let clean = token.replace(/[LJKkT~(){}]/g, '');
        // Remove articulations
        clean = clean.replace(/['"`^,;v]/g, '');
        // Remove x (editorial accidental)
        // Keep # - n (natural) for pitch parsing

        // Check for rest
        if (clean.includes('r')) {
            const dur = this._parseDuration(clean);
            return { midi: null, duration: dur, isRest: true };
        }

        // Parse duration
        const duration = this._parseDuration(clean);

        // Parse pitch
        const midi = this._parsePitch(clean);
        if (midi === null) return null;

        return { midi, duration, isRest: false };
    }

    /**
     * Parse kern duration token to quarter note lengths.
     * 1=whole, 2=half, 4=quarter, 8=eighth, 16=sixteenth
     * dots add half of previous value
     */
    static _parseDuration(token) {
        // Extract the numeric duration
        const m = token.match(/(\d+)/);
        if (!m) return 1; // default quarter note

        const durNum = parseInt(m[1]);
        if (durNum === 0) return 8; // breve = 8 quarter notes

        let quarterLengths = 4 / durNum;

        // Count dots
        const dots = (token.match(/\./g) || []).length;
        let dotAdd = quarterLengths;
        for (let i = 0; i < dots; i++) {
            dotAdd /= 2;
            quarterLengths += dotAdd;
        }

        return quarterLengths;
    }

    /**
     * Parse kern pitch to MIDI note number.
     * Lowercase = octave 4+, uppercase = octave 3 and below
     * Repeated letters go up/down octaves
     *
     * c = C4 (middle C) = MIDI 60
     * cc = C5 = MIDI 72
     * C = C3 = MIDI 48
     * CC = C2 = MIDI 36
     */
    static _parsePitch(token) {
        // Remove everything except pitch letters and accidentals
        const pitchStr = token.replace(/[\d.LJKkT~(){}'"`,;v\[\]xXyq ]/g, '');
        if (!pitchStr) return null;

        // Find the note letter
        const noteMatch = pitchStr.match(/([a-gA-G])\1*/);
        if (!noteMatch) return null;

        const noteChar = noteMatch[0];
        const letter = noteChar[0];
        const count = noteChar.length;
        const isLower = letter === letter.toLowerCase();

        // Base MIDI for each note letter (in octave 4 for lowercase)
        const baseMidi = {
            'c': 60, 'd': 62, 'e': 64, 'f': 65,
            'g': 67, 'a': 69, 'b': 71
        };

        let midi;
        if (isLower) {
            // c=C4(60), cc=C5(72), ccc=C6(84), ...
            midi = baseMidi[letter.toLowerCase()] + (count - 1) * 12;
        } else {
            // C=C3(48), CC=C2(36), CCC=C1(24), ...
            midi = baseMidi[letter.toLowerCase()] - count * 12;
        }

        // Apply accidentals
        const sharps = (pitchStr.match(/#/g) || []).length;
        const flats = (pitchStr.match(/-/g) || []).length;
        const naturals = (pitchStr.match(/n/g) || []).length;

        midi += sharps - flats;
        // naturals cancel key signature (handled as-is since we parse literally)

        return midi;
    }
}
