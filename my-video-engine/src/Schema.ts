import { z } from "zod";

// ─── Word-level timestamp from ElevenLabs ────────────────────────────────────
export const WordTimestampSchema = z.object({
    word: z.string(),
    startTime: z.number(), // seconds
    endTime: z.number(),   // seconds
});
export type WordTimestamp = z.infer<typeof WordTimestampSchema>;

// ─── A code snippet to display ───────────────────────────────────────────────
export const CodeSnippetSchema = z.object({
    language: z.enum(["java", "typescript", "javascript", "python", "bash", "json", "tsx", "text"]),
    code: z.string(),
    startTime: z.number(), // seconds – when this snippet appears
    endTime: z.number(),   // seconds – when this snippet disappears
    title: z.string().optional(), // e.g. "HelloWorld.java"
});
export type CodeSnippet = z.infer<typeof CodeSnippetSchema>;

// ─── A scene in the timeline ─────────────────────────────────────────────────
export const SceneSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("title"),
        startTime: z.number(),
        endTime: z.number(),
        heading: z.string(),
        subheading: z.string().optional(),
    }),
    z.object({
        type: z.literal("code"),
        startTime: z.number(),
        endTime: z.number(),
        snippetIndex: z.number(), // index into VideoData.codeSnippets
    }),
    z.object({
        type: z.literal("split"),     // left: code, right: text
        startTime: z.number(),
        endTime: z.number(),
        snippetIndex: z.number(),
        bullets: z.array(z.string()),
    }),
]);
export type Scene = z.infer<typeof SceneSchema>;

// ─── Root VideoData contract ──────────────────────────────────────────────────
export const VideoDataSchema = z.object({
    /** MP3 URL – can be empty string for silent renders */
    audioUrl: z.string(),
    /** Flat array of every word with ElevenLabs timestamps */
    transcript: z.array(WordTimestampSchema),
    /** All code blocks used in the video */
    codeSnippets: z.array(CodeSnippetSchema),
    /** High-level scene timeline */
    scenes: z.array(SceneSchema),
    /** Optional: total duration override in seconds (default: last scene endTime) */
    durationSeconds: z.number().optional(),
    /**
     * When false, hides the bottom chapter/progress bar. Omitted defaults to true.
     */
    showProgressBar: z.boolean().optional(),
});
export type VideoData = z.infer<typeof VideoDataSchema>;

// ─── Helper: seconds → frames ─────────────────────────────────────────────────
export const toFrames = (seconds: number, fps: number): number =>
    Math.round(seconds * fps);

/** Total timeline length in seconds (matches Composition duration logic). */
export const getTimelineDurationSeconds = (scenes: Scene[], durationSeconds?: number): number => {
    if (durationSeconds != null && durationSeconds > 0) {
        return durationSeconds;
    }
    if (scenes.length > 0) {
        return scenes[scenes.length - 1].endTime;
    }
    return 30;
};

export const getDurationSeconds = (data: VideoData): number =>
    getTimelineDurationSeconds(data.scenes, data.durationSeconds);

export const chapterLabel = (scene: Scene, codeSnippets: CodeSnippet[]): string => {
    if (scene.type === "title") {
        return scene.heading;
    }
    if (scene.type === "code" || scene.type === "split") {
        const sn = codeSnippets[scene.snippetIndex];
        return sn?.title?.replace(/\.(java|ts|tsx|js|py)$/, "") ?? (scene.type === "split" ? "Recap" : "Code");
    }
    return "";
};
