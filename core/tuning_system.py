# core/tuning_system.py
import numpy as np

class TuningSystem:
    """Clase base para todos los sistemas de afinación."""
    def __init__(self, name, description, base_freq=440.0, base_midi=69):
        self.name = name
        self.description = description
        self.base_freq = base_freq
        self.base_midi = base_midi
        self.pitch_table = self._build_pitch_table()

    def _build_pitch_table(self):
        """Debe ser implementado por las subclases para generar las 12 notas de la octava."""
        raise NotImplementedError

    def get_frequency(self, midi_note):
        """Calcula la frecuencia para cualquier nota MIDI."""
        if not self.pitch_table:
            return None
        
        # Calcular qué nota es (0-11) y en qué octava MIDI está
        note_index = midi_note % 12
        note_octave = midi_note // 12
        
        # La pitch_table está construida para una octava de referencia
        # Necesitamos determinar en qué octava está esa tabla
        base_note_index = self.base_midi % 12
        base_octave = self.base_midi // 12
        
        # La frecuencia en pitch_table[note_index] es para la octava de referencia
        # Pero necesitamos calcular cuántas octavas hay de diferencia
        base_note_freq = self.pitch_table[note_index]
        
        # Ajustar por la diferencia de octavas MIDI
        octave_diff = note_octave - base_octave
        
        return base_note_freq * (2 ** octave_diff)

    def get_cents_table(self):
        """
        Calcula los valores en cents para las 12 notas de la escala,
        relativos a la tónica (la primera nota de la tabla de tonos).
        """
        if not self.pitch_table or self.pitch_table[0] == 0:
            return [0.0] * 12

        tonic_freq = self.pitch_table[0]
        cents_table = []
        for freq in self.pitch_table:
            ratio = freq / tonic_freq
            # Normalizar el ratio para que esté dentro de una octava [1, 2)
            while ratio >= 2.0:
                ratio /= 2.0
            cents = 1200 * np.log2(ratio)
            cents_table.append(cents)
        return cents_table

# --- Implementaciones de Afinaciones ---

class EqualTemperament(TuningSystem):
    """Temperamento Igual de 12 tonos (12-TET)."""
    def __init__(self, base_freq=440.0, base_midi=69):
        super().__init__(
            "Temperamento Igual",
            """El estándar universal de la música occidental desde finales del siglo XIX. Su genialidad radica en una solución matemática radical: la octava se divide en doce semitonos *exactamente iguales*. Cada semitono representa una relación de frecuencia idéntica (raiz 12 de 2).

**Sonoridad y Uso:** Su carácter es homogéneo y neutro. La gran ventaja es la libertad total de modulación; una pieza puede transponerse a cualquier tonalidad y sonará funcionalmente idéntica. Sin embargo, esta uniformidad tiene un costo acústico: con la excepción de la octava, ningún intervalo es perfectamente puro. Las terceras mayores suenan notablemente más 'tensas' y brillantes que las puras, y las quintas son una pizca más 'estrechas' de lo ideal.""",
            base_freq,
            base_midi
        )

    def _build_pitch_table(self):
        c_freq = self.base_freq / (2 ** (9/12))
        return [c_freq * (2 ** (i/12)) for i in range(12)]

