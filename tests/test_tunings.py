"""Tests de las afinaciones (versión escritorio/Python).

Ejecutar con:  python -m unittest tests.test_tunings   (desde la raíz del proyecto)
"""
import math
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from core.tuning_system import AVAILABLE_TUNINGS  # noqa: E402


def tuning(name):
    return AVAILABLE_TUNINGS[name]()


class TestTunings(unittest.TestCase):
    def test_structure(self):
        for name, cls in AVAILABLE_TUNINGS.items():
            t = cls()
            cents = t.get_cents_table()
            self.assertEqual(len(cents), 12, name)
            self.assertAlmostEqual(cents[0], 0.0, places=4, msg=name)
            # La4 (MIDI 69) anclado a 440 Hz; la octava superior duplica.
            self.assertAlmostEqual(t.get_frequency(69), 440.0, places=4, msg=name)
            self.assertAlmostEqual(t.get_frequency(81), 880.0, places=4, msg=name)

    def test_canonical_cents(self):
        eq = tuning("Temperamento Igual").get_cents_table()
        for i in range(12):
            self.assertAlmostEqual(eq[i], i * 100, places=2)

        self.assertAlmostEqual(tuning("Mesotónico (1/4 de coma)").get_cents_table()[7], 696.578, places=2)
        self.assertAlmostEqual(tuning("Mesotónico (1/4 de coma)").get_cents_table()[4], 386.314, places=2)
        self.assertAlmostEqual(tuning("Afinación Pitagórica").get_cents_table()[7], 701.955, places=2)
        self.assertAlmostEqual(tuning("Afinación Pitagórica").get_cents_table()[4], 407.820, places=2)
        self.assertAlmostEqual(tuning("Werckmeister III").get_cents_table()[7], 696.090, places=2)
        self.assertAlmostEqual(tuning("Vallotti").get_cents_table()[7], 698.045, places=2)
        self.assertAlmostEqual(tuning("Afinación Justa (en Do)").get_cents_table()[4], 386.314, places=2)
        self.assertAlmostEqual(tuning("Afinación Justa (en Do)").get_cents_table()[7], 701.955, places=2)

    def test_with_root(self):
        mean = tuning("Mesotónico (1/4 de coma)")
        self.assertIs(mean.with_root(0), mean)

        mean_d = mean.with_root(2)
        self.assertAlmostEqual(mean_d.get_frequency(69), 440.0, places=4)

        def fifth(t, root_midi):
            return 1200 * math.log2(t.get_frequency(root_midi + 7) / t.get_frequency(root_midi))

        # El lobo está en G#-Eb con centro Do; se mueve a Bb-F con centro Re.
        self.assertAlmostEqual(fifth(mean, 68), 737.6, delta=1.0)
        self.assertAlmostEqual(fifth(mean, 70), 696.578, delta=1.0)
        self.assertAlmostEqual(fifth(mean_d, 68), 696.578, delta=1.0)
        self.assertAlmostEqual(fifth(mean_d, 70), 737.6, delta=1.0)


if __name__ == '__main__':
    unittest.main()
