/**
 * app.js - Controlador principal de la interfaz.
 */

let player;
let currentTuning;
let currentlyPlayingBtn = null;
let loadedScore = null;       // { events, metadata, tempo, sourceKind, raw }
let scoreIndex = null;
let scoreRenderer = null;

document.addEventListener('DOMContentLoaded', () => {
    player = new AudioPlayer();
    window.player = player;
    currentTuning = TUNING_SYSTEMS[0];
    player.setTuning(currentTuning);
    scoreRenderer = new ScoreRenderer();

    initTuningSelector();
    initTimbreSelector();
    initTempoSlider();
    initExamples();
    initKeyboard();
    initTabs();
    initScoreControls();
    initFileUpload();
    loadLibrary();
    updateUI();
});

// === SCORE FORMAT DETECTION ===
function detectFormat(filename) {
    const ext = (filename || '').toLowerCase().split('.').pop();
    if (ext === 'krn') return 'kern';
    if (ext === 'xml' || ext === 'musicxml') return 'musicxml';
    if (ext === 'mxl') return 'mxl';
    if (ext === 'mei') return 'mei';
    if (ext === 'mid' || ext === 'midi') return 'midi';
    if (ext === 'abc') return 'abc';
    return 'unknown';
}

// === UNIFIED SCORE LOAD PIPELINE ===
// Takes raw content (string or ArrayBuffer for binary), renders with Verovio
// where possible and extracts audio events via Verovio's renderToMIDI().
// MIDI files go through the MIDI parser directly and fall back to piano-roll.
async function loadScoreFromContent(content, filename) {
    const format = detectFormat(filename);
    const scoreInfo = document.getElementById('score-info');
    const controls = document.getElementById('score-controls');
    const saveBtn = document.getElementById('btn-save-score');
    scoreInfo.textContent = 'Cargando...';
    controls.style.display = 'block';
    if (saveBtn) saveBtn.style.display = 'none';

    try {
        let events, sourceTempo, metadata, rawForSave;

        if (format === 'midi') {
            // Direct MIDI parse; piano-roll fallback for visuals.
            const bytes = content instanceof ArrayBuffer ? new Uint8Array(content) : content;
            const parsed = parseMIDIBytes(bytes);
            events = parsed.events;
            sourceTempo = parsed.sourceTempo;
            metadata = { title: filename.replace(/\.[^.]+$/, ''), format: 'MIDI' };
            renderPianoRoll(events, metadata);
            rawForSave = bytes;
        } else if (format === 'mxl') {
            const bytes = content instanceof ArrayBuffer ? new Uint8Array(content) : content;
            let bin = '';
            for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
            await scoreRenderer.loadZipBase64(btoa(bin));
            renderSVG(await scoreRenderer.renderAllPagesSVG());
            const parsed = parseMIDIBase64(await scoreRenderer.renderToMIDI());
            events = parsed.events;
            sourceTempo = parsed.sourceTempo;
            const meta = await scoreRenderer.getMetadata();
            metadata = { title: meta.title || filename.replace(/\.[^.]+$/, ''), composer: meta.composer, format: 'MusicXML' };
            rawForSave = bytes;
        } else if (format === 'kern' || format === 'musicxml' || format === 'mei' || format === 'abc') {
            const text = typeof content === 'string' ? content : new TextDecoder().decode(content);
            await scoreRenderer.loadText(text, format);
            renderSVG(await scoreRenderer.renderAllPagesSVG());
            const parsed = parseMIDIBase64(await scoreRenderer.renderToMIDI());
            events = parsed.events;
            sourceTempo = parsed.sourceTempo;
            const meta = await scoreRenderer.getMetadata();
            metadata = { title: meta.title || filename.replace(/\.[^.]+$/, ''), composer: meta.composer, format: format };
            rawForSave = text;
        } else {
            throw new Error('Formato no soportado: .' + filename.split('.').pop());
        }

        loadedScore = { events, metadata, tempo: sourceTempo, filename, raw: rawForSave, format };
        window.loadedScore = loadedScore;

        // Update UI
        const titleParts = [];
        if (metadata.title) titleParts.push(metadata.title);
        if (metadata.composer) titleParts.push(metadata.composer);
        scoreInfo.textContent = titleParts.join(' — ') || filename;
        scoreInfo.title = scoreInfo.textContent;

        // Update tempo slider to source tempo
        const slider = document.getElementById('tempo-slider');
        slider.value = Math.round(sourceTempo || 100);
        document.getElementById('tempo-value').textContent = slider.value;

        switchTab('tab-score');

        return true;
    } catch (e) {
        console.error('Error loading score:', e);
        scoreInfo.textContent = 'Error al cargar: ' + e.message;
        document.getElementById('score-placeholder').style.display = '';
        document.getElementById('score-container').innerHTML = '';
        return false;
    }
}