class JustIntonation(TuningSystem):
    """Afinación Justa (basada en Do)."""
    def __init__(self, base_freq=440.0, base_midi=69):
        super().__init__(
            "Afinación Justa (en Do)",
            """Un sistema idealista que busca la máxima pureza y consonancia acústica. Se construye a partir de proporciones de números enteros pequeños y simples (ratios), como la quinta justa (3:2) y la tercera mayor pura (5:4).

**Sonoridad y Uso:** En su tonalidad principal (aquí, Do Mayor), la sonoridad es increíblemente serena, estable y resonante; los acordes 'vibran' al unísono de manera perfecta. Es el sonido de la física en su estado más puro. Su gran debilidad es la modulación. Al alejarse del centro tonal, las proporciones dejan de encajar y aparecen intervalos extremadamente disonantes, como la infame **quinta del lobo**, que hacen inviables ciertas tonalidades.""",
            base_freq,
            base_midi
        )

    def _build_pitch_table(self):
        # Ratios canónicos de la escala cromática justa de 5-límite en Do Mayor.
        # C=1/1, C#=16/15, D=9/8, Eb=6/5, E=5/4, F=4/3, F#=45/32, G=3/2,
        # G#=8/5, A=5/3, Bb=9/5, B=15/8.
        # F# = 45/32 es la cuarta aumentada estándar (= 9/8 × 5/4), el tritono
        # diatónico natural de la escala de Do Mayor (Fa→Si = 4/3 a 15/8).
        full_ratios = [1/1, 16/15, 9/8, 6/5, 5/4, 4/3, 45/32, 3/2, 8/5, 5/3, 9/5, 15/8]
        # La (índice 9) tiene ratio 5/3, entonces C_freq = A_freq / (5/3) = A_freq * (3/5)
        c_base_freq = self.base_freq * (3/5)
        return [c_base_freq * ratio for ratio in full_ratios]

class PythagoreanTuning(TuningSystem):
    """Afinación Pitagórica (basada en quintas justas)."""
    def __init__(self, base_freq=440.0, base_midi=69):
        super().__init__(
            "Afinación Pitagórica",
            """El sistema de afinación teórico más antiguo e influyente de la cultura occidental, atribuido a la escuela de Pitágoras. Su lógica es simple y elegante: todas las notas se generan a partir de una cadena de quintas acústicamente puras (ratio 3:2).

**Sonoridad y Uso:** Las quintas y cuartas son perfectas, expansivas y resonantes, lo que lo hace ideal para la música melódica monofónica (como el canto gregoriano) y la polifonía temprana donde la quinta es el intervalo estructural. Su gran problema es la **tercera mayor pitagórica** (ratio 81:64), que es muy ancha (408 cents) y suena áspera y disonante para oídos acostumbrados a la música armónica. Esto hace que los acordes de tríada mayor suenen tensos y poco estables.""",
            base_freq,
            base_midi
        )

    def _build_pitch_table(self):
        # Cadena de 11 quintas puras (3:2) con quinta del lobo entre G# y Eb.
        # 8 quintas ascendentes desde C: G, D, A, E, B, F#, C#, G#
        # 3 quintas descendentes desde C: F, Bb, Eb
        # C=1/1, C#=2187/2048, D=9/8, Eb=32/27, E=81/64, F=4/3,
        # F#=729/512, G=3/2, G#=6561/4096, A=27/16, Bb=16/9, B=243/128
        ratios = [1/1, 2187/2048, 9/8, 32/27, 81/64, 4/3, 729/512, 3/2, 6561/4096, 27/16, 16/9, 243/128]
        # La (índice 9) tiene ratio 27/16, entonces C_freq = A_freq / (27/16) = A_freq * (16/27)
        c_base_freq = self.base_freq * (16/27)
        return [c_base_freq * r for r in ratios]

