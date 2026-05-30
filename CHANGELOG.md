# Changelog

All notable changes to the VideoMaker project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Video Cutoff Logic**: Improved `durationSeconds` auto-correction to ensure it covers both the final audio word and the last scene's end time. This prevents the video from ending prematurely if scenes are longer than the narration.
- **Natural Pacing**: Refactored the TTS pipeline to group narration by scenes and insert natural pauses between them. This improves the listener's experience by providing breathing room between different topics.
- **ElevenLabs Plan Compatibility**: Updated the `ElevenLabsTTSProvider` to automatically handle library voice restrictions on free accounts by switching to standard pre-made voices.
- **Edge-TTS Reliability**: Enhanced the `EdgeTTSProvider` to support natural pauses and deterministic timing estimation.

### Fixed (First Video Production — May 6-7, 2026)
- **First video successfully created:** "Java HashMap explained" — 30-second educational Short with ElevenLabs (Bella voice) audio and synchronized subtitles
- **File Organization Refactor** — Reorganized output directory structure
  - `output/videos/` — MP4 files (auto-cleanup keeps 2 most recent per topic)
  - `output/props/` — JSON props files (auto-cleanup keeps 3 most recent per topic)
  - Intermediate audio files now deleted from `output/` after copying to `public/`
  - All outputs use `${SLUG}_${TIMESTAMP}` naming for traceability
  - Old files archived to `output/_TEMP_ARCHIVE_YYYYMMDD/` before migration
- **Dynamic Video Duration** — Fixed videos being cut off when content exceeds 30 seconds
  - Changed prompt: "30 to 60 seconds" instead of exactly 30s
  - `pipeline/generate.ts`: Auto-corrects `durationSeconds` from actual TTS transcript end time (+1s padding)
  - `src/index.tsx`: Added `calculateMetadata` to Remotion compositions for dynamic `durationInFrames`
  - Video now renders full length matching actual audio (tested: 53s video with 51s audio)
- `pipeline/tts/ElevenLabsTTSProvider.ts`: Added fallback for free tier users — when `convertWithTimestamps` returns 402 error, automatically falls back to standard `convert` endpoint with estimated word timing (150ms/word)
- `pipeline/tts/ElevenLabsTTSProvider.ts`: Fixed Uint8Array to Buffer conversion in audio stream handling
- `src/Orchestrator.tsx`: Added `staticFile()` import and usage for proper Remotion audio file resolution from `public/` directory
- `pipeline/generate.ts`: Changed LLM priority to Gemini > Groq > OpenAI for more reliable JSON output (Gemini has native JSON mode)
- `my-video-engine/package.json`: Added missing `react` and `react-dom` dependencies (required by Remotion but not previously listed)
- System dependencies: Installed `libgl1-mesa-dev`, `libxi-dev`, `libxext-dev` for Remotion/Chromium headless rendering

