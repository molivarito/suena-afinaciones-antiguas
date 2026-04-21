/**
 * midi-parser.js - Parser minimo de Standard MIDI File (SMF).
 *
 * Solo extrae noteOn/noteOff + tempo inicial. Retorna eventos en formato
 * { notes, offset, duration } medidos en NEGRAS (compatible con el player),
 * junto con sourceTempo en BPM para que el tempo-slider pueda reescalar.
 */

function parseMIDIBase64(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return parseMIDIBytes(bytes);
}

function parseMIDIBytes(data) {
    let pos = 0;
    const read32 = () => ((data[pos++]<<24) | (data[pos++]<<16) | (data[pos++]<<8) | data[pos++]) >>> 0;
    const read16 = () => (data[pos++]<<8) | data[pos++];
    const readVarLen = () => {
        let v = 0, b;
        do { b = data[pos++]; v = (v<<7) | (b & 0x7f); } while (b & 0x80);
        return v;
    };

    if (data[0] !== 0x4D || data[1] !== 0x54 || data[2] !== 0x68 || data[3] !== 0x64)
        throw new Error('Not a MIDI file');
    pos = 4;
    read32(); // header length
    read16(); // format
    const numTracks = read16();
    const div = read16();
    if (div & 0x8000) throw new Error('SMPTE timing not supported');
    const ppq = div;

    const allEvents = [];
    for (let t = 0; t < numTracks; t++) {
        if (data[pos] !== 0x4D || data[pos+1] !== 0x54 || data[pos+2] !== 0x72 || data[pos+3] !== 0x6B)
            throw new Error('Bad track header');
        pos += 4;
        const trackLen = read32();
        const trackEnd = pos + trackLen;
        let tick = 0;
        let running = 0;
        while (pos < trackEnd) {
            tick += readVarLen();
            let status = data[pos];
            if (status < 0x80) { status = running; }
            else { pos++; running = status; }
            const msg = status & 0xF0;
            const ch = status & 0x0F;
            if (msg === 0x90) {
                const note = data[pos++], vel = data[pos++];
                allEvents.push({ type: vel > 0 ? 'on' : 'off', tick, note, ch });
            } else if (msg === 0x80) {
                const note = data[pos++]; pos++;
                allEvents.push({ type: 'off', tick, note, ch });
            } else if (status === 0xFF) {
                const metaType = data[pos++];
                const len = readVarLen();
                if (metaType === 0x51 && len === 3) {
                    const us = (data[pos]<<16) | (data[pos+1]<<8) | data[pos+2];
                    allEvents.push({ type: 'tempo', tick, us });
                }
                pos += len;
            } else if (status === 0xF0 || status === 0xF7) {
                const len = readVarLen();
                pos += len;
            } else {
                if (msg === 0xC0 || msg === 0xD0) pos += 1;
                else pos += 2;
            }
        }
        pos = trackEnd;
    }

    allEvents.sort((a, b) => a.tick - b.tick);

    let sourceTempo = 120;
    const tempoEv = allEvents.find(e => e.type === 'tempo');
    if (tempoEv) sourceTempo = Math.round(60000000 / tempoEv.us);

    // Pair note on/off
    const active = new Map(); // key: ch*128+note -> startTick
    const notes = [];
    for (const e of allEvents) {
        const key = e.ch * 128 + e.note;
        if (e.type === 'on') {
            active.set(key, e.tick);
        } else if (e.type === 'off') {
            if (active.has(key)) {
                const start = active.get(key);
                active.delete(key);
                notes.push({ midi: e.note, startTick: start, endTick: e.tick });
            }
        }
    }

    // Group notes with close start-ticks into chord events (32nd-note tolerance)
    const tol = Math.max(1, Math.floor(ppq / 8));
    notes.sort((a, b) => a.startTick - b.startTick);
    const groups = [];
    for (const n of notes) {
        const last = groups[groups.length - 1];
        if (last && Math.abs(n.startTick - last.startTick) <= tol) {
            last.midi.push(n.midi);
            if (n.endTick > last.endTick) last.endTick = n.endTick;
        } else {
            groups.push({ startTick: n.startTick, endTick: n.endTick, midi: [n.midi] });
        }
    }

    const events = groups.map(g => ({
        notes: g.midi,
        offset: g.startTick / ppq,
        duration: Math.max(0.05, (g.endTick - g.startTick) / ppq),
    }));

    return { events, sourceTempo, ppq };
}
