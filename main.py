# main.py
import sys
from music21 import environment
from PyQt6.QtWidgets import QApplication
from ui.main_window import MainWindow

if __name__ == '__main__':
    app = QApplication(sys.argv)
    
    # --- Configuración de music21 para MuseScore 4 ---
    # Esto es crucial para que music21 sepa cómo llamar a MuseScore
    # para generar imágenes en segundo plano.
    # Se hace después de crear QApplication para evitar conflictos de threads
    try:
        us = environment.UserSettings()
        us['musescoreDirectPNGPath'] = '/Applications/MuseScore 4.app/Contents/MacOS/mscore'
    except Exception as e:
        print(f"Advertencia: No se pudo configurar music21 environment: {e}")

    window = MainWindow()
    window.show()
    sys.exit(app.exec())
