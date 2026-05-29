#!/usr/bin/env ts-node
/**
 * pipeline/generate.ts
 * ─────────────────────
 * Automation pipeline: topic → LLM script → TTS audio → Remotion video
 *
 * Usage:
 *   ts-node pipeline/generate.ts "Java HashMap explained"
 *   ts-node pipeline/generate.ts "Java HashMap explained" --dry-run  (skip TTS)
 *
 * Requires (in .env):
 *   GROQ_API_KEY or GEMINI_API_KEY or OPENAI_API_KEY
 *   GOOGLE_CLOUD_API_KEY (recommended) or ELEVENLABS_API_KEY
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { VideoDataSchema, VideoData } from "../src/Schema";
import { createTTSProvider } from "./tts/TTSProvider";
import { assertValidTemporalConstraints } from "../src/validation/temporalValidation";

// ─── Load .env ───────────────────────────────────────────────────────────────
// Resolve .env from project root (works whether running from my-video-engine/ or project root)
const projectRoot = path.join(__dirname, "..", "..");
dotenv.config({ path: path.join(projectRoot, ".env") });

// ─── Load env ───────────────────────────────────────────────────────────────
const ENV_KEYS = {
    GEMINI: process.env.GEMINI_API_KEY ?? "",
    GROQ: process.env.GROQ_API_KEY ?? "",
    OPENAI: process.env.OPENAI_API_KEY ?? "",
};

const topic = process.argv[2];
const DRY_RUN = process.argv.includes("--dry-run");

if (!topic || topic.startsWith("--")) {
    console.error("❌  Usage: ts-node pipeline/generate.ts \"<topic>\" [--dry-run]");
    console.error("   --dry-run: Generate script only, skip TTS audio and video rendering");
    process.exit(1);
}

const OUTPUT_DIR  = path.join(__dirname, "..", "output");
const VIDEOS_DIR  = path.join(OUTPUT_DIR, "videos");
const PROPS_DIR   = path.join(OUTPUT_DIR, "props");
const SAMPLE_DIR  = path.join(__dirname, "..", "sample_data");
const TIMESTAMP   = Date.now();
const SLUG        = topic.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

// ─── Prompt enrichment: inject topic-specific facts ──────────────────────────
function buildSystemPrompt(topic: string): string {
    const t = topic.toLowerCase();

    // Build a facts block based on keywords in the topic
    let factsBlock = "";

    if (t.includes("puppy linux") || t.includes("puppylinux")) {
        factsBlock = `
TOPIC FACTS — use these specific details in the script, do NOT omit them:
- Puppy Linux weighs ~300MB (full ISO), boots into RAM entirely
- Minimum RAM: 256MB (runs comfortably on 512MB+)
- Current release: Puppy Linux 9.x (based on Ubuntu/Debian Focal/Jammy)
- Runs on hardware from 2005 onward — Pentium 4, old netbooks, USB sticks
- Supported AI-assisted IDEs in 2026: VS Code (via AppImage), Cursor (AppImage), GitHub Copilot (VS Code extension), Codeium (free Copilot alternative)
- Python AI stack works: pip install torch tensorflow (CPU-only builds)
- Boot-to-code time: under 60 seconds on a USB stick
- Key bash commands: \`puppy-install-pkg python3-pip\`, \`wget <AppImage URL> && chmod +x *.AppImage\`
- Frugal install: runs from RAM, saves session as .sfs file on shutdown`;
    } else if (t.includes("hashmap") || t.includes("hash map")) {
        factsBlock = `
TOPIC FACTS:
- Java HashMap: O(1) average for get/put/remove
- Backed by an array of buckets + linked lists / red-black trees (Java 8+)
- Default initial capacity: 16, load factor: 0.75
- Not thread-safe; use ConcurrentHashMap for concurrency
- Allows one null key, multiple null values`;
    }
    // More topics can be added here as the channel grows

    const channelContext = t.includes("puppy linux") || t.includes("puppylinux")
        ? "teaching Linux, lightweight OS setups, and AI-assisted development"
        : "teaching Java and backend development";

    return `You are an expert educational video scriptwriter for a YouTube Shorts channel ${channelContext}.
${factsBlock}

Generate a 30-second educational video in JSON format matching this TypeScript schema:
{
  audioUrl: "" (empty, we'll fill later),
  transcript: [{ word: string, startTime: number, endTime: number }][],
  codeSnippets: [{ language: "java"|"typescript"|"javascript"|"python"|"bash"|"json"|"tsx"|"text", code: string, title: string, startTime: number, endTime: number }][],
  scenes: (
    | { type: "title", startTime: number, endTime: number, heading: string, subheading?: string }
    | { type: "code", startTime: number, endTime: number, snippetIndex: number }
    | { type: "split", startTime: number, endTime: number, snippetIndex: number, bullets: string[] }
  )[],
  durationSeconds?: number,
  showProgressBar?: boolean
}

Rules:
- Total duration: 30 to 60 seconds (set durationSeconds accordingly — do NOT cut the script short to fit 30s)
- Omit showProgressBar unless you want it off; default in the app is on
- 3-4 scenes: start with title, show code, end with split (code + bullets)
- transcript must cover the full audio narration word by word with realistic timestamps
- All timestamps must be consistent (no overlaps)
- Code must be clean, complete, and directly relevant to the topic facts above
- Use SPECIFIC numbers and tool names from the facts — avoid vague language like "very fast" or "lightweight"
- Bash snippets should show real commands a user would actually run

Respond ONLY with valid JSON, no markdown fences.`;
}

// ─── Step 1: Generate video script JSON via LLM ───────────────────────────────
async function generateScript(): Promise<VideoData> {
    console.log(`\n🧠  Generating script for: "${topic}"`);

    const systemPrompt = buildSystemPrompt(topic);

    let rawData: unknown;
    // Priority: Gemini > Groq > OpenAI (Gemini has most reliable JSON output)
    if (ENV_KEYS.GEMINI) {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(ENV_KEYS.GEMINI);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\nTopic: " + topic }] }],
            generationConfig: {
                responseMimeType: "application/json",
            },
        });

        const content = result.response.text();
        rawData = JSON.parse(content);
    } else if (ENV_KEYS.GROQ) {
        const OpenAI = (await import("openai")).default;
        const groq = new OpenAI({
            apiKey: ENV_KEYS.GROQ,
            baseURL: "https://api.groq.com/openai/v1",
        });
        const chat = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Topic: ${topic}` },
            ],
            response_format: { type: "json_object" },
        });
        const content = chat.choices[0].message.content ?? "{}";
        const raw = content.replace(/^```json\s*|```$/gm, "").trim();
        rawData = JSON.parse(raw);
    } else if (ENV_KEYS.OPENAI) {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey: ENV_KEYS.OPENAI });
        const chat = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Topic: ${topic}` },
            ],
            response_format: { type: "json_object" },
        });
        const content = chat.choices[0].message.content ?? "{}";
        const raw = content.replace(/^```json\s*|```$/gm, "").trim();
        rawData = JSON.parse(raw);
    } else {
        console.warn("⚠️  No LLM API key found. Using demo.json as fallback.");
        const demo = fs.readFileSync(path.join(SAMPLE_DIR, "demo.json"), "utf-8");
        rawData = JSON.parse(demo);
    }

    const validated = VideoDataSchema.parse(rawData);
    console.log("   ✅  Script validated against schema!");

    // Validate temporal invariants (scene overlaps, timing consistency, etc.)
    try {
        assertValidTemporalConstraints(validated);
        console.log("   ✅  Temporal invariants validated!");
    } catch (error) {
        console.error("\n❌  Temporal validation failed:");
        console.error(`   ${error instanceof Error ? error.message : String(error)}`);
        console.error("\n   The LLM generated inconsistent timestamps.");
        console.error("   Try regenerating with a different prompt or model.");
        process.exit(1);
    }

    return validated;
}

// ─── Step 2: Generate audio via TTS provider ────────────────────────────────────
async function generateAudio(
    scriptData: VideoData
): Promise<{ audioPath: string; updatedData: VideoData }> {
    const ttsProvider = await createTTSProvider();
    
    if (!ttsProvider) {
        console.warn("⚠️  No TTS API key found (GOOGLE_CLOUD_API_KEY or ELEVENLABS_API_KEY).");
        console.warn("   Skipping audio — video will be silent.");
        return { audioPath: "", updatedData: scriptData };
    }

    console.log(`\n🎙️  Generating voiceover via ${ttsProvider.name}...`);

    // Extract plain text from transcript
    const text = scriptData.transcript.map((w) => w.word).join(" ");

    const audioPath = path.join(OUTPUT_DIR, `audio_${SLUG}_${TIMESTAMP}.mp3`);
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.mkdirSync(VIDEOS_DIR, { recursive: true });
    fs.mkdirSync(PROPS_DIR, { recursive: true });

    const { audioBuffer, transcript: realTranscript } = await ttsProvider.synthesize(text);
    
    fs.writeFileSync(audioPath, audioBuffer);
    console.log(`   ✅  Audio saved → ${audioPath}`);
    console.log(`   ✅  Rebuilt ${realTranscript.length} word timestamps.`);

    const updatedData: VideoData = { ...scriptData, transcript: realTranscript };
    return { audioPath, updatedData };
}

// ─── Step 3: Remotion render ──────────────────────────────────────────────────
function renderVideo(propsPath: string): void {
    const outputPath = path.join(VIDEOS_DIR, `${SLUG}_${TIMESTAMP}.mp4`);
    console.log(`\n🎬  Rendering video → ${outputPath}`);
    const result = spawnSync(
        "npx",
        ["remotion", "render", "src/index.tsx", "Main", outputPath, `--props=${propsPath}`],
        { stdio: "inherit", cwd: path.join(__dirname, "..") }
    );
    if (result.status !== 0) {
        throw new Error(`Remotion render failed with exit code ${result.status}`);
    }
    console.log(`\n✅  Done! Video saved → ${outputPath}`);

    // Keep only the 2 most recent videos per topic slug
    const allVideos = fs.readdirSync(VIDEOS_DIR)
        .filter(f => f.startsWith(SLUG) && f.endsWith(".mp4"))
        .map(f => ({ name: f, path: path.join(VIDEOS_DIR, f), mtime: fs.statSync(path.join(VIDEOS_DIR, f)).mtime }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    for (const old of allVideos.slice(2)) {
        fs.unlinkSync(old.path);
        console.log(`   🧹  Removed old video: ${old.name}`);
    }
}

// ─── Step 4: Cleanup old audio files ───────────────────────────────────────────
function cleanupOldAudioFiles(): void {
    const PUBLIC_DIR = path.join(__dirname, "..", "public");
    const MAX_AGE_HOURS = 24; // Keep files younger than 24 hours
    const MAX_FILES_TO_KEEP = 10; // Always keep at least 10 most recent

    if (!fs.existsSync(PUBLIC_DIR)) return;

    const files = fs.readdirSync(PUBLIC_DIR)
        .filter(f => f.startsWith("audio_") && f.endsWith(".mp3"))
        .map(f => {
            const fullPath = path.join(PUBLIC_DIR, f);
            const stats = fs.statSync(fullPath);
            return { name: f, path: fullPath, mtime: stats.mtime };
        })
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // Newest first

    if (files.length <= MAX_FILES_TO_KEEP) return; // Nothing to clean

    const now = Date.now();
    const maxAgeMs = MAX_AGE_HOURS * 60 * 60 * 1000;
    let cleaned = 0;

    // Remove files older than MAX_AGE_HOURS, keeping at least MAX_FILES_TO_KEEP
    for (let i = MAX_FILES_TO_KEEP; i < files.length; i++) {
        const file = files[i];
        const ageMs = now - file.mtime.getTime();

        if (ageMs > maxAgeMs) {
            try {
                fs.unlinkSync(file.path);
                cleaned++;
            } catch (e) {
                console.warn(`   ⚠️  Could not remove old audio file: ${file.name}`);
            }
        }
    }

    if (cleaned > 0) {
        console.log(`\n🧹  Cleaned up ${cleaned} old audio file(s) from public/`);
        console.log(`   (Kept ${Math.min(files.length - cleaned, MAX_FILES_TO_KEEP)} recent files)`);
    }
}

// ─── Main ────────────────────────────────────────────────────────────────────
(async () => {
    console.log(`\n🚀  VideoMaker Pipeline — "${topic}"`);
    if (DRY_RUN) {
        console.log("🧪  DRY RUN MODE — Skipping ElevenLabs audio & video rendering");
    }
    console.log("═".repeat(50));

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.mkdirSync(VIDEOS_DIR, { recursive: true });
    fs.mkdirSync(PROPS_DIR,  { recursive: true });

    const scriptData = await generateScript();

    let updatedData: VideoData;

    if (DRY_RUN) {
        // Dry run: skip ElevenLabs, use dummy audio URL
        updatedData = { ...scriptData, audioUrl: "" };
        console.log("\n🧪  Dry run complete — Script generated and validated!");
        console.log("   (Skipping ElevenLabs API call to save credits)");
    } else {
        // Full pipeline: generate audio with ElevenLabs
        const { audioPath, updatedData: dataWithAudio } = await generateAudio(scriptData);

        // Copy audio to public directory and use relative path for Remotion
        if (audioPath) {
            const PUBLIC_DIR = path.join(__dirname, "..", "public");
            fs.mkdirSync(PUBLIC_DIR, { recursive: true });

            const audioFilename = `audio_${SLUG}_${TIMESTAMP}.mp3`;
            const publicAudioPath = path.join(PUBLIC_DIR, audioFilename);
            fs.copyFileSync(audioPath, publicAudioPath);

            // Remove intermediate audio from output/ — public/ copy is what Remotion needs
            fs.unlinkSync(audioPath);

            // Use relative path starting with / for Remotion staticFile() to resolve from public/
            updatedData = { ...dataWithAudio, audioUrl: `/${audioFilename}` };
        } else {
            updatedData = dataWithAudio;
        }
    }

    // ── Auto-correct durationSeconds from real transcript ──────────────────
    // The LLM often generates a transcript longer than 30s despite instructions.
    // We trust the actual word timestamps (from TTS) over the LLM's declared value.
    const lastWord = updatedData.transcript[updatedData.transcript.length - 1];
    if (lastWord) {
        const realDuration = Math.ceil(lastWord.endTime) + 1; // +1s padding after last word
        if (realDuration !== updatedData.durationSeconds) {
            console.log(`\n⚠️  durationSeconds mismatch: LLM said ${updatedData.durationSeconds}s, actual audio ends at ${lastWord.endTime.toFixed(2)}s`);
            console.log(`   ✅  Auto-corrected durationSeconds → ${realDuration}s`);
            updatedData = { ...updatedData, durationSeconds: realDuration };
        }
    }

    // Props: keep last 3 per topic for comparison, delete older ones
    const propsPath = path.join(PROPS_DIR, `${SLUG}_${TIMESTAMP}.json`);
    fs.mkdirSync(PROPS_DIR, { recursive: true });
    fs.writeFileSync(propsPath, JSON.stringify(updatedData, null, 2));
    console.log(`\n📄  Props saved → ${propsPath}`);

    // Cleanup old props for this slug — keep only the 3 most recent
    const allProps = fs.readdirSync(PROPS_DIR)
        .filter(f => f.startsWith(SLUG) && f.endsWith(".json"))
        .map(f => ({ name: f, path: path.join(PROPS_DIR, f), mtime: fs.statSync(path.join(PROPS_DIR, f)).mtime }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    for (const old of allProps.slice(3)) {
        fs.unlinkSync(old.path);
        console.log(`   🧹  Removed old props: ${old.name}`);
    }

    if (!DRY_RUN) {
        renderVideo(propsPath);
        cleanupOldAudioFiles(); // Cleanup old MP3s after successful render
    } else {
        console.log("\n✅  Dry run finished — Ready for full pipeline with API keys!");
        console.log(`   Run without --dry-run to generate video: npm run pipeline "${topic}"`);
    }
})();
