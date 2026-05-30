/**
 * generateUtils.ts
 * ─────────────────
 * Pure utility functions extracted from generate.ts for testability.
 * No side-effects, no process.argv, no process.exit.
 */

import * as fs from "fs";
import * as path from "path";

// ─── Topic file matching & prompt building ────────────────────────────────────

export interface TopicFileContent {
    matchMode?: "any" | "all";
    keywords: string[];
    channelContext: string;
    facts: string[];
    assets?: Array<{ path: string; context: string }>;
}

/**
 * Returns the first topic file whose keywords match the given topic string,
 * or null if none match.
 */
export function findMatchingTopic(
    topic: string,
    topicsDir: string
): TopicFileContent | null {
    if (!fs.existsSync(topicsDir)) return null;

    const t = topic.toLowerCase();
    const files = fs.readdirSync(topicsDir)
        .filter(f => f.endsWith(".json"))
        .sort(); // deterministic priority

    for (const file of files) {
        try {
            const content: TopicFileContent = JSON.parse(
                fs.readFileSync(path.join(topicsDir, file), "utf-8")
            );
            const matchMode: "any" | "all" = content.matchMode === "any" ? "any" : "all";
            const keywords: string[] = content.keywords ?? [];
            const matched =
                matchMode === "any"
                    ? keywords.some(k => t.includes(k.toLowerCase()))
                    : keywords.every(k => t.includes(k.toLowerCase()));
            if (matched) return content;
        } catch {
            // skip malformed files
        }
    }
    return null;
}

/**
 * Builds the LLM system prompt, optionally enriched with topic-specific facts.
 */
export function buildSystemPrompt(topic: string, topicsDir: string): string {
    const match = findMatchingTopic(topic, topicsDir);

    const channelContext =
        match?.channelContext ?? "teaching software engineering and modern development";

    const factsBlock = match
        ? `\nTOPIC FACTS — use these specific details in the script, do NOT omit them:\n- ${match.facts.join("\n- ")}`
        : "";

    let assetsBlock = "";
    if (match?.assets && match.assets.length > 0) {
        assetsBlock =
            `\nIMAGE ASSETS — use these specific files in your scenes (type: "image") with a relevant caption:\n` +
            match.assets.map(a => `- "${a.path}" (${a.context})`).join("\n");
    }

    return `You are an expert educational video scriptwriter for a YouTube Shorts channel ${channelContext}.
${factsBlock}
${assetsBlock}

Generate an educational video in JSON format matching this TypeScript schema:
{
  audioUrl: "" (empty, we'll fill later),
  transcript: [{ word: string, startTime: number, endTime: number }][],
  codeSnippets: [{ language: "java"|"typescript"|"javascript"|"python"|"bash"|"json"|"tsx"|"text", code: string, title: string, startTime: number, endTime: number }][],
  scenes: (
    | { type: "title", startTime: number, endTime: number, heading: string, subheading?: string }
    | { type: "code", startTime: number, endTime: number, snippetIndex: number }
    | { type: "split", startTime: number, endTime: number, snippetIndex: number, bullets: string[] }
    | { type: "image", startTime: number, endTime: number, imageUrl: string, caption?: string }
  )[],
  durationSeconds?: number,
  showProgressBar?: boolean
}

Rules:
- Total duration: 30 to 180 seconds (set durationSeconds accordingly — do NOT cut the script short to fit a small time limit)
- Omit showProgressBar unless you want it off; default in the app is on
- transcript must cover the full audio narration word by word with realistic timestamps
- All timestamps must be consistent (no overlaps)
- Code must be clean, complete, and directly relevant to the topic facts above
- Use SPECIFIC numbers and tool names from the facts — avoid vague language like "very fast" or "lightweight"
- Bash snippets should show real commands a user would actually run
- When using images, set the scene type to "image" and provide the imageUrl and a relevant caption.

Respond ONLY with valid JSON, no markdown fences.`;
}

// ─── Audio file cleanup ───────────────────────────────────────────────────────

export interface AudioFileEntry {
    name: string;
    fullPath: string;
    epoch: number;
}

/**
 * Parses audio filenames of the form audio_<slug>_<epoch>_<uuid>.mp3
 * and returns them sorted newest-first by embedded epoch.
 */
export function parseAudioFiles(publicDir: string): AudioFileEntry[] {
    if (!fs.existsSync(publicDir)) return [];

    return fs
        .readdirSync(publicDir)
        .filter(f => f.startsWith("audio_") && f.endsWith(".mp3"))
        .map(f => {
            // Strip .mp3, split on _ — epoch is second-to-last segment
            const parts = f.slice(0, -4).split("_");
            const epoch = parseInt(parts[parts.length - 2], 10);
            return { name: f, fullPath: path.join(publicDir, f), epoch: isNaN(epoch) ? 0 : epoch };
        })
        .sort((a, b) => b.epoch - a.epoch); // newest first
}

/**
 * Deletes audio files beyond MAX_FILES_TO_KEEP that are also older than maxAgeMs.
 * Returns the number of files deleted.
 */
export function pruneAudioFiles(
    files: AudioFileEntry[],
    maxFilesToKeep: number,
    maxAgeMs: number,
    now: number = Date.now()
): number {
    let cleaned = 0;
    for (let i = maxFilesToKeep; i < files.length; i++) {
        const file = files[i];
        if (now - file.epoch > maxAgeMs) {
            try {
                fs.unlinkSync(file.fullPath);
                cleaned++;
            } catch {
                // ignore — file may have been removed by a concurrent process
            }
        }
    }
    return cleaned;
}