function renderSVG(svg) {
    const container = document.getElementById('score-container');
    const placeholder = document.getElementById('score-placeholder');
    placeholder.style.display = 'none';
    container.innerHTML = `<div class="engraved-score">${svg}</div>`;
}

// === PIANO ROLL FALLBACK (used for MIDI files) ===
function renderPianoRoll(events, metadata) {
    const container = document.getElementById('score-container');
    const placeholder = document.getElementById('score-placeholder');
    placeholder.style.display = 'none';

    if (!events || events.length === 0) {
        container.innerHTML = '<p style="color:var(--text-dim); padding:1rem;">Sin notas para visualizar.</p>';
        return;
    }

    // Build piano roll visualization
    const allMidi = events.flatMap(e => e.notes);
    const minMidi = Math.min(...allMidi) - 1;
    const maxMidi = Math.max(...allMidi) + 1;
    const midiRange = maxMidi - minMidi + 1;
    const totalDuration = Math.max(...events.map(e => e.offset + e.duration));

    const noteNames = ['Do','Do#','Re','Mib','Mi','Fa','Fa#','Sol','Sol#','La','Sib','Si'];
    const isBlack = [0,1,0,1,0,0,1,0,1,0,1,0];

    // Create canvas
    const canvas = document.createElement('canvas');
    const width = Math.max(800, container.clientWidth || 800);
    const rowH = Math.max(6, Math.min(14, 400 / midiRange));
    const height = midiRange * rowH + 40;
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.borderRadius = '6px';

    const ctx = canvas.getContext('2d');
    const leftMargin = 45;
    const rightMargin = 10;
    const topMargin = 5;
    const plotW = width - leftMargin - rightMargin;
    const plotH = midiRange * rowH;

    // Background
    ctx.fillStyle = '#0d1520';
    ctx.fillRect(0, 0, width, height);

    // Draw pitch rows
    for (let midi = minMidi; midi <= maxMidi; midi++) {
        const y = topMargin + (maxMidi - midi) * rowH;
        const noteIdx = ((midi % 12) + 12) % 12;
        ctx.fillStyle = isBlack[noteIdx] ? '#0a1018' : '#111a28';
        ctx.fillRect(leftMargin, y, plotW, rowH);

        // Grid line
        ctx.strokeStyle = '#1a2538';
        ctx.beginPath();
        ctx.moveTo(leftMargin, y);
        ctx.lineTo(width - rightMargin, y);
        ctx.stroke();

        // Note label (only for C and naturals)
        if (noteIdx === 0 || midiRange <= 24) {
            ctx.fillStyle = '#5a6578';
            ctx.font = `${Math.min(10, rowH - 1)}px Inter, sans-serif`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            const octave = Math.floor(midi / 12) - 1;
            ctx.fillText(noteNames[noteIdx] + octave, leftMargin - 4, y + rowH / 2);
        }
    }

    // Draw notes
    const pxPerBeat = plotW / totalDuration;
    events.forEach(event => {
        const x = leftMargin + event.offset * pxPerBeat;
        const w = Math.max(2, event.duration * pxPerBeat - 1);

        event.notes.forEach(midi => {
            const y = topMargin + (maxMidi - midi) * rowH + 1;
            const h = rowH - 2;

            // Note rectangle with accent color
            const noteIdx = ((midi % 12) + 12) % 12;
            const hue = (noteIdx * 30) % 360;
            ctx.fillStyle = `hsl(${hue}, 65%, 55%)`;
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, 2);
            ctx.fill();

            // Slight glow
            ctx.fillStyle = `hsla(${hue}, 70%, 60%, 0.3)`;
            ctx.fillRect(x, y, w, h);
        });
    });

    // Info header
    container.innerHTML = '';

    // Metadata bar
    if (metadata) {
        const info = document.createElement('div');
        info.style.cssText = 'padding: 0.6rem 0; font-size: 0.85rem; color: var(--text-dim); display: flex; gap: 1.5rem; flex-wrap: wrap;';
        const parts = [];
        if (metadata.title) parts.push(`<strong style="color:var(--text)">${metadata.title}</strong>`);
        if (metadata.catalog) parts.push(metadata.catalog);
        if (metadata.composer) parts.push(metadata.composer);
        parts.push(`${events.length} acordes/notas`);
        parts.push(`Rango: ${noteNames[minMidi%12]}${Math.floor(minMidi/12)-1} - ${noteNames[maxMidi%12]}${Math.floor(maxMidi/12)-1}`);
        info.innerHTML = parts.join(' &middot; ');
        container.appendChild(info);
    }

    container.appendChild(canvas);
}

