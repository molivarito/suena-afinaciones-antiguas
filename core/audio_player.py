# core/audio_player.py
import time
import platform
try:
    import fluidsynth
    import numpy as np
except ImportError:
    # Proporciona un mensaje de error más claro si las dependencias no están instaladas.
    print("Error: Faltan dependencias para la reproducción de audio.")
    print("Asegúrate de tener 'pyfluidsynth' y 'numpy' instalados: pip install pyfluidsynth numpy")
    print("Además, la biblioteca C de FluidSynth debe estar instalada en tu sistema.")
    print(" - En macOS: brew install fluidsynth")
    print(" - En Debian/Ubuntu: sudo apt-get install fluidsynth")
    raise SystemExit("Dependencias de audio no encontradas.")

from music21 import stream, note, chord

class AudioPlayer:
    def __init__(self, soundfont_path, sample_rate=44100):
        # --- Selección automática del driver de audio ---
        system = platform.system()
        if system == "Darwin": # macOS
            driver = "coreaudio"
        elif system == "Windows":
            driver = "dsound"
        elif system == "Linux":
            driver = "alsa"
        else: # Fallback para otros sistemas
            driver = "default"
        self.fs = fluidsynth.Synth(samplerate=sample_rate)
        self.fs.start(driver=driver)
        
        self.sfid = self.fs.sfload(soundfont_path)
        self.set_instrument(0) # Por defecto, el instrumento es Piano (programa 0)

        self.tuning_system = None
        self.is_playing = False
        self.tempo = 60.0 # Tempo por defecto en BPM

    def set_tuning(self, tuning_system):
        """Establece el sistema de afinación a utilizar."""
        self.tuning_system = tuning_system

    def set_tempo(self, bpm):
        """Establece el tempo de reproducción en beats por minuto."""
        if bpm > 0:
            self.tempo = float(bpm)

    def set_instrument(self, program_number):
        """Establece el instrumento (programa MIDI) para todos los canales."""
        for i in range(16):
            self.fs.program_select(i, self.sfid, 0, program_number)

    def play_score(self, score: stream.Score):
        """Reproduce una partitura de music21 nota por nota."""
        if not self.tuning_system:
            print("Error: No se ha seleccionado un sistema de afinación.")
            return

        # --- Lógica de reproducción mejorada con noteoff ---
        self.is_playing = True

        # --- Lógica de asignación dinámica de canales para pitch bend estable ---
        # Canales 0-8 y 10-14 están disponibles (evitamos el canal 9 de percusión).
        available_channels = list(range(9)) + list(range(10, 15))

        # Configurar el rango de pitch bend a ±2 semitonos en todos los canales (una sola vez)
        for ch in available_channels:
            self.fs.cc(ch, 101, 0)  # RPN MSB
            self.fs.cc(ch, 100, 0)  # RPN LSB
            self.fs.cc(ch, 6, 2)    # Data Entry MSB (2 semitonos)
            self.fs.cc(ch, 38, 0)   # Data Entry LSB

        # Obtener todos los eventos de notas y silencios, ordenados por tiempo
        all_events = sorted(score.flatten().notesAndRests, key=lambda x: x.offset)

        active_notes = []  # (end_time, midi_pitch, channel)
        current_time = 0.0

        for element in all_events:
            if not self.is_playing:
                break

            wait_time = element.offset - current_time
            if wait_time > 0:
                sleep_duration = wait_time * (60.0 / self.tempo)
                time.sleep(sleep_duration)
                current_time = element.offset

            notes_to_remove = []
            for end_time, pitch, channel in active_notes:
                if current_time >= end_time:
                    self.fs.noteoff(channel, pitch)
                    available_channels.append(channel) # Liberar el canal
                    notes_to_remove.append((end_time, pitch, channel))
            active_notes = [n for n in active_notes if n not in notes_to_remove]

            # Solo procesar notas y acordes, ignorar los silencios.
            if isinstance(element, note.Note):
                notes_to_add = [element.pitch]
            elif isinstance(element, chord.Chord):
                notes_to_add = element.pitches
            else: # Es un Rest
                continue

            for pitch_obj in notes_to_add:
                if not self.is_playing:
                    break
                    
                if not available_channels:
                    print("ADVERTENCIA: No hay canales MIDI disponibles. La nota no sonará.")
                    continue
                
                channel = available_channels.pop(0) # Tomar un canal libre
                temp_note = note.Note(pitch_obj)
                self._play_element(temp_note, channel)
                end_time = element.offset + element.duration.quarterLength
                active_notes.append((end_time, pitch_obj.midi, channel))

        # Esperar a que la última nota termine antes de detener todo.
        if active_notes:
            last_note_end_time = max(t[0] for t in active_notes)
            wait_time = last_note_end_time - current_time
            if wait_time > 0:
                time.sleep(wait_time * (60.0 / self.tempo))
        self.stop()

    def _play_element(self, n: note.Note, channel: int):
        """Reproduce una sola nota aplicando la afinación."""
        midi_pitch = n.pitch.midi
        
        # Frecuencia estándar (Temperamento Igual)
        std_freq = 440 * (2 ** ((midi_pitch - 69) / 12))
        # Frecuencia afinada según el sistema elegido
        tuned_freq = self.tuning_system.get_frequency(midi_pitch)

        if tuned_freq is None:
            return

        # Calcular la desviación en cents
        # 1 semitono = 100 cents
        cents_dev = 1200 * np.log2(tuned_freq / std_freq)
        
        # El rango de pitch bend ya fue configurado a ±2 semitonos (±200 cents) en play_score()
        bend_value = int(8191 * (cents_dev / 200))
        
        # Asegurarse de que el valor está en el rango
        bend_value = max(-8192, min(8191, bend_value))

        self.fs.pitch_bend(channel, bend_value)
        self.fs.noteon(channel, midi_pitch, 100) # velocity=100

    def stop(self):
        """Detiene toda la reproducción y resetea los canales."""
        self.is_playing = False
        # Pequeña pausa para asegurar que no se están procesando notas
        time.sleep(0.05)
        for i in range(16):
            self.fs.all_notes_off(i) # Apaga todas las notas
            self.fs.all_sounds_off(i) # Silencia todo el canal inmediatamente
            self.fs.pitch_bend(i, 0) # Resetea el pitch bend

    def close(self):
        """Cierra la conexión con FluidSynth."""
        self.stop()
        self.fs.delete()
