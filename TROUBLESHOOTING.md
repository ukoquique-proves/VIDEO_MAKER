# VideoMaker Troubleshooting Guide

Common issues, setup verification, and component behavior notes.

---

## Quick Setup Verification

### Prerequisites Check

- **Node.js** 18 or higher (22+ recommended)
- **FFmpeg** — required for `npx remotion render`

Linux install:
```bash
sudo apt update && sudo apt install ffmpeg
```

### Smoke Test (No API Keys Required)

From `my-video-engine/`:

```bash
npm install --legacy-peer-deps
npm run typecheck
npm run render:demo
```

**Success indicators:**
- ✅ TypeScript compilation passes (`npm run typecheck`)
- ✅ Demo video renders to `output/videos/demo.mp4`
- ✅ Video shows **bottom chapter/progress bar** with ticks and advancing fill

For interactive scrubbing: `npm start` → open Remotion Studio → select **Main** composition.

---

## Common Pipeline Issues

### Google Cloud TTS: No Timepoints Warning

```
╔════════════════════════════════════════════════════════════════╗
║  ⚠️  WARNING: Google Cloud TTS returned NO timepoints         ║
║                                                                ║
║  Subtitles will use estimated 300ms/word timing and may be     ║
║  desynchronized from audio.                                    ║
║                                                                ║
║  Possible causes:                                              ║
║  • SSML marks not supported by this voice (try Standard voices) ║
║  • enableTimePointing not set correctly                      ║
║  • Text-to-Speech API not enabled in Google Cloud Console      ║
║                                                                ║
║  Workaround: Set ELEVENLABS_API_KEY for precise word timings   ║
╚════════════════════════════════════════════════════════════════╝
```

**What this means:** Subtitles will use estimated 300ms/word timing instead of precise API timestamps. Video renders fine but subtitle sync may be slightly off.

**Fix:**
1. Verify `GOOGLE_CLOUD_API_KEY` is set in `.env`
2. Ensure you're using a Standard voice (e.g., `en-US-Standard-C`)
3. Premium voices (WaveNet, Neural2) may have different SSML mark support
4. Check that Text-to-Speech API is enabled in Google Cloud Console
5. **Alternative:** Use **Azure Cognitive Services Speech** instead (free tier: 500K chars/month):
   - Create Speech resource at https://portal.azure.com
   - Set `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` in `.env`
   - Uses Jenny/Elvira neural voices with excellent quality
6. **Another alternative:** Use **Amazon Polly** (free tier: 5M chars/month for 12 months):
   - Create AWS account and IAM user with Polly permissions
   - Set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
   - Neural voices available (Joanna, Matthew, etc.)
7. **Last resort:** Set `ELEVENLABS_API_KEY` — free tier 10K chars/month but limited voice selection and no precise word timestamps (uses estimation)

### ElevenLabs 402 Payment Required

```
ElevenLabsError: Status code: 402
"Free users cannot use library voices via the API."
```

**What this means:** The voice ID is a library voice requiring paid ElevenLabs plan.

**Fix:**
1. **Use a free tier voice** — Only these voices work on free tier:
   - Rachel: `21m00Tcm4TlvDq8ikWAM` (default)
   - Bella: `EXAVITQu4vr4xnSDxMaL` (recommended for Spanish/English)
   - Adam: `pNInz6obpgDQGcFmaJgB`
   - Antoni: `ErXwobaYiN019PpxSv93`
   
   Set in `.env`:
   ```
   ELEVENLABS_VOICE_ID=EXAVITQu4vr4xnSDxMaL
   ```

2. **If you still get 402 with free voices** — The `convertWithTimestamps` endpoint requires paid plan even for free voices. The app will automatically fall back to standard synthesis with estimated word timing (150ms/word). Subtitles may be slightly less precise but video will still work.

3. **Alternative:** Use Google Cloud TTS (free tier: 4M characters/month). Set `GOOGLE_CLOUD_API_KEY` in `.env` — it takes priority over ElevenLabs.

### Zod Version Mismatch Warning

```
Version mismatch: zod: installed 3.25.76, required 4.3.6
```

**Current status:** Zod is pinned to `4.3.6` in `package.json` to match Remotion's requirement. TypeScript compilation passes.

**⚠️ Warning about `npm update`:**
- `openai@4` has a peerOptional dependency on Zod 3.x (`^3.23.8`)
- This is **not** a hard requirement — openai works fine with Zod 4
- However, `npm update` may warn about this peer dependency conflict
- **If you run `npm update` and see peer dependency errors:**
  - Use `npm install --legacy-peer-deps` to bypass the warning
  - Or ignore the warning if TypeScript compilation still passes (`npm run typecheck`)