class MeantoneTuning(TuningSystem):
    """Temperamento Mesotónico de 1/4 de coma."""
    def __init__(self, base_freq=440.0, base_midi=69):
        super().__init__(
            "Mesotónico (1/4 de coma)",
            """El temperamento por excelencia del Renacimiento tardío y gran parte del Barroco (aprox. 1500-1750). Nació como una solución directa al problema de la tercera pitagórica. Su objetivo principal es conseguir **terceras mayores perfectamente puras** (ratio 5:4).

**Sonoridad y Uso:** Para lograr terceras puras, las quintas se 'estrechan' (atemperan) ligeramente. El resultado en las tonalidades con pocas alteraciones es una sonoridad dulce, vocal y de una pureza extraordinaria en los acordes mayores y menores. Sin embargo, este sistema 'oculta' toda la disonancia acumulada en una única **quinta del lobo** (típicamente entre Sol# y Mi♭), que es tan horriblemente disonante que resulta inutilizable, limitando drásticamente el rango de tonalidades disponibles para el compositor.""",
            base_freq,
            base_midi
        )

    def _build_pitch_table(self):
        # Cálculo algorítmico desde primeros principios.
        # 11 quintas temperadas (reducidas 1/4 de coma sintónica) + 1 quinta del lobo (G#-Eb).
        # La quinta mesotónica = 5^(1/4) en ratio = 696.578 cents.
        # Esto produce terceras mayores perfectamente puras (5:4 = 386.314 cents).
        # 8 quintas ascendentes desde C: G, D, A, E, B, F#, C#, G#
        # 3 quintas descendentes desde C: F, Bb, Eb
        meantone_fifth = 1200 * np.log2(5 ** (1/4))  # 696.578 cents

        cents = [0.0] * 12
        # Ascendentes (cada una sube una quinta mesotónica)
        for idx, n_fifths in [(7,1), (2,2), (9,3), (4,4), (11,5), (6,6), (1,7), (8,8)]:
            cents[idx] = (n_fifths * meantone_fifth) % 1200
        # Descendentes (cada una baja una quinta mesotónica)
        for idx, n_fifths in [(5,1), (10,2), (3,3)]:
            cents[idx] = (-n_fifths * meantone_fifth) % 1200

        c_freq = self.base_freq / (2 ** (cents[9] / 1200))
        return [c_freq * (2 ** (c / 1200)) for c in cents]

class WerckmeisterTuning(TuningSystem):
    """Temperamento Werckmeister III (1691)."""
    def __init__(self, base_freq=440.0, base_midi=69):
        super().__init__(
            "Werckmeister III",
            """Publicado en 1691, es uno de los primeros y más célebres **temperamentos 'buenos'** (o 'bien temperados'). Fue diseñado por Andreas Werckmeister no para que todas las tonalidades sonaran iguales, sino para que *todas fueran utilizables*, asignando a cada una un 'color' o carácter afectivo único.

**Sonoridad y Uso:** Werckmeister deja muchas quintas puras y solo atempera cuatro de ellas en 1/4 de la coma pitagórica. Esto distribuye la 'impureza' de forma desigual. Las tonalidades más cercanas a Do Mayor (como Sol, Fa, Re) suenan más puras y estables, mientras que las tonalidades con más alteraciones (como Fa# o Do#) adquieren una tensión y un dramatismo crecientes. Es un sistema ideal para la música de J.S. Bach, donde el carácter de cada tonalidad es un recurso expresivo.""",
            base_freq,
            base_midi
        )

    def _build_pitch_table(self):
        # Cálculo algorítmico desde primeros principios.
        # 4 quintas temperadas (reducidas 1/4 de coma pitagórica): C-G, G-D, D-A, B-F#
        # 8 quintas puras (3:2): A-E, E-B, F#-C#, C#-G#, G#-Eb, Eb-Bb, Bb-F, F-C
        pure_fifth = 1200 * np.log2(3/2)  # 701.955 cents
        pyth_comma = 1200 * np.log2(3**12 / 2**19)  # 23.460 cents
        tempered_fifth = pure_fifth - pyth_comma / 4  # 696.090 cents

        # Construir cadena de quintas: C->G(t)->D(t)->A(t)->E(p)->B(p)->F#(t)->C#(p)->G#(p)->Eb(p)->Bb(p)->F(p)
        cents = [0.0] * 12
        # Notas índice: C=0, C#=1, D=2, Eb=3, E=4, F=5, F#=6, G=7, G#=8, A=9, Bb=10, B=11
        cents[7] = tempered_fifth                           # G  (temperada)
        cents[2] = (cents[7] + tempered_fifth) % 1200       # D  (temperada)
        cents[9] = cents[2] + tempered_fifth                # A  (temperada)
        cents[4] = (cents[9] + pure_fifth) % 1200           # E  (pura)
        cents[11] = cents[4] + pure_fifth                   # B  (pura)
        cents[6] = (cents[11] + tempered_fifth) % 1200      # F# (temperada)
        cents[1] = (cents[6] + pure_fifth) % 1200           # C# (pura)
        cents[8] = cents[1] + pure_fifth                    # G# (pura)
        cents[3] = (cents[8] + pure_fifth) % 1200           # Eb (pura)
        cents[10] = cents[3] + pure_fifth                   # Bb (pura)
        cents[5] = (cents[10] + pure_fifth) % 1200          # F  (pura)

        c_freq = self.base_freq / (2 ** (cents[9] / 1200))
        return [c_freq * (2 ** (c / 1200)) for c in cents]

