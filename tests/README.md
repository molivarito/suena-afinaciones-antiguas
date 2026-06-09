# Tests

Pruebas de la lógica de afinaciones (lo correcto a nivel musicológico). Todo sin
dependencias externas.

## Python (afinaciones de escritorio)

Desde la raíz del proyecto:

```bash
python -m unittest discover -s tests -p 'test_*.py'
```

- `test_tunings.py` — valores canónicos en cents, La4 = 440 Hz, y la
  transposición del centro del temperamento (`with_root`).
- `test_parity.py` — verifica que la versión web (JS) y la de escritorio
  (Python) produzcan los mismos cents. Se omite si `node` no está instalado.

## JavaScript (afinaciones web)

```bash
node tests/tunings.test.js
```

Mismas comprobaciones para la implementación de `web/js/tunings.js`.