**Future-proofing:**
- If `openai` updates to require Zod 4 as peer, this conflict will resolve automatically
- If `openai` tightens the peer dependency to require Zod 3, we may need to evaluate:
  - Option A: Keep current setup (openai peer is optional, not required)
  - Option B: Pin openai to a compatible version
  - Option C: Use a different HTTP client for LLM APIs

**Current resolution:** `--legacy-peer-deps` on install, warning is cosmetic and doesn't affect runtime.

### Remotion Render Fails Silently

If the pipeline prints "Done!" but no video file appears:

**Fix:** Already fixed in current version — `spawnSync` now checks exit code and throws on non-zero status. If you encounter this, check `output/videos/` directory permissions and FFmpeg installation.

---

## Component Behavior Notes

### Animation patterns

When extending components, prefer springs over linear fades for pop-in transitions:

```typescript
scale = spring(frame, fps, { stiffness: 200, damping: 15 })
```

This makes code panels overshoot slightly then settle, creating a more natural feel.

### Subtitles

- Drive copy from **word-level** timestamps (`startTime` / `endTime` in seconds, see `Schema.ts`).
- The **current** word is emphasized (e.g. cyan); **upcoming** words are **dimmed** (not full white).
- During **gaps** between words, keep the **last** spoken word visible but dimmed so the line does not flash empty.
- **Asymmetric windowing**: The subtitle box shows 3 words before and 5 words after the current active word. This choice prioritizes reading ahead, which is more natural for viewers, while keeping enough trailing context to maintain visual stability.

### Code highlighting

`CodeWindow` uses **Shiki** with an explicit `language` from the schema (no magic file-type detection in the renderer). When generating JSON, pick a language id that Shiki bundles (see `CodeSnippetSchema` in `Schema.ts`).
- When generating JSON via LLM, pick a language id that Shiki bundles (see `CodeSnippetSchema` in `Schema.ts`)

### Chapter Progress Bar

- Shows segment ticks at each scene start
- Displays **active scene label only** — this is a deliberate design choice to prevent label crowding and overlap on the narrow progress bar, especially on mobile-oriented vertical aspect ratios.
- Disable with `showProgressBar: false` on `VideoData` props
- Positioned at `bottom: 0` to avoid subtitle overlap

---

## Environment Variables

See `.env.example` for full list. Key variables:

| Variable | Purpose | Required |
|----------|---------|----------|
| `GEMINI_API_KEY` | LLM script generation (priority) | One of GROQ/GEMINI/OPENAI |
| `GROQ_API_KEY` | LLM script generation | One of GROQ/GEMINI/OPENAI |
| `GOOGLE_CLOUD_API_KEY` | TTS (recommended, free tier) | One of GOOGLE_CLOUD/ELEVENLABS for audio |
| `ELEVENLABS_API_KEY` | TTS (fallback, paid voices) | Optional |
| `ELEVENLABS_VOICE_ID` | Custom ElevenLabs voice | Optional |

---

## Testing Issues

### Tests Failing: Schema Validation

If `npm test` fails with schema validation errors:

```
VideoData Schema Validation › demo.json sample data › should validate against VideoDataSchema
expect(received).not.toThrow()
```

**Fix:**
1. Ensure `sample_data/demo.json` exists and is valid JSON
2. Run `npm run typecheck` to catch TypeScript errors
3. Check that Zod schema in `src/Schema.ts` matches the expected structure

### Tests Failing: Timing Consistency

If tests fail on timing checks:

```
expect(lastScene.endTime).toBeCloseTo(duration, 1)
```

**This indicates:** The `durationSeconds` override doesn't match the actual scene timeline.

**Fix:**
1. Check that `durationSeconds` (if set) matches the last scene's `endTime`
2. If omitted, ensure last scene's `endTime` is correctly calculated
3. For demo testing, small timing discrepancies are acceptable

---

## Still Stuck?

1. Check [CHANGELOG.md](CHANGELOG.md) for recent fixes and known issues
2. Review [README.md](README.md) for setup and pipeline details
3. Run with `--dry-run` to test script generation without API costs:
   ```bash
   npm run pipeline "Your Topic" -- --dry-run
   ```
4. Check test output for specific validation failures:
   ```bash
   npm test -- --verbose
   ```