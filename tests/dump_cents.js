/**
 * dump_cents.js - Vuelca a stdout los cents de cada afinación JS como JSON.
 * Usado por tests/test_parity.py para comparar JS vs Python.
 */
const path = require('node:path');
const { TUNING_SYSTEMS } = require(
    path.join(__dirname, '..', 'web', 'js', 'tunings.js'));

const out = {};
for (const t of TUNING_SYSTEMS) out[t.id] = t.cents;
process.stdout.write(JSON.stringify(out));
