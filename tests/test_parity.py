"""Test de paridad: las afinaciones de la versión web (JS) y la de escritorio
(Python) deben producir exactamente los mismos cents. Es la garantía de que
ambas implementaciones no diverjan.

Ejecutar con:  python -m unittest tests.test_parity   (desde la raíz del proyecto)
Si `node` no está instalado, el test se omite (no falla).
"""
import json
import os
import shutil
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from core.tuning_system import AVAILABLE_TUNINGS  # noqa: E402

# id de la afinación en JS -> nombre en el diccionario de Python
ID_TO_NAME = {
    'equal': 'Temperamento Igual',
    'pythagorean': 'Afinación Pitagórica',
    'just': 'Afinación Justa (en Do)',
    'meantone': 'Mesotónico (1/4 de coma)',
    'werckmeister': 'Werckmeister III',
    'kirnberger': 'Kirnberger III',
    'vallotti': 'Vallotti',
}


class TestParity(unittest.TestCase):
    def test_js_python_cents_match(self):
        node = shutil.which('node')
        if not node:
            self.skipTest('node no disponible; se omite la paridad JS/Python')

        dump = os.path.join(os.path.dirname(__file__), 'dump_cents.js')
        raw = subprocess.check_output([node, dump])
        js = json.loads(raw)

        for jid, name in ID_TO_NAME.items():
            py = AVAILABLE_TUNINGS[name]().get_cents_table()
            jcents = js[jid]
            for i in range(12):
                self.assertAlmostEqual(
                    py[i], jcents[i], places=2,
                    msg=f'{name} (nota {i}): python={py[i]:.4f} js={jcents[i]:.4f}')


if __name__ == '__main__':
    unittest.main()
