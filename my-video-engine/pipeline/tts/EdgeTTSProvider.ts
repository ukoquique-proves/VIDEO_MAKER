import { execSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { TTSProvider, TTSResult, WordTimestamp } from "./TTSProvider";

/**
 * EdgeTTSProvider
 * ───────────────
 * Uses Microsoft Edge TTS (free, no API key) via the `edge-tts` Python package.
 *
 * Key fix over the original implementation:
 *   The original used the CLI with --write-media only, then faked word timestamps
 *   at a flat 220ms/word. This caused two visible problems:
 *
 *   1. NO PAUSES — the fake transcript ran at a constant rate, so the subtitle
 *      overlay never reflected the natural pauses and breath breaks that Edge-TTS
 *      actually inserts. Subtitles raced ahead of the audio during pauses.
 *
 *   2. SPEECH FINISHES BEFORE VIDEO — the flat 220ms/word estimate underestimates
 *      real duration (Spanish averages ~300-400ms/word at natural speech rate, plus
 *      sentence pauses). So durationSeconds was corrected to a value shorter than
 *      the actual MP3, and the video was rendered too short, cutting off the end.
 *
 * Fix:
 *   We now use a Python helper script that calls edge-tts via its streaming API,
 *   collecting both audio chunks AND WordBoundary events. The WordBoundary events
 *   carry the real `offset` (100-nanosecond units) and `duration` of each word,
 *   giving us accurate per-word timestamps to replace the fake ones.
 *
 * Requirements:
 *   pip install edge-tts  (Python 3.8+)
 *
 * Environment variables:
 *   EDGE_TTS_VOICE  — override voice name (default: es-AR-TomasNeural)
 *   EDGE_TTS_RATE   — speech rate adjustment, e.g. "-10%" to slow down (default: +0%)
 */
export class EdgeTTSProvider implements TTSProvider {
    readonly name = "EdgeTTS";
    private voice: string;
    private rate: string;

    constructor() {
        // es-AR-TomasNeural: Argentine Spanish male — closest to Uruguayan Rioplatense.
        // Alternatives: es-UY-ValentinaNeural (female), es-AR-ElenaNeural (female AR)
        this.voice = process.env.EDGE_TTS_VOICE ?? "es-AR-TomasNeural";
        // Slow down slightly for clarity; natural rate tends to be too fast for subtitles.
        this.rate  = process.env.EDGE_TTS_RATE  ?? "-10%";

        // Verify dependencies
        try {
            execSync("python3 -c \"import edge_tts\"", { stdio: "ignore" });
        } catch (e) {
            try {
                execSync("python -c \"import edge_tts\"", { stdio: "ignore" });
            } catch (e2) {
                throw new Error("Edge-TTS dependency not found. Please run 'pip install edge-tts'.");
            }
        }
    }

    async synthesize(text: string): Promise<TTSResult> {
        console.log(`   Using Edge-TTS voice: ${this.voice}  rate: ${this.rate}`);

        const ts         = Date.now();
        const tmpDir     = process.cwd();
        const audioPath  = path.join(tmpDir, `temp_edge_${ts}.mp3`);
        const wordsPath  = path.join(tmpDir, `temp_edge_${ts}_words.json`);
        const scriptPath = path.join(tmpDir, `temp_edge_${ts}_runner.py`);

        // ── Python helper: streams audio + captures WordBoundary events ──────────
        // We write and run a small inline Python script rather than shelling out to
        // the CLI, because the CLI's --write-subtitles flag only writes WebVTT
        // (sentence-level), not word-level boundary events.
        const pythonScript = `
import asyncio, json, edge_tts, sys

async def main():
    try:
        communicate = edge_tts.Communicate(
            ${JSON.stringify(text)},
            voice=${JSON.stringify(this.voice)},
            rate=${JSON.stringify(this.rate)},
            boundary="WordBoundary",
        )
        audio_chunks = []
        word_events  = []

        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_chunks.append(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                # offset and duration are in 100-nanosecond units
                word_events.append({
                    "word":     chunk["text"],
                    "offset":   chunk["offset"],   # start, in 100-ns ticks
                    "duration": chunk["duration"], # length, in 100-ns ticks
                })

        with open(${JSON.stringify(audioPath)}, "wb") as f:
            for chunk in audio_chunks:
                f.write(chunk)

        with open(${JSON.stringify(wordsPath)}, "w") as f:
            json.dump(word_events, f)
    except Exception as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)

asyncio.run(main())
`;

        fs.writeFileSync(scriptPath, pythonScript, "utf-8");

        let transcriptSource = "EdgeTTS-real";
        try {
            // Run the helper; use python3 first, fall back to python
            let pyResult = spawnSync("python3", [scriptPath], { stdio: "inherit" });
            if (pyResult.status !== 0) {
                pyResult = spawnSync("python", [scriptPath], { stdio: "inherit" });
            }

            if (pyResult.status !== 0 || !fs.existsSync(audioPath)) {
                throw new Error("Edge-TTS Python helper failed to generate audio.");
            }

            const audioBuffer = fs.readFileSync(audioPath);
            let transcript: WordTimestamp[] = [];

            if (fs.existsSync(wordsPath)) {
                const rawWords = JSON.parse(fs.readFileSync(wordsPath, "utf-8"));
                // Convert 100-ns ticks to seconds (1s = 10,000,000 ticks)
                transcript = rawWords.map((w: any) => ({
                    word:      w.word,
                    startTime: w.offset / 10000000,
                    endTime:   (w.offset + w.duration) / 10000000,
                }));
            }

            if (transcript.length === 0) {
                console.warn("   ⚠️  Edge-TTS returned no word boundaries. Falling back to estimation.");
                transcript = this.estimateTranscript(text);
                transcriptSource = "EdgeTTS-estimated";
            }

            return { audioBuffer, transcript, transcriptSource } as any;

        } finally {
            // Cleanup
            [audioPath, wordsPath, scriptPath].forEach(p => {
                if (fs.existsSync(p)) fs.unlinkSync(p);
            });
        }
    }

    private estimateTranscript(text: string): WordTimestamp[] {
        const words = text.split(/\s+/).filter(w => w.length > 0);
        const avgWordDuration = 0.35; // Better estimate for Spanish including pauses
        return words.map((w, i) => ({
            word:      w,
            startTime: i * avgWordDuration,
            endTime:   (i + 1) * avgWordDuration,
        }));
    }
}