class KirnbergerTuning(TuningSystem):
    """Temperamento Kirnberger III (c. 1779)."""
    def __init__(self, base_freq=440.0, base_midi=69):
        super().__init__(
            "Kirnberger III",
            """Un fascinante temperamento irregular atribuido a Johann Kirnberger, un alumno de J.S. Bach. Es un sistema híbrido que intenta reconciliar la pureza de la afinación justa con la versatilidad de los temperamentos circulares.

**Sonoridad y Uso:** Su rasgo más distintivo es que mantiene la **tercera Do-Mi perfectamente pura** (386.3 cents), al igual que en la afinación justa. Solo una quinta es pura (Sol-Re). El resto de la disonancia se distribuye de forma muy irregular, concentrando la coma sintónica en una quinta y la coma pitagórica en otra. Esto dota a cada tonalidad de un carácter extremadamente distintivo y a menudo peculiar, reflejando quizás una práctica más improvisada y teórica de la época.""",
            base_freq,
            base_midi
        )

    def _build_pitch_table(self):
        # Cálculo algorítmico desde primeros principios.
        # 4 quintas temperadas (reducidas 1/4 de coma sintónica): C-G, G-D, D-A, A-E
        # 1 quinta esquismática (reducida por 1 schisma): F#-C#
        # 7 quintas puras (3:2): E-B, B-F#, C#-G#, G#-Eb, Eb-Bb, Bb-F, F-C
        # Resultado clave: la tercera C-E es perfectamente pura (5:4 = 386.314 cents).
        pure_fifth = 1200 * np.log2(3/2)  # 701.955 cents
        syntonic_comma = 1200 * np.log2(81/80)  # 21.506 cents
        pyth_comma = 1200 * np.log2(3**12 / 2**19)  # 23.460 cents
        schisma = pyth_comma - syntonic_comma  # 1.954 cents
        tempered_fifth = pure_fifth - syntonic_comma / 4  # 696.578 cents
        schisma_fifth = pure_fifth - schisma  # 700.001 cents

        # Construir cadena de quintas: C->G(t)->D(t)->A(t)->E(t)->B(p)->F#(p)->C#(s)->G#(p)->Eb(p)->Bb(p)->F(p)
        cents = [0.0] * 12
        cents[7] = tempered_fifth                           # G  (temperada 1/4 SC)
        cents[2] = (cents[7] + tempered_fifth) % 1200       # D  (temperada 1/4 SC)
        cents[9] = cents[2] + tempered_fifth                # A  (temperada 1/4 SC)
        cents[4] = (cents[9] + tempered_fifth) % 1200       # E  (temperada 1/4 SC)
        cents[11] = cents[4] + pure_fifth                   # B  (pura)
        cents[6] = (cents[11] + pure_fifth) % 1200          # F# (pura)
        cents[1] = (cents[6] + schisma_fifth) % 1200        # C# (esquismática)
        cents[8] = cents[1] + pure_fifth                    # G# (pura)
        cents[3] = (cents[8] + pure_fifth) % 1200           # Eb (pura)
        cents[10] = cents[3] + pure_fifth                   # Bb (pura)
        cents[5] = (cents[10] + pure_fifth) % 1200          # F  (pura)

        c_freq = self.base_freq / (2 ** (cents[9] / 1200))
        return [c_freq * (2 ** (c / 1200)) for c in cents]

