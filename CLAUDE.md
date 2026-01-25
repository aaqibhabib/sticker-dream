# CLAUDE.md - Sticker Dream

## Project Overview

**Sticker Dream** is a voice-activated sticker printer application that uses AI to create coloring page stickers. Users press and hold a button, speak a description, and the system generates a black-and-white coloring page that prints to a USB thermal printer.

**Author:** Wes Bos | **License:** MIT

### Core Workflow
1. User holds button and speaks (max 15 seconds)
2. Whisper (Hugging Face Transformers) transcribes voice to text in browser
3. Google Gemini Imagen AI generates a coloring page image
4. Image displays in browser and prints to connected USB thermal printer

## Tech Stack

- **Frontend:** TypeScript, Vite, vanilla DOM
- **Backend:** Node.js with Hono framework
- **AI Services:** Google Gemini API (Imagen 4.0), Hugging Face Transformers (Whisper)
- **Package Manager:** pnpm 9.10.0
- **Printing:** macOS CUPS (lpstat, lp commands)

## Commands

```bash
# Install dependencies
pnpm install

# Start backend server (port 3000) - auto-reloads on changes
pnpm server

# Start frontend dev server (port 7767) - proxies /api to backend
pnpm dev
```

**Note:** Run both `pnpm server` and `pnpm dev` simultaneously for development.

## Project Structure

```
sticker-dream/
├── src/
│   ├── client.ts      # Frontend: microphone, recording, transcription, UI state
│   ├── server.ts      # Backend: Hono server, Gemini API, image generation
│   ├── print.ts       # Printer utilities: CUPS commands, USB printer detection
│   ├── style.css      # Styling: pastel colors, Pixelify Sans font, animations
│   └── sounds/        # Audio feedback: press.mp3, loading.mp3, finished.wav
├── index.html         # PWA entry point, minimal DOM structure
├── manifest.json      # PWA manifest (standalone mode, portrait orientation)
├── vite.config.ts     # Vite config: port 7767, API proxy to :3000
├── tsconfig.json      # TypeScript: ESNext, strict mode
└── package.json       # Dependencies and scripts
```

## Key Components

### Frontend (`src/client.ts`)
- Uses Web Audio API's `MediaRecorder` for voice capture (WebM format)
- Initializes Whisper model on page load for speech-to-text
- Manages UI states: recording → transcribing → generating → printing
- Handles cancel keywords: "BLANK", "NO IMAGE", "CANCEL", "ABORT", "START OVER"
- Events: `pointerdown`/`pointerup` for touch and mouse support

### Backend (`src/server.ts`)
- Hono server on port 3000 with CORS enabled
- `POST /api/generate` - accepts `{ prompt }`, returns PNG image buffer
- Enhances prompts with coloring page context for Gemini
- Generates 9:16 aspect ratio images
- Background printer watcher auto-resumes paused printers

### Printer Module (`src/print.ts`)
- macOS CUPS only (uses lpstat, lp, cupsenable, cancel commands)
- Key functions:
  - `getAllPrinters()` / `getUSBPrinters()` - list available printers
  - `printToUSB(imageBuffer, options)` - print to first USB printer
  - `watchAndResumePrinters()` - background watcher (1s interval)
- Creates temp files for printing, auto-cleans up

## Environment Variables

Create a `.env` file in the project root:

```
GEMINI_API_KEY=your_google_gemini_api_key
```

## Code Conventions

### TypeScript
- Strict mode enabled, ESNext target
- Async/await throughout
- Named exports for utilities
- Type interfaces for printer options and data structures

### Error Handling
- Try-catch blocks with descriptive messages
- Console logs with emoji prefixes for debugging (🎨, ✅, ⚠️, 🚀)
- Graceful degradation: image displays even if printing fails

### UI/UX Patterns
- Progressive enhancement: checks permissions before showing UI
- Button text updates through workflow states
- 15-second auto-stop for recordings (safety limit)
- Touch-optimized with large tap targets (50px padding)

### Styling
- Pastel color palette: pink (#ffb3d9), green (#b4e7ce), blue (#c2e7ff), yellow (#fff5b8)
- Pixelify Sans font (Google Fonts) for pixelated aesthetic
- CSS animations: `.recording` (pulse), `.loading` (breathing)
- Mobile-first with safe area insets for notched devices

## Dependencies

| Package | Purpose |
|---------|---------|
| `@google/genai` | Google Gemini API client (Imagen) |
| `@huggingface/transformers` | Whisper speech-to-text (browser-side) |
| `hono` / `@hono/node-server` | Lightweight web framework |
| `vite` | Build tool and dev server |

**Unused:** `openai` package is installed but not currently used.

## Development Notes

### HTTPS Requirement
- Microphone access requires secure origin (HTTPS)
- Use Cloudflare Tunnels for remote/mobile access
- Local development works via localhost

### Browser APIs
- `MediaRecorder` (Web Audio API)
- `navigator.mediaDevices.getUserMedia()` (microphone access)
- Fetch API for backend communication

### Platform Limitations
- Printing only works on macOS (CUPS commands)
- USB thermal printers supported; Bluetooth untested
- iOS Safari doesn't support WebUSB/WebSerial

### PWA Support
- Installable as standalone app
- Portrait orientation locked
- Apple touch icons configured (192px, 512px)

## Vite Configuration

- Dev server port: 7767
- Network accessible (`host: true`)
- Allowed hosts: `local.wesbos.com`
- API proxy: `/api/*` → `http://localhost:3000`

## Testing Considerations

- No automated tests in codebase
- Manual testing requires:
  - Microphone access (browser permission)
  - USB thermal printer connected (for print testing)
  - Valid Gemini API key

## Common Tasks

### Add a new cancel keyword
Edit `src/client.ts`, find the cancel words array and add the new keyword (uppercase).

### Change image aspect ratio
Edit `src/server.ts`, modify the `aspectRatio` parameter in the Gemini API call.

### Adjust recording timeout
Edit `src/client.ts`, find the `setTimeout` with 15000ms and change the duration.

### Add new sound effect
1. Add audio file to `src/sounds/`
2. Create `Audio` element in `src/client.ts`
3. Call `.play()` at appropriate state transition
