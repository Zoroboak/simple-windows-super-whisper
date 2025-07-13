# Simple Windows Super Whisper

A Windows desktop application that provides instant voice-to-text transcription using OpenAI's Whisper API.

## Features
- 🎤 One-click voice recording with `Ctrl + Space` hotkey
- 📝 Real-time waveform visualization
- ⚡ Instant transcription
- 📋 Automatic clipboard copy
- 🔑 Global hotkey support
- 🎨 Modern, minimalist UI

## Quick Start Guide

### 1. Get OpenAI API Key
1. Visit [OpenAI's website](https://platform.openai.com/signup)
2. Create an account or sign in
3. Go to [API Keys section](https://platform.openai.com/api-keys)
4. Click "Create new secret key"
5. Copy your API key (keep it secure!)
6. Create a file named `.env` in the application directory and add:
   ```
   OPENAI_API_KEY=your_api_key_here
   ```

### 2. Installation

#### Prerequisites
- Python 3.8 or higher ([Download Python](https://www.python.org/downloads/))
- Windows 10 or higher

#### Option 1: Simple Installation (Recommended for most users)
1. Download the latest release from the [Releases page](https://github.com/yourusername/windows-whisper/releases)
2. Extract the ZIP file to your desired location
3. Create the `.env` file with your OpenAI API key (as shown above)
4. Double-click `Windows Whisper.exe` to start

#### Option 2: From Source (For developers)
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/windows-whisper.git
   cd windows-whisper
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run the application:
   ```bash
   python main.py
   ```

### 3. Using the Application

1. **Start Recording**
   - Press `Ctrl + Space` from anywhere
   - Or click the system tray icon and select "Start Recording"

2. **During Recording**
   - Speak clearly into your microphone
   - Watch the real-time waveform visualization
   - Press Space or click "Done" when finished
   - Click "×" or press Escape to cancel

3. **After Recording**
   - The text will be automatically transcribed
   - Transcribed text is copied to your clipboard
   - Click "Record Again" for another recording
   - Or close the window to finish

## Troubleshooting

### Common Issues

1. **API Key Issues**
   - Ensure your `.env` file is in the correct location
   - Check if the API key is valid
   - Verify you have sufficient OpenAI credits

2. **Audio Recording Issues**
   - Check if your microphone is set as the default recording device
   - Ensure no other application is using the microphone
   - Try restarting the application

3. **Transcription Language Issues**
   - By default, the app uses English ("en") for transcription
   - If you're getting transcriptions in the wrong language, add `WHISPER_LANGUAGE=en` to your `.env` file
   - For other languages, use the appropriate language code (e.g., "fr" for French, "de" for German)
   - If translations occur regardless of setting, try adding a more specific prompt in your `.env` file: `WHISPER_PROMPT="Transcribe exactly as spoken. Do not translate."`

4. **Application Won't Start**
   - Verify all dependencies are installed
   - Check if Python is in your system PATH
   - Run from command line to see error messages

### Error Messages

- `No module named 'xyz'`: Run `pip install -r requirements.txt` again
- `API key not found`: Check your `.env` file setup
- `PortAudio error`: Restart your computer or check audio devices

## Advanced Configuration

### Customizing Settings

Edit `config.py` or add to your `.env` file to modify:
- Default hotkey combination (`SHORTCUT_KEY`)
- Audio recording parameters (`SAMPLE_RATE`, `MAX_RECORDING_SECONDS`)
- Language settings (`WHISPER_LANGUAGE`)
- UI appearance settings (`UI_THEME`, `UI_OPACITY`)
- Temporary file locations

### System Requirements

Minimum:
- Windows 10 (64-bit)
- 4GB RAM
- Python 3.8+
- Microphone
- Internet connection

Recommended:
- Windows 10/11 (64-bit)
- 8GB RAM
- Python 3.10+
- High-quality microphone
- Stable internet connection

## Security Notes

1. **API Key Security**
   - Never share your API key
   - Don't commit the `.env` file to version control
   - Regularly rotate your API key
   - Set usage limits in OpenAI dashboard

2. **Data Privacy**
   - Audio is processed locally before sending to OpenAI
   - Only the audio data is sent, no personal information
   - Transcribed text is stored only in clipboard
   - No data is permanently stored

## Support and Updates

- Check the [GitHub repository](https://github.com/yourusername/windows-whisper) for updates
- Submit issues for bugs or feature requests
- Join our community discussions

## License and Credits

### License

This project is licensed under the MIT License - a permissive open source license that allows for:
- ✅ Commercial use
- ✅ Modification
- ✅ Distribution
- ✅ Private use

Key points of the MIT License:
- You can freely use, modify, and distribute this software
- You must include the original copyright notice and license
- The software comes with no warranties
- The authors are not liable for any damages

See the [LICENSE](LICENSE) file for the full license text.

### Credits and Acknowledgments

This project was developed with the assistance of:

- **AI Development Support**:
  - Cursor IDE's AI pair programming features
  - Anthropic's Claude (3.5/3.7 Sonnet) for code generation and problem-solving

- **Core Technologies**:
  - [OpenAI Whisper API](https://platform.openai.com/docs/guides/speech-to-text) - Speech-to-text engine
  - [PyQt5](https://www.riverbankcomputing.com/software/pyqt/) - UI framework
  - [PyAudio](https://people.csail.mit.edu/hubert/pyaudio/) - Audio recording
  - [NumPy](https://numpy.org/) - Audio processing
  - [python-dotenv](https://github.com/theskumar/python-dotenv) - Environment management

### Contributing

Contributions are welcome! Please feel free to submit issues or pull requests. When contributing, please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

All contributions will be released under the MIT License.

# Windows Whisper

![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

## Índice

- [Descripción](#descripción)
- [Características](#características)
- [Guía rápida](#guía-rápida)
- [Instalación](#instalación)
- [Uso](#uso)
- [Solución de problemas](#solución-de-problemas)
- [Configuración avanzada](#configuración-avanzada)
- [Notas de seguridad](#notas-de-seguridad)
- [Créditos](#créditos)
- [Licencia](#licencia)
- [Para desarrolladores](#para-desarrolladores)

## Description

Windows Whisper is a simple desktop application that provides instant voice-to-text transcription using OpenAI's Whisper API, optimized for developers using AI tools like Cursor, Warp, GitHub Copilot, and other AI assistants.

## Descripción

Windows Whisper es una aplicación de escritorio simple que proporciona transcripción instantánea de voz a texto utilizando la API Whisper de OpenAI, optimizada para desarrolladores que utilizan herramientas de IA como Cursor, Warp, GitHub Copilot y otros asistentes de IA.

## Características

- Transcripción en tiempo real
- Interfaz fácil de usar
- Soporte para múltiples idiomas
- Integración con herramientas de desarrollo

## Guía rápida

Comienza rápidamente con nuestra configuración predeterminada para obtener transcripciones de alta calidad con un mínimo esfuerzo.

## Instalación

1. Clona el repositorio.
2. Instala las dependencias usando `pip install -r requirements.txt`.
3. Ejecuta la aplicación con `python app.py`.

## Uso

1. Inicia la aplicación.
2. Selecciona tu idioma preferido.
3. Empieza a hablar y observa la transcripción en tiempo real.

## Solución de problemas

Si encuentras problemas, revisa nuestra sección de preguntas frecuentes o contacta al soporte técnico.

## Configuración avanzada

Para configuraciones avanzadas, edita el archivo `config.json` según tus necesidades.

## Notas de seguridad

Asegúrate de mantener tus credenciales API seguras y no compartidas públicamente.

## Créditos

Este proyecto fue inspirado por la comunidad de desarrolladores que utiliza OpenAI.

## Licencia

Este proyecto está licenciado bajo la Licencia MIT. Consulta el archivo LICENSE para más detalles.

## Para desarrolladores

Contribuye al desarrollo de esta herramienta mejorando su funcionalidad o reportando problemas en el repositorio GitHub.

