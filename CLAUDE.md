# CLAUDE.md - Sticker Dream

## Project Overview

**Sticker Dream** is a voice-activated sticker generator that uses AI to create coloring page stickers. Users press and hold a button, speak a description, and the system generates a black-and-white coloring page that can be printed via the native OS print dialog.

**This is a frontend-only application** - no backend server required. Users provide their own Google Gemini API key.

**Author:** Wes Bos | **License:** MIT

### Core Workflow
1. User enters their Gemini API key (stored in localStorage)
2. User holds button and speaks (max 15 seconds)
3. Whisper (Hugging Face Transformers) transcribes voice to text in browser
4. Google Gemini Imagen AI generates a coloring page image (browser-side)
5. Image displays with a "Print Sticker" button
6. User clicks print button to open native OS print dialog

## Tech Stack

- **Frontend:** TypeScript, Vite, vanilla DOM
- **AI Services:** Google Gemini API (Imagen 4.0), Hugging Face Transformers (Whisper)
- **Package Manager:** pnpm 9.10.0
- **Printing:** Native browser print dialog (`window.print()`)
- **Storage:** localStorage for API key persistence

## Commands

```bash
# Install dependencies
pnpm install

# Start development server (port 7767)
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## Project Structure

```
sticker-dream/
├── src/
│   ├── client.ts      # All app logic: API key mgmt, voice, transcription, image gen
│   ├── style.css      # Styling: pastel colors, API key UI, print styles
│   ├── server.ts      # (Legacy) Not used - kept for reference
│   ├── print.ts       # (Legacy) CUPS printer utilities - not used
│   └── sounds/        # Audio feedback: press.mp3, loading.mp3, finished.wav
├── index.html         # PWA entry point with API key setup UI
├── manifest.json      # PWA manifest (standalone mode, portrait orientation)
├── vite.config.ts     # Vite config: port 7767
├── tsconfig.json      # TypeScript: ESNext, strict mode
└── package.json       # Frontend-only dependencies
```

## Key Components

### Frontend (`src/client.ts`)
- **API Key Management**: Stores/retrieves Gemini API key from localStorage
- **Google Gemini Integration**: Direct browser-side calls to Imagen 4.0
- **Speech Recognition**: Uses Whisper via Hugging Face Transformers
- **UI State Management**: recording → transcribing → generating → ready to print
- **Cancel Keywords**: "BLANK", "NO IMAGE", "CANCEL", "ABORT", "START OVER"
- **Print**: Triggers `window.print()` for native OS print dialog

### Styling (`src/style.css`)
- API key setup form with retro styling
- Settings button to change API key
- Print styles hide all UI except the image

## API Key Setup

Users must provide their own Google Gemini API key:
1. Get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Enter the key in the setup screen
3. Key is stored in browser localStorage
4. Click "Change API Key" button to update

**Security Note**: API key is stored in browser localStorage. This is suitable for personal use but not for shared/public deployments.

## Code Conventions

### TypeScript
- Strict mode enabled, ESNext target
- Async/await throughout
- All AI calls happen client-side

### Error Handling
- Try-catch blocks with descriptive messages
- Console logs with emoji prefixes for debugging (🎨, ✅)
- User-friendly error alerts

### UI/UX Patterns
- Progressive disclosure: API key setup → main app
- Button text updates through workflow states
- 15-second auto-stop for recordings (safety limit)
- Touch-optimized with large tap targets

### Styling
- Pastel color palette: pink (#ffb3d9), green (#b4e7ce), blue (#c2e7ff), yellow (#fff5b8)
- Pixelify Sans font (Google Fonts)
- CSS animations: `.recording` (pulse), `.loading` (breathing)
- Print styles (`@media print`): hides UI, shows only the image

## Dependencies

| Package | Purpose |
|---------|---------|
| `@google/genai` | Google Gemini API client (browser-compatible) |
| `@huggingface/transformers` | Whisper speech-to-text (runs in browser) |
| `vite` | Build tool and dev server |

## Deployment

This is a static site that can be deployed anywhere:
- **GitHub Pages**: `pnpm build` then deploy `dist/`
- **Netlify/Vercel**: Connect repo, build command `pnpm build`
- **Any static host**: Upload contents of `dist/` folder

### HTTPS Requirement
- Microphone access requires secure origin (HTTPS)
- localhost works for development
- Production deployment must be HTTPS

## Browser APIs Used
- `MediaRecorder` (Web Audio API) - voice capture
- `navigator.mediaDevices.getUserMedia()` - microphone access
- `localStorage` - API key persistence
- `window.print()` - native print dialog

## Platform Support
- **Desktop**: Windows, macOS, Linux (any modern browser)
- **Mobile**: iOS Safari, Android Chrome
- **Printing**: Any printer accessible via OS print dialog

## Common Tasks

### Change the image model
Edit `src/client.ts`, find `imageGen4` constant and change to another model ID.

### Add a new cancel keyword
Edit `src/client.ts`, find the `abortWords` array and add the new keyword.

### Change image aspect ratio
Edit `src/client.ts`, modify `aspectRatio` in the `generateImageWithGemini` function.

### Adjust recording timeout
Edit `src/client.ts`, find the `setTimeout` with 15000ms and change the duration.

### Clear stored API key (for testing)
Open browser DevTools → Application → Local Storage → Delete `sticker-dream-gemini-api-key`