### Fixed (Audit Report May 3, 2026)
- `src/components/CodeWindow.tsx`: Fixed singleton highlighter stuck state during HMR — now clears `highlighterPromise` on error so Remotion Studio can retry after hot reload
- `src/components/CodeWindow.tsx`: Fixed typing animation char counter bug — now advances only by `slice.length` (actual rendered chars) instead of full `token.content.length`, preventing tokens from being skipped prematurely during multi-char token sequences
- `src/components/CodeWindow.tsx`: Fixed potential Remotion render hang by adding cleanup for `delayRender` handle when component unmounts or props change mid-flight
- `src/Orchestrator.tsx`: Added console.warn for out-of-bounds snippetIndex in code/split scenes — helps debug JSON authoring mistakes that previously caused silent blank scenes
- `src/Orchestrator.tsx`: Fixed React reconciliation bugs by replacing unstable array index `key={i}` with stable key `${scene.type}-${scene.startTime}` for proper scene reordering/remounting in Remotion Studio
- `pipeline/generate.ts`: Added markdown fence stripping to LLM JSON parsing — prevents SyntaxError when Gemini/GPT wrap JSON in ```json ... ``` fences despite the prompt
- `pipeline/generate.ts`: Fixed `staticFile()` misuse — removed from Node pipeline context (it's a browser-only API) and replaced with plain relative path `/${audioFilename}` for correct URL resolution
- `pipeline/generate.ts`: Fixed last transcript word being silently dropped when text ends with trailing space - rewrote character-to-word grouping logic to handle end-of-string independently
- `package.json`: Removed unused `lucide-react` dependency to reduce bundle size
- `package.json`: Corrected `render:demo` --props path from `../sample_data/demo.json` to `sample_data/demo.json`
- `src/components/Subtitles.tsx`: Fixed future words appearing at full brightness — now dimmed to 25% opacity instead of showing as white/inactive
- `src/components/Subtitles.tsx`: Fixed subtitles flashing off during inter-word gaps by tracking last spoken word and showing it dimmed during gaps
- `src/index.tsx`: Fixed `durationSeconds` truthy-check edge case — now uses explicit null check and positive value validation instead of falsy check that incorrectly skipped `durationSeconds: 0`
- `pipeline/tsconfig.json`: Fixed exclude path from `../../node_modules` to `../node_modules`

### Changed
- **Orientation Update**: Changed the default video orientation to horizontal (1920x1080) for better desktop viewing.
  - `src/index.tsx`: Swapped `Main` composition to 1920x1080 and renamed the 1080x1920 composition to `MainVertical`.
  - `README.md`: Updated documentation to reflect the new default orientation and composition names.
- `pipeline/generate.ts`: Refactored topic-specific facts into a dedicated `topics/` directory with deterministic loading order (alphabetical sorting).
- `pipeline/generate.ts`: Enhanced `TIMESTAMP` format to `${Date.now()}_${uuid}` for combined chronological sortability and absolute uniqueness.
- `pipeline/generate.ts`: Optimized `cleanupOldAudioFiles` to skip execution during dry runs, avoiding unnecessary directory scans.
- `pipeline/generate.ts`: Added documentation clarifying that `durationSeconds` correction in dry-run mode uses unverified LLM draft timestamps.
- `README.md` & `TROUBLESHOOTING.md`: Synchronized documentation to reflect the actual LLM provider priority (Gemini → Groq → OpenAI).
- `pipeline/generate.ts`: Made .env path resolution robust — now works whether running from `my-video-engine/` or project root
- `pipeline/generate.ts`: Added safety check for ElevenLabs `response.alignment` field — throws clear error if model doesn't support timestamps
- `pipeline/generate.ts`: ElevenLabs voice ID now configurable via `ELEVENLABS_VOICE_ID` env variable (defaults to Rachel: `21m00Tcm4TlvDq8ikWAM`) instead of hard-coded value
- `pipeline/generate.ts`: Updated Gemini model from `gemini-1.5-flash` to `gemini-2.5-flash` for improved script generation quality
- `pipeline/generate.ts`: Replaced `execSync` with `spawnSync` for video rendering — eliminates shell string interpolation risk, uses array-based args for safer command execution
- `pipeline/generate.ts`: Added error checking for `spawnSync` render result — now throws with exit code if Remotion render fails instead of printing false "Done!" message
- `pipeline/generate.ts`: Added `cleanupOldAudioFiles()` to prevent `public/` directory from filling with accumulated MP3 files — removes files older than 24 hours while keeping 10 most recent
- `pipeline/generate.ts`: Replaced raw `fetch()` call with official `@elevenlabs/elevenlabs-js` SDK for better TypeScript support and error handling

### Added
- **Prompt Enrichment System** — `pipeline/generate.ts`: `buildSystemPrompt()` function injects topic-specific facts based on keywords
  - Detects keywords (puppy linux, hashmap, etc.) and injects accurate technical details
  - Puppy Linux facts: ~300MB size, 256MB minimum RAM, Puppy Linux 9.x, AI-assisted IDEs (VS Code, Cursor, Copilot, Codeium), specific bash commands
  - HashMap facts: O(1) complexity, bucket structure, thread-safety notes
  - Forces specific numbers and tool names instead of vague language
  - Requires real bash commands users would actually run
- **Temporal Validation** — Post-parse invariant checker for VideoData timestamps
  - `src/validation/temporalValidation.ts`: Validates timing constraints Zod schema doesn't cover
  - Checks: `startTime < endTime` for all elements, no scene overlaps, no transcript word overlaps
  - Validates `snippetIndex` bounds for code/split scenes
  - Warns on: large gaps between scenes, `durationSeconds` mismatches
  - Integrated into `pipeline/generate.ts` — pipeline exits with error if LLM generates invalid timestamps
  - 14 test cases covering all validation scenarios
- **Automated Integration Tests** — Jest + ts-jest test framework
  - `npm test` runs schema validation, timing consistency checks, TTS provider factory tests
  - `src/__tests__/schema.test.ts`: Validates demo.json against VideoDataSchema, checks transcript word timing, scene chronological order, duration consistency
  - `pipeline/tts/__tests__/TTSProvider.test.ts`: Tests provider factory priority (Google Cloud > ElevenLabs)
  - Tests run in CI-friendly mode (no API keys required)
  - Updated Requirements.md with testing documentation
  - Added TROUBLESHOOTING.md section for test failures
- **Phase 6:** `ChapterProgress` — bottom progress bar with cyan ticks at each scene start and short chapter labels (title heading or snippet title / “Recap”). Optional `showProgressBar: false` on `VideoData` to hide. Helpers `getDurationSeconds` / `getTimelineDurationSeconds` / `chapterLabel` in `Schema.ts`; `index.tsx` duration calculation uses `getDurationSeconds`.
- **Modular TTS Provider Architecture**: Decoupled audio generation with 4 provider implementations
  - `pipeline/tts/TTSProvider.ts`: Abstract `TTSProvider` interface with `synthesize()` method returning audio + word-level timestamps
  - `pipeline/tts/GoogleCloudTTSProvider.ts`: Google Cloud TTS implementation (free tier: 4M chars/month) with SSML mark-based timing
  - `pipeline/tts/AzureTTSProvider.ts`: Azure Cognitive Services Speech (free tier: 500K chars/month) with neural voices (Jenny, Elvira, etc.)
  - `pipeline/tts/AmazonPollyTTSProvider.ts`: AWS Polly (free tier: 5M chars/month for 12 months) with neural + standard voices
  - `pipeline/tts/ElevenLabsTTSProvider.ts`: ElevenLabs implementation using official SDK (fallback only)
  - Factory function `createTTSProvider()` selects provider based on available API keys:
    1. Google Cloud TTS → 2. Azure Speech → 3. Amazon Polly → 4. ElevenLabs (fallback)
  - Updated `pipeline/generate.ts` to use provider abstraction instead of direct ElevenLabs integration
  - Environment variables for all providers documented in `.env.example`
- `src/components/ChapterProgress.tsx`: Fixed chapter label overlap issue — now shows only the active scene label (bright, 95% opacity) instead of all labels at once, preventing collisions on short scenes
- `src/components/ChapterProgress.tsx`: Fixed progress bar overlapping subtitles by moving from bottom: 14px to bottom: 0px, giving more clearance for subtitle area at bottom: 80px
- `pipeline/generate.ts`: Added `--dry-run` mode to test LLM script generation without spending ElevenLabs credits. Usage: `npm run pipeline "<topic>" -- --dry-run`
- Pre-improvement verification: Confirmed all core project is ready to start Phase 6 (Future Enhancements). Verified:
  - ✅ All Phases 0‑5 marked as complete in `ROADMAP.md`
  - ✅ No blocking pre-requisite steps missing from documentation
  - ✅ TypeScript compilation passes (`npm run typecheck`)
  - ✅ All dependencies installed
  - ✅ Documentation consistent (`README.md`, `Requirements.md`, `considerations.md`)
- `Orchestrator.tsx`: Added missing `useVideoConfig()` import

### Fixed
- `Subtitles.tsx`: Added early return when `activeIndex === -1` (between words or during silence). Previously, `Math.max(0, -1 - 3)` resolved to `windowStart = 0`, causing the first 7 words to render persistently during code scenes and silent gaps.
- `CodeWindow.tsx`: Replaced `useEffect` + async Shiki loading with Remotion's `delayRender`/`continueRender` pattern. The renderer now waits for the Shiki `Promise` to resolve before capturing any frames, eliminating un-highlighted plain text on the first render pass.
- `CodeWindow.tsx`: Fixed typing animation cursor drift caused by computing `visibleChars` from the raw `code` string length while `renderTokens` walked HTML-decoded token content. `visibleChars` is now derived from the decoded token list length, keeping the cursor aligned when Java generics, comparison operators, or other HTML-entity characters appear in the code.
- `pipeline/generate.ts`: ElevenLabs character-level alignment data is now used to rebuild the transcript with real word timestamps, replacing the LLM's hallucinated ones before props are written to disk.
- `pipeline/generate.ts`: Added `dotenv.config()` at startup so `.env` API keys are loaded automatically without requiring manual `export` in the shell.
- `pipeline/generate.ts`: Audio is copied into `public/` and `audioUrl` is set to a bundler-friendly path (e.g. `/${filename}`); raw filesystem paths had been 404ing in the bundle (later refined: no `staticFile()` from Node — see audit fixes above).
- `Orchestrator.tsx`: Removed hardcoded `const FPS = 30`, replaced with `fps` from `useVideoConfig()` to respect the composition's actual frame rate.
- `CodeWindow.tsx`: Cursor `animation: none` replaced with a `blink 1s step-start infinite` keyframe animation, injected into the document head on first render.

### Added
- **Free High-Quality TTS**: Integrated **`edge-tts`** as a primary free provider. This allows generating unlimited high-quality neural voiceovers without requiring an API key or incurring costs.
- **Image Scene Support**: Added a new `image` scene type to the video engine.
  - `src/Schema.ts`: Updated Zod schema to include image scenes.
  - `src/components/SceneComponents.tsx`: Created `ImageCard` with spring animations and "rústico-técnico" styling.
- **New Topic: Permaculture Project for Pedro**: Added a new topic file `permacultura_pedro.json` in `my-video-engine/pipeline/topics/` containing specific facts about the project in Lavalleja/Cerro Largo.
- **Root Workspace Support**: Added a root `package.json` to proxy common commands (`start`, `build`, `pipeline`, `test`) to the `my-video-engine` directory.
- **Support for Longer Videos**: Increased the maximum allowed duration in the LLM system prompt from 60 seconds to 180 seconds (3 minutes) and removed the hard limit of 3-4 scenes to accommodate more complex projects.
- Created `ROADMAP.md` defining project phases and overall scope.
- Bootstrapped Remotion project `my-video-engine` with React 18 and TypeScript.
- Configured dependencies: `remotion`, `shiki` (syntax highlighting), and `zod` (`lucide-react` was added initially then removed as unused — see Fixed entries above).
- Defined `Schema.ts` containing expected JSON video data schema representing the timeline logic, word-level timestamps, and code snippets.
- Implemented `<Camera />` component featuring spring-based slight zooms and multi-frequency sine wave shakiness for emphasis.
- Implemented `<CodeWindow />` component powered by Shiki with frame-based character-typing animation matching exact audio synchronization.
- Implemented `<Subtitles />` with word-level timing: active word emphasized (e.g. cyan); upcoming words dimmed; gaps keep last word visible dimmed (see later Subtitles fixes in this changelog).
- Built `<TitleCard />` and `<BulletList />` scene components using spring entrance animations.
- Wrote `<Orchestrator />` logic that parses `video_data.json` and dynamically sets up `<Sequence>` segments mapped against frames.
- Configured 1080x1920 (9:16 Shorts) main `Composition` running at 30 fps in `index.tsx`.
- Defined a fully standalone demo logic in `sample_data/demo.json` for development without API keys.
- Implemented `pipeline/generate.ts` script automating script generation (via Gemini/OpenAI API) and audio processing (via ElevenLabs API), followed by a completely headless mp4 render using the Remotion CLI.
