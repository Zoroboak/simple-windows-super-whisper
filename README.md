# Simple Windows Super Whisper

A simple desktop application that provides instant voice-to-text transcription using OpenAI's Whisper API, specifically enhanced for developers working with AI tools like Cursor, Warp, GitHub Copilot, and other AI assistants.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Quick Start Guide](#quick-start-guide)
- [Installation](#installation)
- [Usage](#usage)
- [Troubleshooting](#troubleshooting)
- [Advanced Configuration](#advanced-configuration)
- [Security Notes](#security-notes)
- [Credits](#credits)
- [License](#license)

## Overview

Simple Windows Super Whisper is built to provide seamless, real-time transcription services directly on your Windows desktop. Ideal for developers and professionals seeking efficiency, this tool ensures swift voice-to-text conversion utilizing state-of-the-art AI technology.

## Features

- 🎤 One-click voice recording using `Ctrl + Space`
- 📝 Real-time visualization of waveform
- ⚡ Instantaneous transcription with clipboard copying
- 🔑 Global hotkey support for seamless operation
- 🎨 Sleek and modern design

## Quick Start Guide

### 1. Get OpenAI API Key

1. Sign up or log in on [OpenAI](https://platform.openai.com/signup).
2. Navigate to the [API Keys](https://platform.openai.com/api-keys) section.
3. Generate and copy your new secret API key.
4. Securely store your API key by adding it to a `.env` file in the app directory:

   ```
   OPENAI_API_KEY=your_api_key_here
   ```

### 2. Installation

#### Prerequisites

- Python 3.8+
- Windows 10+

#### Simple Installation

1. Download the release from [Releases](https://github.com/yourusername/windows-whisper/releases).
2. Extract to your desired location.
3. Add your API key to `.env` as described.
4. Run `Windows Whisper.exe`.

#### Developer Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/windows-whisper.git
   cd windows-whisper
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Launch via:
   ```bash
   python main.py
   ```

## Usage

1. **Start Recording**
   - Press `Ctrl + Space` or use the tray icon.

2. **During Recording**
   - Ensure clear enunciation.

3. **Post Recording**
   - Automatically copies text to clipboard.

## Troubleshooting

- **API Key Errors**: Validate your API deployment in `.env`.
- **Recording Issues**: Ensure mic accessibility.

## Advanced Configuration

Modify settings through `config.py` or `.env`.

## Security Notes

- Keep API keys confidential.
- Rotate keys regularly.

## Credits

Developed with Cursor IDE and Anthropic's Claude support.

## License

Openly available under the MIT License.

---

# Simple Windows Super Whisper

Una aplicación de escritorio sencilla que proporciona transcripción instantánea de voz a texto utilizando la API Whisper de OpenAI, específicamente mejorada para desarrolladores que trabajan con herramientas de IA como Cursor, Warp, GitHub Copilot y otros asistentes de IA.

## Índice

- [Visión General](#visión-general)
- [Características](#características)
- [Guía Rápida](#guía-rápida)
- [Instalación](#instalación)
- [Uso](#uso)
- [Solución de Problemas](#solución-de-problemas)
- [Configuración Avanzada](#configuración-avanzada)
- [Notas de Seguridad](#notas-de-seguridad)
- [Créditos](#créditos)
- [Licencia](#licencia)

## Visión General

Simple Windows Super Whisper está diseñado para proporcionar servicios de transcripción en tiempo real directamente en tu escritorio de Windows. Ideal para desarrolladores y profesionales que buscan eficiencia, esta herramienta asegura una rápida conversión de voz a texto utilizando tecnología de IA de última generación.

## Características

- 🎤 Grabación de voz con un clic usando `Ctrl + Espacio`
- 📝 Visualización en tiempo real de la forma de onda
- ⚡ Transcripción instantánea con copia al portapapeles
- 🔑 Soporte de teclas de acceso rápido para una operación sin problemas
- 🎨 Diseño moderno y elegante

## Guía Rápida

### 1. Obtener clave API de OpenAI

1. Regístrate o inicia sesión en [OpenAI](https://platform.openai.com/signup).
2. Ve a la sección de [Claves API](https://platform.openai.com/api-keys).
3. Genera y copia tu nueva clave API secreta.
4. Guarda tu clave API en un archivo `.env` en el directorio de la aplicación:

   ```
   OPENAI_API_KEY=your_api_key_here
   ```

### 2. Instalación

#### Requisitos Previos

- Python 3.8+
- Windows 10+

#### Instalación Sencilla

1. Descarga la versión desde [Releases](https://github.com/yourusername/windows-whisper/releases).
2. Extrae en tu ubicación deseada.
3. Añade tu clave API al `.env` como se describe.
4. Ejecuta `Windows Whisper.exe`.

#### Instalación para Desarrolladores

1. Clona el repositorio:
   ```bash
   git clone https://github.com/yourusername/windows-whisper.git
   cd windows-whisper
   ```
2. Instala dependencias:
   ```bash
   pip install -r requirements.txt
   ```
3. Inicia con:
   ```bash
   python main.py
   ```

## Uso

1. **Iniciar Grabación**
   - Presiona `Ctrl + Espacio` o utiliza el ícono de bandeja.

2. **Durante la Grabación**
   - Asegúrate de una pronunciación clara.

3. **Después de la Grabación**
   - Copia automáticamente el texto al portapapeles.

## Solución de Problemas

- **Errores de Clave API**: Valida el despliegue de tu API en `.env`.
- **Problemas de Grabación**: Asegura la accesibilidad del micrófono.

## Configuración Avanzada

Modifica configuraciones a través de `config.py` o `.env`.

## Notas de Seguridad

- Mantén las claves API confidenciales.
- Rota tus claves regularmente.

## Créditos

Desarrollado con el soporte de Cursor IDE y Claude de Anthropic.

## Licencia

Disponible abiertamente bajo la Licencia MIT.
