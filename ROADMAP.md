# VideoMaker — Project Roadmap

> Automated video pipeline that produces AICodeKing-style educational videos using Remotion + TypeScript + Modular TTS.

---

## ✅ Phase 0: Foundation (Complete)
Blueprint phase — all specs, constraints, and architecture defined.

- [x] Define visual style (dark #0D1117, Cyan/Neon accents, glassmorphism)
- [x] Define animation spec (spring stiffness/damping values)
- [x] Define component architecture (Schema, CodeWindow, Orchestrator)
- [x] Define automation pipeline (LLM → TTS → Remotion)
- [x] Document requirements (Node 18+, FFmpeg, Shiki, Zod — see [README.md](README.md))

---

## ✅ Phase 1: Project Initialization (Complete)
Bootstrap the Remotion project and install all dependencies.

- [x] Initialize: `npx create-video@latest my-video-engine` (Blank + TypeScript)
- [x] Install core libs: `npm install` in `my-video-engine/` (Remotion, Shiki, Zod, pipeline clients); `lucide-react` was removed later as unused (Phase 5.5)
- [x] Verify dev studio starts: `npm start` → Remotion Studio (typically `localhost:3000`)

---

## ✅ Phase 2: Core Components (Complete)

### Schema
- [x] `src/Schema.ts` — Zod/TypeScript types for `VideoData`:
  - `audioUrl`: string
  - `transcript`: `{ word, startTime, endTime }[]` (seconds)
  - `codeSnippets`: `{ language, code, startTime, endTime, title? }[]`
  - `scenes`: discriminated union — `title` (heading, subheading?) | `code` (snippetIndex) | `split` (snippetIndex, bullets)

### CodeWindow
- [x] `src/components/CodeWindow.tsx` — Shiki-powered terminal
  - Frame-by-frame character "typing" animation
  - Language support (Java, TS/JS, Python, etc.)
  - Glassmorphism terminal chrome (traffic lights, blur backdrop)
  - Spring pop-in: `stiffness: 200, damping: 15`
  - `delayRender` / `continueRender` so Shiki is ready before frames capture

### Camera
- [x] `src/components/Camera.tsx` — Wrapper component
  - Subtle zoom via spring
  - Shaky-cam effects via sine waves
  - Smooth settle with spring

### Subtitles
- [x] `src/components/Subtitles.tsx` — Word-level subtitle renderer
  - Current word highlighted (cyan)
  - Upcoming words dimmed (not full white); during gaps, last spoken word stays visible dimmed
  - Driven by word timestamps (pipeline rebuilds transcript from ElevenLabs alignment when audio is generated)

### Orchestrator
- [x] `src/Orchestrator.tsx` — Timeline sequencer
  - Maps JSON `scenes[]` → Remotion `<Sequence>` blocks
  - Manages camera, subtitles, code windows in sync
  - Stable React keys and console warnings for bad `snippetIndex` values

### Main Composition
- [x] `src/index.tsx` — Register root + compositions
  - **`Main`**: 1080×1920 (9:16 Shorts) at 30fps (primary)
  - **`MainWide`**: 1920×1080 (16:9)

---

## ✅ Phase 3: Visual Polish (Complete)

- [x] Global dark theme (`#0D1117` background)
- [x] Neon accent palette (Cyan `#00FFFF`, Neon Green `#39FF14`)
- [x] Glassmorphism overlays (`backdrop-filter: blur`, semi-transparent panels)
- [x] Typography: JetBrains Mono for code, Inter for UI text
- [x] Animated grid background (subtle grid lines)

---

## ✅ Phase 4: Automation Pipeline (Complete)

- [x] `pipeline/generate.ts` — Orchestration script:
  1. Accepts a raw educational topic as CLI arg (`--dry-run` skips ElevenLabs + render)
  2. Calls LLM with priority **Groq** → **Gemini** → **OpenAI**; validates JSON with `VideoDataSchema`; falls back to `sample_data/demo.json` if no key
  3. Calls TTS provider (priority **Google Cloud TTS** → **ElevenLabs**) → MP3 under `output/`; copies to `public/`; sets `audioUrl` to `/${filename}`; rebuilds `transcript` from timing data
  4. Writes props JSON to `output/props_*` and runs `npx remotion render src/index.tsx Main <out.mp4> --props=...` via `spawnSync` with error checking
- [x] `.env.example` — `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `GOOGLE_CLOUD_API_KEY` (recommended), `ELEVENLABS_API_KEY` (fallback), optional voice IDs (see repo root)
- [x] `sample_data/demo.json` — Example JSON for testing without API calls

---

## ✅ Phase 5: Verification & Demo (Complete)

- [x] Run Remotion Studio and verify all components render correctly
- [x] Render a sample video with `demo.json` (no API keys needed)
- [x] Confirm 9:16 export at 30fps
- [x] Update README with final usage guide
- [x] TypeScript compilation validation passes (`npm run typecheck`)

---

## ✅ Phase 5.5: Post-Audit Improvements (Complete — May 4, 2026)

Following the code audit report (May 3, 2026), critical bugs and improvements were addressed:

- [x] **Critical bug fixes**: Audio path for Remotion bundler (`public/` + URL path; no `staticFile()` from Node); ElevenLabs transcript word grouping (incl. last word / trailing space); subtitle gap and “future word” brightness behavior
- [x] **Dependency cleanup**: Removed unused `lucide-react`; corrected npm script paths (e.g. `render:demo` props, `src/index.tsx`)
- [x] **Gemini model**: `gemini-1.5-flash` → `gemini-2.5-flash`
- [x] **Groq**: OpenAI-compatible client, `llama-3.3-70b-versatile`
- [x] **Dry-run mode**: Script generation only; no TTS API calls
- [x] **Schema / TS**: Validated pipeline output; `useVideoConfig()` for fps in Orchestrator

**Hygiene:** `zod` is pinned to **4.3.6** in `my-video-engine/package.json` to match Remotion (see CHANGELOG).

**Completed (May 6, 2026):**
- [x] Wired up `.env` API keys (Gemini + Groq + ElevenLabs)
- [x] First full end-to-end run with real keys — **SUCCESS!** Created "Java HashMap explained" 30-second educational Short with ElevenLabs (Bella voice) and synchronized subtitles

---

## 🚀 Phase 6: Future Enhancements (In Progress)

### Completed
- [x] **Chapter markers / progress bar** — `ChapterProgress.tsx`: segment ticks + labels from `scenes`, fill driven by frame; `showProgressBar?: boolean` on `VideoData` (default on)
- [x] **Modular TTS Provider Architecture** — `pipeline/tts/`: abstract `TTSProvider` interface, Google Cloud TTS (primary) + ElevenLabs (fallback) implementations
- [x] **Temporal Validation** — `src/validation/temporalValidation.ts`: post-parse invariant checker for timing constraints (scene overlaps, word timing consistency)
- [x] **Automated Integration Tests** — Jest + ts-jest framework: schema validation, timing checks, TTS provider factory tests (30 tests, CI-friendly)
- [x] **Audio Cleanup** — Automatic cleanup of old MP3 files from `public/` (keeps 10 most recent, removes files > 24 hours old)
- [x] **Comprehensive Documentation** — `TROUBLESHOOTING.md`: common issues, setup verification, component behavior notes

### Pending
- [ ] Multi-language support (Spanish, Portuguese audio via Google Cloud TTS or ElevenLabs)
- [ ] B-roll overlay system (screen recordings, diagrams)
- [ ] YouTube auto-upload integration (YouTube Data API v3)
- [ ] Template system: choose between "CodeKing", "Tutorial", "Explainer" styles
- [ ] Web UI for topic submission and render queue management

---

## Tech Stack Summary

| Layer | Technology |
|------|------------|
| Video Engine | [Remotion](https://remotion.dev/) |
| Language | TypeScript |
| Syntax Highlighting | [Shiki](https://shiki.style/) |
| Schema | [Zod](https://zod.dev/) |
| Voiceover | [Google Cloud TTS](https://cloud.google.com/text-to-speech) (primary) / [ElevenLabs](https://elevenlabs.io/) (fallback) |
| Script generation | Groq / Gemini / OpenAI |
| Runtime | Node.js 18+ (22+ recommended) |
| Video codec | FFmpeg |

---

*Last updated: 2026-05-06 — Phase 6: temporal validation, automated tests, audio cleanup, and comprehensive docs complete*
