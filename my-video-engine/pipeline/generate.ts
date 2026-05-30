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
import * as crypto from "crypto";
import * as dotenv from "dotenv";
import { VideoDataSchema, VideoData } from "../src/Schema";
import { getAvailableTTSProviders } from "./tts/TTSProvider";
import { assertValidTemporalConstraints } from "../src/validation/temporalValidation";
import { buildSystemPrompt, parseAudioFiles, pruneAudioFiles } from "./generateUtils";

// ─── Unwrap LLM responses that nest the payload under a single key ────────────
// Some models (e.g. Gemini) occasionally return { "video": { ...actual data... } }
// instead of the flat object we asked for. If the top-level object is missing
// required fields but has exactly one key whose value is an object that has them,
// unwrap it transparently.
function unwrapIfNested(raw: unknown): unknown {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw;
    const obj = raw as Record<string, unknown>;
    if ("scenes" in obj) return obj; // already flat
    const keys = Object.keys(obj);
    if (keys.length === 1) {
        const inner = obj[keys[0]];
        if (typeof inner === "object" && inner !== null && "scenes" in inner) {
            console.warn(`   ⚠️  LLM wrapped response under key "${keys[0]}" — unwrapping automatically.`);
            return inner;
        }
    }
    return raw;
}

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

const OUTPUT_DIR = path.join(__dirname, "..", "output");
const VIDEOS_DIR = path.join(OUTPUT_DIR, "videos");
const PROPS_DIR = path.join(OUTPUT_DIR, "props");
const SAMPLE_DIR = path.join(__dirname, "..", "sample_data");
const TIMESTAMP = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`; // Chronological + unique ID
const SLUG = topic.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

// ─── Prompt enrichment: load topic-specific facts from JSON ──────────────────
function buildSystemPromptForTopic(topic: string): string {
    const TOPICS_DIR = path.join(__dirname, "topics");
    return buildSystemPrompt(topic, TOPICS_DIR);
}

// ─── Step 1: Generate video script JSON via LLM ───────────────────────────────
async function generateScript(): Promise<VideoData> {
    console.log(`\n🧠  Generating script for: "${topic}"`);

    const systemPrompt = buildSystemPromptForTopic(topic);

    let rawData: unknown;
    // Priority: Gemini > Groq > OpenAI (Gemini has most reliable JSON output)
    if (ENV_KEYS.GEMINI && ENV_KEYS.GEMINI !== "your_gemini_key_here") {
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
        console.log("   🔍  Gemini raw (first 500 chars):", content.slice(0, 500));
        rawData = JSON.parse(content);
        console.log("   🔍  Gemini response keys:", Object.keys(rawData as object));
    } else if (ENV_KEYS.GROQ && ENV_KEYS.GROQ !== "your_groq_key_here" && ENV_KEYS.GROQ.startsWith("gsk_")) {
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
    } else if (ENV_KEYS.OPENAI && ENV_KEYS.OPENAI !== "your_openai_key_here") {
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

    const validated = VideoDataSchema.parse(unwrapIfNested(rawData));
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
): Promise<{ audioUrl: string; updatedData: VideoData }> {
    const providers = await getAvailableTTSProviders();

    if (providers.length === 0) {
        console.warn("⚠️  No TTS providers available (check API keys or dependencies).");
        console.warn("   Skipping audio — video will be silent.");
        return { audioUrl: "", updatedData: scriptData };
    }

    // Extract plain text for fallback
    const text = scriptData.transcript.map((w) => w.word).join(" ");

    const PUBLIC_DIR = path.join(__dirname, "..", "public");
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });

    const audioFilename = `audio_${SLUG}_${TIMESTAMP}.mp3`;
    const publicAudioPath = path.join(PUBLIC_DIR, audioFilename);

    // Try providers in order
    for (const provider of providers) {
        try {
            console.log(`\n🎙️  Generating voiceover via ${provider.name}...`);
            const { audioBuffer, transcript: realTranscript, transcriptSource } = await provider.synthesize(text);

            fs.writeFileSync(publicAudioPath, audioBuffer);
            console.log(`   ✅  Audio saved → ${publicAudioPath}`);
            console.log(`   ✅  Rebuilt ${realTranscript.length} word timestamps.`);
            if (transcriptSource) {
                console.log(`   ℹ️  Transcript source: ${transcriptSource}`);
            }

            const updatedData: VideoData = {
                ...scriptData,
                transcript: realTranscript,
                transcriptSource
            };
            return { audioUrl: `/${audioFilename}`, updatedData };
        } catch (error) {
            console.warn(`   ⚠️  ${provider.name} failed: ${error instanceof Error ? error.message : String(error)}`);
            console.warn("   Retrying with next available provider...");
        }
    }

    console.error("❌  All TTS providers failed.");
    return { audioUrl: "", updatedData: scriptData };
}

// ─── Step 3: Remotion render ──────────────────────────────────────────────────
const RENDER_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function renderVideo(propsPath: string): void {
    const outputPath = path.join(VIDEOS_DIR, `${SLUG}_${TIMESTAMP}.mp4`);
    console.log(`\n🎬  Rendering video → ${outputPath}`);
    const result = spawnSync(
        "npx",
        ["remotion", "render", "src/index.tsx", "Main", outputPath, `--props=${propsPath}`],
        { stdio: "inherit", cwd: path.join(__dirname, ".."), timeout: RENDER_TIMEOUT_MS }
    );
    if (result.signal === "SIGTERM") {
        throw new Error(
            `Remotion render timed out after ${RENDER_TIMEOUT_MS / 60000} minutes. ` +
            "Possible causes: Shiki deadlock, missing asset, or hung browser process."
        );
    }
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
        try {
            fs.unlinkSync(old.path);
            console.log(`   🧹  Removed old video: ${old.name}`);
        } catch (e) {
            // Ignore if file already deleted by concurrent process
        }
    }
}

// ─── Step 4: Cleanup old audio files ───────────────────────────────────────────
function cleanupOldAudioFiles(): void {
    const PUBLIC_DIR = path.join(__dirname, "..", "public");
    const MAX_AGE_HOURS = 24;
    const MAX_FILES_TO_KEEP = 10;

    const files = parseAudioFiles(PUBLIC_DIR);
    if (files.length <= MAX_FILES_TO_KEEP) return;

    const cleaned = pruneAudioFiles(files, MAX_FILES_TO_KEEP, MAX_AGE_HOURS * 60 * 60 * 1000);
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
    fs.mkdirSync(PROPS_DIR, { recursive: true });

    const scriptData = await generateScript();

    let updatedData: VideoData;

    if (DRY_RUN) {
        // Dry run: skip TTS, use dummy audio URL
        updatedData = { ...scriptData, audioUrl: "" };
        console.log("\n🧪  Dry run complete — Script generated and validated!");
    } else {
        // Full pipeline: generate audio
        const { audioUrl, updatedData: dataWithAudio } = await generateAudio(scriptData);
        updatedData = { ...dataWithAudio, audioUrl };
    }

    // ── Auto-correct durationSeconds from real transcript ──────────────────
    // The LLM often generates a transcript longer than 30s despite instructions.
    // NOTE: In DRY_RUN mode, this corrects against LLM draft timestamps (unverified).
    // In a full run, this corrects against real TTS word-level timestamps.
    const lastWord = updatedData.transcript[updatedData.transcript.length - 1];
    const lastScene = updatedData.scenes[updatedData.scenes.length - 1];

    if (lastWord) {
        // Ensure duration covers both the audio and all scenes
        const audioEnd = Math.ceil(lastWord.endTime) + 1;
        const sceneEnd = lastScene ? Math.ceil(lastScene.endTime) + 1 : 0;
        const realDuration = Math.max(audioEnd, sceneEnd);

        if (realDuration !== updatedData.durationSeconds) {
            console.log(`\n⚠️  durationSeconds mismatch: LLM said ${updatedData.durationSeconds}s, actual content ends at ${realDuration}s`);
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
        try {
            fs.unlinkSync(old.path);
            console.log(`   🧹  Removed old props: ${old.name}`);
        } catch (e) {
            // Ignore if file already deleted by concurrent process
        }
    }

    try {
        if (!DRY_RUN) {
            renderVideo(propsPath);
        } else {
            console.log("\n✅  Dry run finished — Ready for full pipeline with API keys!");
            console.log(`   Run without --dry-run to generate video: npm run pipeline "${topic}"`);
        }
    } finally {
        // Only scan/cleanup audio if we actually ran a render or generated audio
        if (!DRY_RUN) {
            cleanupOldAudioFiles();
        }
    }
})();
