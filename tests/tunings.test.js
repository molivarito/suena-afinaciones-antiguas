/**
 * tunings.test.js - Tests de las afinaciones (versión web/JS).
 * Sin dependencias: ejecutar con `node tests/tunings.test.js`.
 */
const assert = require('node:assert');
const path = require('node:path');
const { TUNING_SYSTEMS, getTuningById } = require(
    path.join(__dirname, '..', 'web', 'js', 'tunings.js'));

let passed = 0;
const close = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
function check(name, cond) { assert.ok(cond, name); passed++; }

// --- Estructura básica ---
for (const t of TUNING_SYSTEMS) {
    check(`${t.id}: 12 cents`, t.cents.length === 12);
    check(`${t.id}: cents[0] == 0`, close(t.cents[0], 0));
    check(`${t.id}: La4 = 440 Hz`, close(t.getFrequency(69), 440, 1e-6));
    check(`${t.id}: octava +1 duplica`, close(t.getFrequency(81), 880, 1e-6));
}

// --- Valores canónicos en cents (verificados contra fuentes musicológicas) ---
const eq = getTuningById('equal');
for (let i = 0; i < 12; i++) check(`equal[${i}] = ${i * 100}c`, close(eq.cents[i], i * 100));

check('meantone 5ª = 696.578c',  close(getTuningById('meantone').cents[7], 696.578, 0.01));
check('meantone 3ª pura = 386.314c', close(getTuningById('meantone').cents[4], 386.314, 0.01));
check('pitagórica 5ª pura = 701.955c', close(getTuningById('pythagorean').cents[7], 701.955, 0.01));
check('pitagórica 3ª ancha = 407.820c', close(getTuningById('pythagorean').cents[4], 407.820, 0.01));
check('werckmeister 5ª = 696.090c', close(getTuningById('werckmeister').cents[7], 696.090, 0.01));
check('vallotti 5ª = 698.045c', close(getTuningById('vallotti').cents[7], 698.045, 0.01));
check('justa 3ª pura = 386.314c', close(getTuningById('just').cents[4], 386.314, 0.01));
check('justa 5ª pura = 701.955c', close(getTuningById('just').cents[7], 701.955, 0.01));

// --- withRoot (centro del temperamento) ---
const mean = getTuningById('meantone');
check('withRoot(0) === self', mean.withRoot(0) === mean);
const meanD = mean.withRoot(2);
check('withRoot(2) mantiene La4 = 440', close(meanD.getFrequency(69), 440, 1e-6));

// El lobo del mesotónico debe moverse de G#-Eb (centro Do) a Bb-F (centro Re).
const fifth = (t, rootMidi) =>
    1200 * Math.log2(t.getFrequency(rootMidi + 7) / t.getFrequency(rootMidi));
check('centro Do: G#-Eb es lobo (~737c)', close(fifth(mean, 68), 737.6, 1.0));
check('centro Do: Bb-F normal (~696.6c)', close(fifth(mean, 70), 696.578, 1.0));
check('centro Re: G#-Eb normal (~696.6c)', close(fifth(meanD, 68), 696.578, 1.0));
check('centro Re: Bb-F es lobo (~737c)', close(fifth(meanD, 70), 737.6, 1.0));

console.log(`✓ tunings.test.js: ${passed} comprobaciones OK`);
