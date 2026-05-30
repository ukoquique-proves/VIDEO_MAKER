# VideoMaker

Remotion (TypeScript) app that renders short, high-density "code explainer" videos: Shiki-highlighted code, word-level subtitles, dark `#0D1117` layout, optional LLM script + TTS voice. Implementation details and bugfix history live in [CHANGELOG.md](CHANGELOG.md).

## Repository layout

- **`my-video-engine/`** — Remotion project (`src/`, `pipeline/`, `sample_data/`)
- **`.env.example`** — API keys for the automation pipeline (copy to **`.env`** at the **repository root**; `pipeline/generate.ts` loads it from there or from `my-video-engine/`)

## Prerequisites

- **Node.js** 18 or newer (22+ recommended)
- **FFmpeg** (required for `remotion render`), e.g. `sudo apt update && sudo apt install ffmpeg`
- **System dependencies** (for headless render): `libgl1-mesa-dev`, `libxi-dev`, `libxext-dev`

## Verify your setup (smoke test)

After Node and FFmpeg are in place, from the **repository root**:

```bash
npm install --legacy-peer-deps --prefix my-video-engine
npm run typecheck
npm test              # Run automated integration tests
npm run render:demo   # Render demo video (no API keys required)
```

### Automated Integration Tests

```bash
npm test              # Run all tests once
npm run test:watch    # Run tests in watch mode
```

Tests validate:
- **Schema compliance**: VideoData JSON structure
- **Timing consistency**: Scene timestamps, transcript word timing
- **TTS provider factory**: Provider selection priority

### Manual verification

A successful render writes **`output/videos/<topic_slug>.mp4`**. Open it to confirm video encodes end-to-end; you should see the **bottom chapter/progress bar** (ticks at scene starts, labels, fill advancing with time). To scrub interactively, use **`npm start`** (Remotion Studio) and the **Main** composition.

## Quick start (this repo)

```bash
npm install --legacy-peer-deps --prefix my-video-engine
npm start
```

Opens Remotion Studio (default port from Remotion CLI, often `http://localhost:3000`).

### Useful scripts

You can run these from the **repository root** (they proxy to `my-video-engine/`):

| Script | Purpose |
|--------|--------|
| `npm start` | Remotion Studio — `src/index.tsx` |
| `npm run build` | Render `Main` → `output/MyVideo.mp4` |
| `npm run render:demo` | Render with `sample_data/demo.json` → `output/demo.mp4` (no API keys) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run pipeline -- "<topic>"` | Full pipeline: LLM → TTS → MP4 |
| `npm run pipeline -- "<topic>" --dry-run` | Script JSON only; skips TTS and render |

Render entry file is always **`src/index.tsx`** (not `.ts`). Compositions: **`Main`** (1920×1080) and **`MainVertical`** (1080×1920), 30 fps.

## Automation pipeline

`my-video-engine/pipeline/generate.ts`:

1. **LLM** — Builds JSON validated against `src/Schema.ts`. Provider order: **Gemini** (`GEMINI_API_KEY`, `gemini-2.5-flash`) → **Groq** (`GROQ_API_KEY`, model `llama-3.3-70b-versatile`) → **OpenAI** (`OPENAI_API_KEY`, `gpt-4o-mini`). If none are set, it falls back to `sample_data/demo.json`.
2. **TTS (Text-to-Speech)** — Modular provider architecture with automatic fallback. Provider priority: **Edge-TTS** (free, no API key, requires `pip install edge-tts`) → **Google Cloud TTS** → **Azure Cognitive Services** → **Amazon Polly** → **ElevenLabs**. Transcript words/times are **rebuilt from real TTS timing data** (not the LLM's draft). If no provider is available, audio is skipped (silent render).
   - **Edge-TTS**: Free, unlimited, no API key. Requires Python 3.8+ and `pip install edge-tts`. Voice configurable via `EDGE_TTS_VOICE` (default: `es-AR-TomasNeural`).
   - **Google Cloud TTS**: 4 million characters/month free. Set `GOOGLE_CLOUD_API_KEY` and optional `GOOGLE_CLOUD_VOICE_NAME` (default: `en-US-Standard-C`).
   - **Azure Cognitive Services Speech**: 500,000 characters/month free. Set `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`.
   - **Amazon Polly**: 5 million characters/month free for 12 months. Set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.
   - **ElevenLabs**: Set `ELEVENLABS_API_KEY` and optional `ELEVENLABS_VOICE_ID`. Precise word timestamps require a paid plan.
3. **Render** — Writes props to `output/props/`, video to `output/videos/`, copies MP3 to `public/`, sets `audioUrl` to `/${filename}` for the bundler. Auto-cleans old files: keeps 3 most recent props and 2 most recent videos per topic.

`--dry-run` validates the script only and writes props JSON; it does not call TTS APIs or Remotion render.

## Architecture (high level)

| Area | Role |
|------|------|
| `src/Schema.ts` | Zod schema: `audioUrl`, word `transcript`, `codeSnippets`, `scenes` (`title` \| `code` \| `split` \| `image`) |
| `src/Orchestrator.tsx` | Maps `scenes` to `<Sequence>`; global subtitles |
| `src/components/CodeWindow.tsx` | Shiki + `delayRender` / `continueRender`; typing animation |
| `src/components/Subtitles.tsx` | Current word highlighted; upcoming words dimmed; gaps keep last word dimmed |
| `src/components/Camera.tsx` | Spring zoom / shake wrapper |
| `src/components/ChapterProgress.tsx` | Bottom timeline: chapter ticks + labels from `scenes`; disable with `showProgressBar: false` on props |

For motion and subtitle UX nuance aimed at agents, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md#component-behavior-notes-for-developers).

## Dependencies note

`package.json` includes **Remotion**, **Shiki**, **Zod**, optional AI/TTS clients — **not** `lucide-react` (removed as unused; see CHANGELOG).

## Further reading

- [CHANGELOG.md](CHANGELOG.md) — fixes, behavior changes, audit notes  
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — common issues, fixes, component behavior notes
- [ROADMAP.md](ROADMAP.md) — phased scope (may lag the live code slightly)