// === TUNING SELECTOR ===
function initTuningSelector() {
    const select = document.getElementById('tuning-select');
    TUNING_SYSTEMS.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        select.appendChild(opt);
    });
    select.addEventListener('change', () => {
        currentTuning = getTuningById(select.value);
        player.setTuning(currentTuning);
        player.stop();
        clearPlayingState();
        updateUI();
    });
}

// === TIMBRE SELECTOR ===
function initTimbreSelector() {
    const select = document.getElementById('timbre-select');
    Object.entries(TIMBRES).forEach(([key, timbre]) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = timbre.name;
        select.appendChild(opt);
    });
    select.addEventListener('change', () => {
        player.setTimbre(select.value);
    });
}

// === TEMPO SLIDER ===
function initTempoSlider() {
    const slider = document.getElementById('tempo-slider');
    const display = document.getElementById('tempo-value');
    slider.addEventListener('input', () => {
        display.textContent = slider.value;
    });
}

function getCurrentTempo() {
    return parseInt(document.getElementById('tempo-slider').value) || 100;
}

// === LIBRARY ===
async function loadLibrary() {
    try {
        const resp = await fetch('scores-index.json');
        scoreIndex = await resp.json();

        const catSelect = document.getElementById('library-category');
        catSelect.innerHTML = '';
        for (const cat of Object.keys(scoreIndex)) {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat === 'Corales de Bach' ? `Corales de Bach (${scoreIndex[cat].length})` :
                              cat === 'brandenburg' ? `Brandenburg (${scoreIndex[cat].length})` : cat;
            catSelect.appendChild(opt);
        }

        catSelect.addEventListener('change', () => renderLibraryList());
        document.getElementById('library-search').addEventListener('input', () => renderLibraryList());

        await populateUserLibraryCategory();
        renderLibraryList();
    } catch (e) {
        document.getElementById('library-list').innerHTML =
            '<p style="color:var(--negative); font-size:0.8rem; padding:0.5rem;">No se pudo cargar la biblioteca.</p>';
    }
}

function renderLibraryList() {
    const list = document.getElementById('library-list');
    const cat = document.getElementById('library-category').value;
    const search = document.getElementById('library-search').value.toLowerCase();

    if (cat === 'Mis Partituras') {
        renderUserLibraryList();
        return;
    }

    if (!scoreIndex || !scoreIndex[cat]) {
        list.innerHTML = '<p style="color:var(--text-dim);">Sin partituras.</p>';
        return;
    }

    let items = scoreIndex[cat];

    // Normalize: support both string[] and {file, title, path}[] formats
    let entries = items.map(item => {
        if (typeof item === 'string') {
            const display = item.replace('.krn', '').replace('chor', 'Coral ').replace('bwv', 'BWV ');
            return { file: item, title: display, path: cat + '/' + item };
        }
        return item;
    });

    if (search) {
        entries = entries.filter(e => e.title.toLowerCase().includes(search) || e.file.toLowerCase().includes(search));
    }

    if (entries.length === 0) {
        list.innerHTML = '<p style="color:var(--text-dim); font-size:0.8rem;">Sin resultados.</p>';
        return;
    }

    list.innerHTML = '';
    entries.forEach(entry => {
        const btn = document.createElement('button');
        btn.className = 'library-item';
        btn.textContent = entry.title;
        btn.title = entry.title;
        btn.addEventListener('click', () => loadScoreFile(cat, entry.file, btn));
        list.appendChild(btn);
    });
}

async function loadScoreFile(category, filename, clickedBtn) {
    document.querySelectorAll('.library-item').forEach(item => item.classList.remove('active'));
    if (clickedBtn) clickedBtn.classList.add('active');

    if (category === 'Mis Partituras') {
        const entry = await UserLibrary.get(filename);
        if (!entry) return;
        await loadScoreFromContent(entry.content, entry.name);
        return;
    }

    const path = `scores/${category}/${filename}`;
    try {
        const resp = await fetch(path);
        const format = detectFormat(filename);
        const content = (format === 'midi' || format === 'mxl')
            ? await resp.arrayBuffer()
            : await resp.text();
        await loadScoreFromContent(content, filename);
    } catch (e) {
        document.getElementById('score-info').textContent = 'Error al cargar';
        console.error(e);
    }
}