class VallottiTuning(TuningSystem):
    """Temperamento Vallotti (c. 1750)."""
    def __init__(self, base_freq=440.0, base_midi=69):
        super().__init__(
            "Vallotti",
            """Un elegante y equilibrado temperamento circular desarrollado por Francesco Vallotti a mediados del siglo XVIII. Fue muy popular en Italia y es uno de los más utilizados hoy en día para la interpretación de música del Barroco tardío por su balance perfecto entre carácter y funcionalidad.

**Sonoridad y Uso:** Su construcción es simple y simétrica: las seis quintas 'naturales' (de Fa a Si en el círculo de quintas) se atemperan todas por igual (se estrechan 1/6 de coma pitagórica), mientras que las seis quintas 'con sostenidos' (de Si a Fa) se dejan puras. El resultado es un degradado sonoro muy suave: las tonalidades con pocas alteraciones son muy consonantes y estables, y a medida que se añaden sostenidos o bemoles, ganan una tensión expresiva gradual y agradable, sin ninguna tonalidad 'mala'.""",
            base_freq,
            base_midi
        )

    def _build_pitch_table(self):
        # Cálculo algorítmico desde primeros principios.
        # 6 quintas temperadas (reducidas 1/6 de coma pitagórica): F-C, C-G, G-D, D-A, A-E, E-B
        # 6 quintas puras (3:2): B-F#, F#-C#, C#-G#, G#-Eb, Eb-Bb, Bb-F
        pure_fifth = 1200 * np.log2(3/2)  # 701.955 cents
        pyth_comma = 1200 * np.log2(3**12 / 2**19)  # 23.460 cents
        tempered_fifth = pure_fifth - pyth_comma / 6  # 698.045 cents

        # Construir cadena de quintas: C->G(t)->D(t)->A(t)->E(t)->B(t)->F#(p)->C#(p)->G#(p)->Eb(p)->Bb(p)->F(p)
        cents = [0.0] * 12
        cents[7] = tempered_fifth                           # G  (temperada)
        cents[2] = (cents[7] + tempered_fifth) % 1200       # D  (temperada)
        cents[9] = cents[2] + tempered_fifth                # A  (temperada)
        cents[4] = (cents[9] + tempered_fifth) % 1200       # E  (temperada)
        cents[11] = cents[4] + tempered_fifth               # B  (temperada)
        cents[6] = (cents[11] + pure_fifth) % 1200          # F# (pura)
        cents[1] = (cents[6] + pure_fifth) % 1200           # C# (pura)
        cents[8] = cents[1] + pure_fifth                    # G# (pura)
        cents[3] = (cents[8] + pure_fifth) % 1200           # Eb (pura)
        cents[10] = cents[3] + pure_fifth                   # Bb (pura)
        cents[5] = (cents[10] + pure_fifth) % 1200          # F  (pura)

        c_freq = self.base_freq / (2 ** (cents[9] / 1200))
        return [c_freq * (2 ** (c / 1200)) for c in cents]

# --- Diccionario de afinaciones disponibles ---
AVAILABLE_TUNINGS = {
    "Temperamento Igual": EqualTemperament,
    "Afinación Pitagórica": PythagoreanTuning,
    "Afinación Justa (en Do)": JustIntonation,
    "Mesotónico (1/4 de coma)": MeantoneTuning,
    "Werckmeister III": WerckmeisterTuning,
    "Kirnberger III": KirnbergerTuning,
    "Vallotti": VallottiTuning,
}