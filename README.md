# Sticker Dream

**Live App: [aaqibhabib.github.io/sticker-dream](https://aaqibhabib.github.io/sticker-dream/)**

A voice and text-powered AI sticker generator that creates printable coloring pages. Describe what you want, and it generates a black-and-white coloring page sticker ready to print.

![](./dream.png)

## Features

### Two Ways to Create

- **Voice Input** - Hold the "Hold to Speak" button and describe your sticker. Uses Whisper AI for transcription.
- **Text Input** - Type directly or use iOS/Android native keyboard dictation for more accurate results.

### AI-Powered Generation

- Uses **Google Gemini Imagen 4.0** to generate coloring page style images
- Optimized prompts for clean black-and-white line art perfect for coloring
- Cancel keywords: say "CANCEL", "ABORT", "BLANK", or "START OVER" to cancel generation

### Print Options

- **Full Page Mode** - Prints image on a full 8.5" x 11" letter page
- **Sticker Sheet Mode** - Avery 22877 compatible (2" round labels, 12 per sheet)
  - Click individual cells to place stickers
  - "Fill All" and "Clear All" buttons for quick setup

### iOS Optimized

- Works as a standalone PWA (add to home screen)
- iOS-reliable printing using canvas pre-rendering
- Native keyboard dictation support for accurate speech-to-text
- Touch-optimized UI with large tap targets

### Privacy First

- **100% client-side** - No server required
- Your API key stays in your browser's localStorage
- All AI processing happens directly between your browser and Google's API

## Getting Started

### Use the Hosted Version

1. Visit **[aaqibhabib.github.io/sticker-dream](https://aaqibhabib.github.io/sticker-dream/)**
2. Get a free Google Gemini API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
3. Enter your API key when prompted
4. Start creating stickers!

### Run Locally

```bash
# Install dependencies
pnpm install

# Start development server (port 7767)
pnpm dev

# Build for production
pnpm build
```

## Tech Stack

- **Frontend**: TypeScript, Vite, vanilla DOM
- **AI Image Generation**: Google Gemini API (Imagen 4.0)
- **Speech-to-Text**: Hugging Face Transformers (Whisper) - runs in browser
- **Printing**: Native browser print dialog with canvas pre-rendering

## How It Works

1. **Input**: Speak or type a description of your sticker
2. **Transcribe** (voice only): Whisper AI converts speech to text in your browser
3. **Generate**: Google Gemini creates a coloring page based on your description
4. **Preview**: See your sticker with print mode options
5. **Print**: Use your browser's native print dialog to any connected printer

## Recommended Printers

While any printer works, thermal printers are great for quick, ink-free prints:

- **[Phomemo PM2](https://amzn.to/4hOmqki)** - Works great over Bluetooth or USB
- Any 4x6 thermal label printer for shipping labels
- Standard inkjet/laser printers work fine too

## Browser Support

- **iOS Safari** - Full support including PWA mode
- **Chrome/Edge** - Full support
- **Firefox** - Full support

Note: Microphone access requires HTTPS (localhost works for development).