// === FILE UPLOAD ===
function initFileUpload() {
    const input = document.getElementById('file-upload');
    input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;
        const format = detectFormat(file.name);
        let content;
        if (format === 'midi' || format === 'mxl') {
            content = await file.arrayBuffer();
        } else {
            content = await file.text();
        }
        const ok = await loadScoreFromContent(content, file.name);
        if (ok) {
            const saveBtn = document.getElementById('btn-save-score');
            saveBtn.style.display = '';
        }
        input.value = ''; // permitir volver a subir mismo archivo
    });
}

// === USER LIBRARY ===
async function saveCurrentScoreToLibrary() {
    if (!loadedScore) return;
    const name = loadedScore.filename;
    const id = `user-${Date.now()}-${name}`;
    await UserLibrary.add({
        id,
        name,
        format: loadedScore.format,
        content: loadedScore.raw,
        addedAt: Date.now(),
    });
    document.getElementById('btn-save-score').style.display = 'none';

    // Refresh category options + list
    await populateUserLibraryCategory();
    const catSelect = document.getElementById('library-category');
    catSelect.value = 'Mis Partituras';
    renderLibraryList();
}

async function populateUserLibraryCategory() {
    const catSelect = document.getElementById('library-category');
    const entries = await UserLibrary.list();
    const optId = 'opt-user-library';
    let existing = document.getElementById(optId);
    if (entries.length === 0) {
        if (existing) existing.remove();
        return;
    }
    if (!existing) {
        existing = document.createElement('option');
        existing.id = optId;
        existing.value = 'Mis Partituras';
        catSelect.insertBefore(existing, catSelect.firstChild);
    }
    existing.textContent = `Mis Partituras (${entries.length})`;
}

async function renderUserLibraryList() {
    const list = document.getElementById('library-list');
    const search = document.getElementById('library-search').value.toLowerCase();
    const entries = await UserLibrary.list();
    const filtered = search ? entries.filter(e => e.name.toLowerCase().includes(search)) : entries;
    if (filtered.length === 0) {
        list.innerHTML = '<p style="color:var(--text-dim); font-size:0.8rem; padding:0.5rem;">Usa "Cargar archivo..." para agregar partituras propias.</p>';
        return;
    }
    list.innerHTML = '';
    filtered.forEach(entry => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; gap:0.3rem; align-items:stretch;';
        const btn = document.createElement('button');
        btn.className = 'library-item';
        btn.style.flex = '1';
        btn.textContent = entry.name;
        btn.title = `${entry.name} (${entry.format || '?'})`;
        btn.addEventListener('click', () => loadScoreFile('Mis Partituras', entry.id, btn));
        const delBtn = document.createElement('button');
        delBtn.className = 'library-item-del';
        delBtn.innerHTML = '&times;';
        delBtn.title = 'Eliminar';
        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await UserLibrary.remove(entry.id);
            await populateUserLibraryCategory();
            renderLibraryList();
        });
        row.appendChild(btn);
        row.appendChild(delBtn);
        list.appendChild(row);
    });
}

// === SCORE CONTROLS ===
function initScoreControls() {
    document.getElementById('btn-play-score').addEventListener('click', playLoadedScore);
    document.getElementById('btn-stop-score').addEventListener('click', () => {
        player.stop();
        clearPlayingState();
        document.getElementById('btn-play-score').textContent = '\u25B6 Reproducir';
    });
    document.getElementById('btn-save-score').addEventListener('click', saveCurrentScoreToLibrary);
}

async function playLoadedScore() {
    if (!loadedScore || !loadedScore.events.length) return;

    const btn = document.getElementById('btn-play-score');

    if (player.isPlaying) {
        player.stop();
        btn.textContent = '\u25B6 Reproducir';
        return;
    }

    player.stop();
    clearPlayingState();
    btn.textContent = '\u23F8 Pausar';

    await player.playSequence(loadedScore.events, getCurrentTempo());

    btn.textContent = '\u25B6 Reproducir';
}

// === EXAMPLES ===
function initExamples() {
    const container = document.getElementById('examples-container');
    MUSICAL_EXAMPLES.forEach(ex => {
        const btn = document.createElement('button');
        btn.className = 'example-btn';
        btn.dataset.exampleId = ex.id;
        btn.innerHTML = `
            <span class="icon">${ex.icon}</span>
            <div class="info">
                <div class="name">${ex.name}</div>
                <div class="desc">${ex.description}</div>
            </div>
        `;
        btn.addEventListener('click', () => playExample(ex, btn));
        container.appendChild(btn);
    });
}

async function playExample(example, btn) {
    if (btn.classList.contains('playing')) {
        player.stop();
        clearPlayingState();
        return;
    }

    player.stop();
    clearPlayingState();

    btn.classList.add('playing');
    currentlyPlayingBtn = btn;

    const events = example.generate();
    await player.playSequence(events, getCurrentTempo());

    btn.classList.remove('playing');
    if (currentlyPlayingBtn === btn) currentlyPlayingBtn = null;
}

