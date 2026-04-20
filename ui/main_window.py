# ui/main_window.py
import os
import shutil
import tempfile
import subprocess
from pathlib import Path
from PyQt6.QtWidgets import (QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QSlider, QTabWidget,
                             QPushButton, QComboBox, QLabel, QFileDialog, QTextEdit, 
                             QSplitter, QMessageBox, QScrollArea, QTableWidget, QTableWidgetItem)
from PyQt6.QtCore import Qt, QThread, pyqtSignal
from PyQt6.QtGui import QPixmap
from music21 import converter, instrument as instrument_module

from core.audio_player import AudioPlayer
from core.tuning_system import AVAILABLE_TUNINGS

# Hilo para la reproducción de audio para no congelar la GUI
class PlaybackThread(QThread):
    finished = pyqtSignal()

    def __init__(self, player, score):
        super().__init__()
        self.player = player
        self.score = score

    def run(self):
        self.player.play_score(self.score)
        self.finished.emit()

# Hilo para la renderización de la partitura a imagen
class RenderThread(QThread):
    finished = pyqtSignal(str) # Emite la ruta de la imagen generada

    def __init__(self, score):
        super().__init__()
        self.score = score

    def run(self):
        try:
            # Con la configuración correcta en main.py, music21 puede manejar esto.
            # El método .write() generará la imagen en un archivo temporal y devolverá la ruta.
            image_path = self.score.write('musicxml.png')

            # Verificamos que el archivo se haya creado correctamente.
            if os.path.exists(image_path) and os.path.getsize(image_path) > 0:
                self.finished.emit(str(image_path))
            else:
                print("Error de renderizado: MuseScore no generó un archivo de imagen válido.")
                self.finished.emit("") # Emitir cadena vacía para indicar el fallo
        except Exception as e:
            print(f"Error al renderizar la partitura: {e}")
            self.finished.emit("") # Emitir cadena vacía en caso de error

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Explorador de Afinaciones Históricas")
        self.setGeometry(100, 100, 1000, 700)

        # --- Construir rutas absolutas a los recursos ---
        # Esto hace que la app funcione sin importar desde dónde se ejecute.
        self.base_path = Path(__file__).resolve().parent.parent # Apunta a la carpeta raíz del proyecto
        soundfont_file = self.base_path / 'resources' / 'soundfonts' / 'GeneralUser.sf2'

        # --- Inicialización de componentes ---
        self.score = None
        self.player = AudioPlayer(soundfont_path=str(soundfont_file))
        self.current_filepath = None # Guardará la ruta del archivo cargado
        self.playback_thread = None
        self.render_thread = None
        self.temp_image_path = None # Para gestionar la limpieza del archivo de imagen
        self.original_pixmap = None # Para guardar la imagen original y re-escalarla
        # Diccionario de instrumentos (Nombre amigable: Número de Programa General MIDI)
        self.INSTRUMENTS = {
            "Piano de Cola": 0,
            "Clavecín": 6,
            "Órgano de Iglesia": 19,
            "Laúd": 25,
            "Violonchelo": 42,
            "Conjunto de Cuerdas": 48,
            "Coro 'Aahs'": 52,
            "Sección de Bronces": 61,
            "Oboe": 68,
            "Flauta Dulce (sin vibrato)": 74,
        }

        # --- Configuración de la UI ---
        self.central_widget = QWidget()
        self.setCentralWidget(self.central_widget)
        self.layout = QVBoxLayout(self.central_widget)

        # Panel de control superior
        control_panel = QHBoxLayout()
        self.load_button = QPushButton("Cargar Partitura...")
        self.add_to_library_button = QPushButton("Añadir a Librería")
        self.library_combo = QComboBox()
        self.tuning_combo = QComboBox()
        self.tempo_slider = QSlider(Qt.Orientation.Horizontal)
        self.tempo_label = QLabel("60 BPM")
        self.instrument_combo = QComboBox()
        self.play_button = QPushButton("▶️ Reproducir")
        self.stop_button = QPushButton("⏹️ Detener")

        control_panel.addWidget(self.load_button)
        control_panel.addWidget(self.add_to_library_button)
        control_panel.addWidget(QLabel("Librería:"))
        control_panel.addWidget(self.library_combo)
        control_panel.addStretch()
        control_panel.addWidget(QLabel("Afinación:"))
        control_panel.addWidget(self.tuning_combo)
        control_panel.addWidget(QLabel("Tempo:"))
        control_panel.addWidget(self.tempo_slider)
        control_panel.addWidget(self.tempo_label)
        control_panel.addWidget(QLabel("Instrumento:"))
        control_panel.addWidget(self.instrument_combo)
        control_panel.addWidget(self.play_button)
        control_panel.addWidget(self.stop_button)
        
        self.layout.addLayout(control_panel)

        # Panel principal con divisor
        main_splitter = QSplitter(Qt.Orientation.Horizontal)
        
        # --- Panel derecho con pestañas ---
        self.info_tabs = QTabWidget()

        # Pestaña de Descripción
        description_widget = QWidget()
        description_layout = QVBoxLayout(description_widget)
        self.tuning_title = QLabel("Seleccione una afinación")
        self.tuning_title.setStyleSheet("font-size: 16px; font-weight: bold;")
        self.tuning_description = QTextEdit()
        self.tuning_description.setReadOnly(True)
        description_layout.addWidget(self.tuning_title)
        description_layout.addWidget(self.tuning_description)
        self.info_tabs.addTab(description_widget, "Descripción")

        # Pestaña de Comparación de Cents
        comparison_widget = QWidget()
        comparison_layout = QVBoxLayout(comparison_widget)
        self.comparison_table = QTableWidget()
        comparison_layout.addWidget(self.comparison_table)
        self.info_tabs.addTab(comparison_widget, "Comparación (cents)")

        # Pestaña de Ejemplos de Audio
        examples_widget = QWidget()
        examples_layout = QVBoxLayout(examples_widget)
        
        examples_label = QLabel("Genera ejemplos musicales para destacar las diferencias entre afinaciones:")
        examples_label.setWordWrap(True)
        examples_layout.addWidget(examples_label)
        
        # Botones de ejemplos
        self.btn_scale = QPushButton("🎼 Escala Cromática (C4-C5)")
        self.btn_major_third = QPushButton("🎵 Tercera Mayor (C-E)")
        self.btn_fifth = QPushButton("🎵 Quinta Justa (C-G)")
        self.btn_major_triad = QPushButton("🎹 Acorde de Do Mayor (C-E-G)")
        self.btn_wolf_fifth = QPushButton("🐺 Quinta del Lobo (G♯-E♭)")
        self.btn_all_triads = QPushButton("🎹 Triadas en todas las tonalidades")
        
        self.btn_scale.clicked.connect(lambda: self.play_example("scale"))
        self.btn_major_third.clicked.connect(lambda: self.play_example("major_third"))
        self.btn_fifth.clicked.connect(lambda: self.play_example("fifth"))
        self.btn_major_triad.clicked.connect(lambda: self.play_example("major_triad"))
        self.btn_wolf_fifth.clicked.connect(lambda: self.play_example("wolf_fifth"))
        self.btn_all_triads.clicked.connect(lambda: self.play_example("all_triads"))
        
        examples_layout.addWidget(self.btn_scale)
        examples_layout.addWidget(self.btn_major_third)
        examples_layout.addWidget(self.btn_fifth)
        examples_layout.addWidget(self.btn_major_triad)
        examples_layout.addWidget(self.btn_wolf_fifth)
        examples_layout.addWidget(self.btn_all_triads)
        examples_layout.addStretch()
        
        self.info_tabs.addTab(examples_widget, "Ejemplos de Audio")

        # Área de visualización de la partitura con scroll
        self.scroll_area = QScrollArea()
        self.scroll_area.setWidgetResizable(True)
        self.score_view = QLabel("Cargue una partitura para verla aquí.\n(Requiere MuseScore instalado)")
        self.score_view.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.scroll_area.setWidget(self.score_view)

        main_splitter.addWidget(self.scroll_area)
        main_splitter.addWidget(self.info_tabs)
        main_splitter.setSizes([700, 300])

        self.layout.addWidget(main_splitter)

        # --- Conectar señales y slots ---
        self.load_button.clicked.connect(self.load_file)
        self.add_to_library_button.clicked.connect(self.add_to_library)
        self.library_combo.currentIndexChanged.connect(self.load_from_library)
        self.tuning_combo.currentIndexChanged.connect(self.update_tuning)
        self.tempo_slider.valueChanged.connect(self.update_tempo)
        self.instrument_combo.currentIndexChanged.connect(self.update_instrument)
        self.play_button.clicked.connect(self.play_score)
        self.stop_button.clicked.connect(self.stop_score)

        # --- Configurar y poblar widgets ---
        self.tempo_slider.setRange(30, 240)
        self.tempo_slider.setValue(60)  # Default: 60 BPM para mejor percepción de diferencias
        self.tempo_slider.setFixedWidth(150)
        self.tempo_label.setFixedWidth(60)

        # --- Poblar widgets ---
        self.populate_library()
        self.populate_instruments()
        self.populate_tunings()
        self.populate_comparison_table()
        
        # Estado inicial de los botones
        self.play_button.setEnabled(False)
        self.stop_button.setEnabled(False)
        self.add_to_library_button.setEnabled(False)

    def populate_library(self):
        self.library_combo.addItem("--- Seleccionar de la librería ---", userData=None)
        library_path = self.base_path / 'resources' / 'scores'
        if library_path.exists():
            # Usamos os.walk para escanear recursivamente el directorio de la librería
            for dirpath, _, filenames in sorted(os.walk(library_path)):
                for filename in sorted(filenames):
                    if filename.endswith(('.mid', '.xml', '.mxl', '.krn')):
                        full_path = os.path.join(dirpath, filename)
                        # Creamos un nombre de visualización que incluya la subcarpeta
                        display_name = os.path.relpath(full_path, library_path)
                        self.library_combo.addItem(display_name, userData=full_path)

    def populate_instruments(self):
        for name in self.INSTRUMENTS.keys():
            self.instrument_combo.addItem(name)
        # Seleccionar Órgano de Iglesia por defecto (mejor para percibir diferencias de afinación)
        organ_index = list(self.INSTRUMENTS.keys()).index("Órgano de Iglesia")
        self.instrument_combo.setCurrentIndex(organ_index)
        self.update_instrument()  # Aplicar el instrumento por defecto

    def populate_tunings(self):
        for name in AVAILABLE_TUNINGS.keys():
            self.tuning_combo.addItem(name)
        self.update_tuning() # Cargar la primera de la lista

    def populate_comparison_table(self):
        """Rellena la tabla con los valores en cents de cada afinación."""
        tunings = [AVAILABLE_TUNINGS[name]() for name in AVAILABLE_TUNINGS.keys()]
        note_names = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"]

        self.comparison_table.setRowCount(12)
        self.comparison_table.setColumnCount(len(tunings))

        self.comparison_table.setVerticalHeaderLabels(note_names)
        self.comparison_table.setHorizontalHeaderLabels([t.name for t in tunings])

        for col, tuning_system in enumerate(tunings):
            cents_values = tuning_system.get_cents_table()
            for row, cents in enumerate(cents_values):
                item = QTableWidgetItem(f"{cents:.2f}")
                item.setTextAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
                self.comparison_table.setItem(row, col, item)
        
        self.comparison_table.resizeColumnsToContents()

    def load_file(self):
        filepath, _ = QFileDialog.getOpenFileName(self, "Abrir Partitura", "", "Archivos de Música (*.xml *.mxl *.mid *.krn)")
        if filepath:
            self.load_score(filepath, from_library=False)

    def load_from_library(self, index):
        filepath = self.library_combo.itemData(index)
        if filepath:
            self.load_score(filepath, from_library=True)

    def load_score(self, filepath, from_library=False):
        try:
            # Limpiar la imagen temporal anterior si existe
            if self.temp_image_path and os.path.exists(self.temp_image_path):
                os.remove(self.temp_image_path)
                self.temp_image_path = None

            self.score_view.setText("Cargando y renderizando partitura...")
            raw_score = converter.parse(filepath)

            # --- Pre-procesamiento para partituras complejas ---
            # Agrupa los instrumentos en un número manejable de partes.
            # Esto es crucial para evitar el error "out of midi channels".
            if len(raw_score.parts) > 15:
                self.score = instrument_module.partitionByInstrument(raw_score)
            else:
                self.score = raw_score

            self.current_filepath = filepath
            self.play_button.setEnabled(True)
            
            # Activa el botón "Añadir a Librería" solo si no viene de la librería
            self.add_to_library_button.setEnabled(not from_library)

            # Iniciar el renderizado de la partitura en un hilo
            if self.render_thread and self.render_thread.isRunning():
                self.render_thread.wait(3000) # Esperar a que termine el renderizado anterior
            self.render_thread = RenderThread(self.score)
            self.render_thread.finished.connect(self.on_render_finished)
            self.render_thread.start()

        except Exception as e:
            self.current_filepath = None
            self.score_view.setText(f"Error al cargar la partitura:\n{e}")
            self.play_button.setEnabled(False)
            self.add_to_library_button.setEnabled(False)

    def on_render_finished(self, image_path):
        if image_path:
            self.temp_image_path = image_path
            self.original_pixmap = QPixmap(image_path)
            self.update_score_pixmap()
        else:
            self.original_pixmap = None
            self.score_view.setText("No se pudo renderizar la partitura.\nAsegúrese de que MuseScore está instalado.")

    def update_score_pixmap(self):
        """Escala el pixmap original al ancho actual del scroll area."""
        if not self.original_pixmap:
            return
        
        # Usamos el ancho del viewport del scroll area para un cálculo más preciso
        viewport_width = self.scroll_area.viewport().width()
        scaled_pixmap = self.original_pixmap.scaledToWidth(viewport_width, Qt.TransformationMode.SmoothTransformation)
        self.score_view.setPixmap(scaled_pixmap)

    def add_to_library(self):
        if not self.current_filepath:
            return

        filename = os.path.basename(self.current_filepath)
        destination_path = self.base_path / 'resources' / 'scores' / filename

        if destination_path.exists():
            QMessageBox.information(self, "Información", f"El archivo '{filename}' ya existe en la librería.")
            return

        try:
            shutil.copy(self.current_filepath, destination_path)
            # Actualizar el ComboBox de la librería
            self.library_combo.addItem(filename, userData=str(destination_path))
            QMessageBox.information(self, "Éxito", f"'{filename}' ha sido añadido a la librería.")
            self.add_to_library_button.setEnabled(False) # Desactivar tras añadir
        except Exception as e:
            QMessageBox.warning(self, "Error", f"No se pudo añadir el archivo a la librería:\n{e}")

    def update_tuning(self):
        tuning_name = self.tuning_combo.currentText()
        TuningClass = AVAILABLE_TUNINGS[tuning_name]
        tuning_system = TuningClass() # Instanciar con valores por defecto
        
        self.player.set_tuning(tuning_system)
        
        self.tuning_title.setText(tuning_system.name)
        self.tuning_description.setText(tuning_system.description)
        
        # Si hay reproducción activa, detenerla (el usuario puede volver a reproducir)
        if self.playback_thread and self.playback_thread.isRunning():
            self.stop_score()

    def update_instrument(self):
        instrument_name = self.instrument_combo.currentText()
        program_number = self.INSTRUMENTS[instrument_name]
        self.player.set_instrument(program_number)

    def update_tempo(self, value):
        """Actualiza la etiqueta de tempo y lo establece en el reproductor."""
        self.tempo_label.setText(f"{value} BPM")
        self.player.set_tempo(value)

    def play_score(self):
        if self.score and not (self.playback_thread and self.playback_thread.isRunning()):
            self.play_button.setEnabled(False)
            self.stop_button.setEnabled(True)
            
            self.playback_thread = PlaybackThread(self.player, self.score)
            self.playback_thread.finished.connect(self.on_playback_finished)
            self.playback_thread.start()

    def stop_score(self):
        if self.playback_thread and self.playback_thread.isRunning():
            self.player.stop()
            self.playback_thread.wait(3000)  # Esperar a que el hilo termine antes de continuar

    def play_example(self, example_type):
        """Genera y reproduce ejemplos musicales para destacar diferencias de afinación."""
        from music21 import stream, note, chord, meter
        
        s = stream.Stream()
        s.append(meter.TimeSignature('4/4'))
        
        if example_type == "scale":
            # Escala cromática de C4 a C5
            for midi in range(60, 73):  # C4 a C5
                n = note.Note()
                n.pitch.midi = midi
                n.duration.quarterLength = 0.5
                s.append(n)
        
        elif example_type == "major_third":
            # Tercera mayor C-E, repetida varias veces
            for _ in range(4):
                c = chord.Chord(['C4', 'E4'])
                c.duration.quarterLength = 2.0
                s.append(c)
        
        elif example_type == "fifth":
            # Quinta justa C-G, repetida varias veces
            for _ in range(4):
                c = chord.Chord(['C4', 'G4'])
                c.duration.quarterLength = 2.0
                s.append(c)
        
        elif example_type == "major_triad":
            # Acorde de Do mayor (C-E-G)
            for _ in range(4):
                c = chord.Chord(['C4', 'E4', 'G4'])
                c.duration.quarterLength = 2.0
                s.append(c)
        
        elif example_type == "wolf_fifth":
            # Quinta del lobo: G#-Eb (en mesotónico es horrible)
            for _ in range(4):
                c = chord.Chord(['G#4', 'E-5'])
                c.duration.quarterLength = 2.0
                s.append(c)
        
        elif example_type == "all_triads":
            # Triadas mayores en todas las tonalidades cromáticas
            triads = [
                ['C4', 'E4', 'G4'],
                ['C#4', 'F4', 'G#4'],
                ['D4', 'F#4', 'A4'],
                ['E-4', 'G4', 'B-4'],
                ['E4', 'G#4', 'B4'],
                ['F4', 'A4', 'C5'],
                ['F#4', 'A#4', 'C#5'],
                ['G4', 'B4', 'D5'],
                ['G#4', 'C5', 'D#5'],
                ['A4', 'C#5', 'E5'],
                ['B-4', 'D5', 'F5'],
                ['B4', 'D#5', 'F#5'],
            ]
            for triad_notes in triads:
                c = chord.Chord(triad_notes)
                c.duration.quarterLength = 2.0
                s.append(c)
        
        # Reproducir el ejemplo sin sobrescribir la partitura cargada
        if self.playback_thread and self.playback_thread.isRunning():
            self.player.stop()
            self.playback_thread.wait(2000)

        self.play_button.setEnabled(False)
        self.stop_button.setEnabled(True)

        self.playback_thread = PlaybackThread(self.player, s)
        self.playback_thread.finished.connect(self.on_playback_finished)
        self.playback_thread.start()

    def on_playback_finished(self):
        self.play_button.setEnabled(self.score is not None)
        self.stop_button.setEnabled(False)
        self.playback_thread = None

    def resizeEvent(self, event):
        """Se llama cada vez que la ventana cambia de tamaño."""
        super().resizeEvent(event)
        self.update_score_pixmap()

    def closeEvent(self, event):
        """Asegurarse de cerrar el reproductor de audio al salir."""
        self.stop_score()
        
        # Esperar a que los threads terminen correctamente
        if self.playback_thread and self.playback_thread.isRunning():
            self.playback_thread.wait(2000)  # Esperar máximo 2 segundos
        
        if self.render_thread and self.render_thread.isRunning():
            self.render_thread.wait(1000)  # Esperar máximo 1 segundo
        
        # Limpiar el último archivo de imagen temporal al cerrar la app
        if self.temp_image_path and os.path.exists(self.temp_image_path):
            os.remove(self.temp_image_path)
        
        self.player.close()
        event.accept()