function clearPlayingState() {
    document.querySelectorAll('.example-btn.playing').forEach(b => b.classList.remove('playing'));
    currentlyPlayingBtn = null;
}

// === INTERACTIVE KEYBOARD ===
function initKeyboard() {
    const keyboard = document.getElementById('keyboard');
    const whiteKeys = [0, 2, 4, 5, 7, 9, 11];

    const whiteWidth = 100 / 7;
    const blackPositions = {
        1: whiteWidth * 1 - whiteWidth * 0.3,
        3: whiteWidth * 2 - whiteWidth * 0.3,
        6: whiteWidth * 4 - whiteWidth * 0.3,
        8: whiteWidth * 5 - whiteWidth * 0.3,
        10: whiteWidth * 6 - whiteWidth * 0.3,
    };

    whiteKeys.forEach(noteIdx => {
        const key = createKey(noteIdx, false);
        keyboard.appendChild(key);
    });

    [1, 3, 6, 8, 10].forEach(note => {
        const key = createKey(note, true);
        key.style.left = blackPositions[note] + '%';
        key.style.width = (whiteWidth * 0.6) + '%';
        keyboard.appendChild(key);
    });
}

function createKey(noteIndex, isBlack) {
    const key = document.createElement('div');
    key.className = `key ${isBlack ? 'black' : 'white'}`;
    key.dataset.note = noteIndex;

    const centsLabel = document.createElement('span');
    centsLabel.className = 'cents-label';
    key.appendChild(centsLabel);

    const noteLabel = document.createElement('span');
    noteLabel.className = 'note-label';
    noteLabel.textContent = NOTE_NAMES[noteIndex];
    key.appendChild(noteLabel);

    const playKeyNote = (e) => {
        e.preventDefault();
        player._ensureContext();
        const midiNote = 60 + noteIndex;
        player._playNote(midiNote, 0.8, player.ctx.currentTime, 0.7);
        key.classList.add('active');
        setTimeout(() => key.classList.remove('active'), 300);
    };

    key.addEventListener('mousedown', playKeyNote);
    key.addEventListener('touchstart', playKeyNote);
    return key;
}

function updateKeyboard() {
    const keys = document.querySelectorAll('.key');
    const devs = currentTuning.getDeviationsFromET();

    keys.forEach(key => {
        const noteIdx = parseInt(key.dataset.note);
        const dev = devs[noteIdx];
        const centsLabel = key.querySelector('.cents-label');

        if (Math.abs(dev) < 0.05) {
            centsLabel.textContent = '0';
            centsLabel.style.color = '';
        } else {
            centsLabel.textContent = (dev > 0 ? '+' : '') + dev.toFixed(1);
            if (!key.classList.contains('black')) {
                centsLabel.style.color = dev > 0 ? '#22863a' : '#cb2431';
            }
        }
    });
}

// === COMPARISON TABLE ===
function updateComparisonTable() {
    const tbody = document.getElementById('comparison-tbody');
    tbody.innerHTML = '';

    for (let i = 0; i < 12; i++) {
        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        tdName.className = 'note-name';
        tdName.textContent = NOTE_NAMES[i];
        tr.appendChild(tdName);

        TUNING_SYSTEMS.forEach(tuning => {
            const td = document.createElement('td');
            const dev = tuning.cents[i] - i * 100;
            const isActive = tuning.id === currentTuning.id;

            if (isActive) td.classList.add('active-col');

            if (Math.abs(dev) < 0.05) {
                td.textContent = '0.0';
                td.classList.add('cents-zero');
            } else {
                td.textContent = (dev > 0 ? '+' : '') + dev.toFixed(1);
                td.classList.add(dev > 0 ? 'cents-positive' : 'cents-negative');
            }
            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    }
}

// === DESCRIPTION ===
function updateDescription() {
    document.getElementById('tuning-title').textContent = currentTuning.name;
    document.getElementById('tuning-period').textContent = currentTuning.period;
    document.getElementById('tuning-description').innerHTML = currentTuning.description;
}

// === TABS ===
function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.target));
    });
}

function switchTab(targetId) {
    document.querySelectorAll('.tab').forEach(t => {
        t.classList.toggle('active', t.dataset.target === targetId);
    });
    document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.toggle('active', c.id === targetId);
    });
}

// === GLOBAL UPDATE ===
function updateUI() {
    updateDescription();
    updateKeyboard();
    updateComparisonTable();
}
