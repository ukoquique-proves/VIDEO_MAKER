/**
 * Tests for generateUtils.ts
 * Covers topic matching, prompt building, and audio file cleanup logic.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
    findMatchingTopic,
    buildSystemPrompt,
    parseAudioFiles,
    pruneAudioFiles,
    AudioFileEntry,
} from "../generateUtils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "videomaker-test-"));
}

function writeTopicFile(dir: string, filename: string, content: object): void {
    fs.writeFileSync(path.join(dir, filename), JSON.stringify(content), "utf-8");
}

// ─── findMatchingTopic ────────────────────────────────────────────────────────

describe("findMatchingTopic", () => {
    let topicsDir: string;

    beforeEach(() => {
        topicsDir = makeTempDir();
    });

    afterEach(() => {
        fs.rmSync(topicsDir, { recursive: true, force: true });
    });

    it("returns null when topics directory does not exist", () => {
        expect(findMatchingTopic("anything", "/nonexistent/path")).toBeNull();
    });

    it("returns null when no topic file matches", () => {
        writeTopicFile(topicsDir, "java.json", {
            matchMode: "any",
            keywords: ["hashmap", "java"],
            channelContext: "teaching java",
            facts: ["Java is fast"],
        });
        expect(findMatchingTopic("python tutorial", topicsDir)).toBeNull();
    });

    it("matches with matchMode 'any' when at least one keyword is present", () => {
        writeTopicFile(topicsDir, "puppy.json", {
            matchMode: "any",
            keywords: ["puppy linux", "puppylinux"],
            channelContext: "teaching linux",
            facts: ["Puppy Linux is 300MB"],
        });
        expect(findMatchingTopic("puppy linux tutorial", topicsDir)).not.toBeNull();
        expect(findMatchingTopic("puppylinux setup", topicsDir)).not.toBeNull();
        expect(findMatchingTopic("ubuntu tutorial", topicsDir)).toBeNull();
    });

    it("matches with matchMode 'all' only when every keyword is present", () => {
        writeTopicFile(topicsDir, "permacultura.json", {
            matchMode: "all",
            keywords: ["permacultura", "pedro"],
            channelContext: "teaching permaculture",
            facts: ["Pedro lives in Lavalleja"],
        });
        // Both keywords present → match
        expect(findMatchingTopic("permacultura de pedro en uruguay", topicsDir)).not.toBeNull();
        // Only one keyword → no match
        expect(findMatchingTopic("permacultura urbana", topicsDir)).toBeNull();
        expect(findMatchingTopic("san pedro de atacama", topicsDir)).toBeNull();
    });

    it("defaults to matchMode 'all' when field is absent", () => {
        writeTopicFile(topicsDir, "strict.json", {
            // no matchMode field
            keywords: ["foo", "bar"],
            channelContext: "ctx",
            facts: [],
        });
        expect(findMatchingTopic("foo bar baz", topicsDir)).not.toBeNull();
        expect(findMatchingTopic("foo only", topicsDir)).toBeNull();
    });

    it("is case-insensitive for topic input", () => {
        writeTopicFile(topicsDir, "java.json", {
            matchMode: "any",
            keywords: ["hashmap"],
            channelContext: "teaching java",
            facts: [],
        });
        expect(findMatchingTopic("Java HashMap Explained", topicsDir)).not.toBeNull();
    });

    it("picks files in alphabetical order (deterministic priority)", () => {
        // 'a_topic.json' sorts before 'b_topic.json'
        writeTopicFile(topicsDir, "a_topic.json", {
            matchMode: "any",
            keywords: ["java"],
            channelContext: "first",
            facts: ["first match"],
        });
        writeTopicFile(topicsDir, "b_topic.json", {
            matchMode: "any",
            keywords: ["java"],
            channelContext: "second",
            facts: ["second match"],
        });
        const result = findMatchingTopic("java tutorial", topicsDir);
        expect(result?.channelContext).toBe("first");
    });

    it("returns assets when present in the matched topic", () => {
        writeTopicFile(topicsDir, "assets.json", {
            matchMode: "any",
            keywords: ["demo"],
            channelContext: "ctx",
            facts: [],
            assets: [{ path: "/img/demo.png", context: "intro slide" }],
        });
        const result = findMatchingTopic("demo video", topicsDir);
        expect(result?.assets).toHaveLength(1);
        expect(result?.assets?.[0].path).toBe("/img/demo.png");
    });

    it("skips malformed JSON files without throwing", () => {
        fs.writeFileSync(path.join(topicsDir, "broken.json"), "{ not valid json", "utf-8");
        writeTopicFile(topicsDir, "valid.json", {
            matchMode: "any",
            keywords: ["valid"],
            channelContext: "ctx",
            facts: [],
        });
        expect(() => findMatchingTopic("valid topic", topicsDir)).not.toThrow();
        expect(findMatchingTopic("valid topic", topicsDir)).not.toBeNull();
    });
});

// ─── buildSystemPrompt ────────────────────────────────────────────────────────

describe("buildSystemPrompt", () => {
    let topicsDir: string;

    beforeEach(() => {
        topicsDir = makeTempDir();
    });

    afterEach(() => {
        fs.rmSync(topicsDir, { recursive: true, force: true });
    });

    it("includes default channel context when no topic matches", () => {
        const prompt = buildSystemPrompt("unknown topic", topicsDir);
        expect(prompt).toContain("teaching software engineering and modern development");
    });

    it("injects topic facts when a topic matches", () => {
        writeTopicFile(topicsDir, "java.json", {
            matchMode: "any",
            keywords: ["hashmap"],
            channelContext: "teaching java",
            facts: ["HashMap has O(1) average lookup", "Default capacity is 16"],
        });
        const prompt = buildSystemPrompt("Java HashMap explained", topicsDir);
        expect(prompt).toContain("teaching java");
        expect(prompt).toContain("HashMap has O(1) average lookup");
        expect(prompt).toContain("Default capacity is 16");
        expect(prompt).toContain("TOPIC FACTS");
    });

    it("injects image assets block when assets are present", () => {
        writeTopicFile(topicsDir, "demo.json", {
            matchMode: "any",
            keywords: ["demo"],
            channelContext: "ctx",
            facts: ["fact one"],
            assets: [
                { path: "/img/slide1.png", context: "intro" },
                { path: "/img/slide2.png", context: "outro" },
            ],
        });
        const prompt = buildSystemPrompt("demo video", topicsDir);
        expect(prompt).toContain("IMAGE ASSETS");
        expect(prompt).toContain("/img/slide1.png");
        expect(prompt).toContain("/img/slide2.png");
    });

    it("does not include IMAGE ASSETS block when no assets", () => {
        writeTopicFile(topicsDir, "noassets.json", {
            matchMode: "any",
            keywords: ["noassets"],
            channelContext: "ctx",
            facts: ["a fact"],
        });
        const prompt = buildSystemPrompt("noassets topic", topicsDir);
        expect(prompt).not.toContain("IMAGE ASSETS");
    });

    it("always includes the JSON schema instructions", () => {
        const prompt = buildSystemPrompt("anything", topicsDir);
        expect(prompt).toContain("audioUrl");
        expect(prompt).toContain("transcript");
        expect(prompt).toContain("codeSnippets");
        expect(prompt).toContain("scenes");
        expect(prompt).toContain("Respond ONLY with valid JSON");
    });
});

// ─── parseAudioFiles ──────────────────────────────────────────────────────────

describe("parseAudioFiles", () => {
    let publicDir: string;

    beforeEach(() => {
        publicDir = makeTempDir();
    });

    afterEach(() => {
        fs.rmSync(publicDir, { recursive: true, force: true });
    });

    it("returns empty array when directory does not exist", () => {
        expect(parseAudioFiles("/nonexistent/path")).toEqual([]);
    });

    it("returns empty array when no audio files present", () => {
        expect(parseAudioFiles(publicDir)).toEqual([]);
    });

    it("ignores non-audio files", () => {
        fs.writeFileSync(path.join(publicDir, "video.mp4"), "");
        fs.writeFileSync(path.join(publicDir, "readme.txt"), "");
        expect(parseAudioFiles(publicDir)).toHaveLength(0);
    });

    it("parses epoch from filename correctly", () => {
        const epoch = 1700000000000;
        const filename = `audio_my_slug_${epoch}_abcd1234.mp3`;
        fs.writeFileSync(path.join(publicDir, filename), "");

        const files = parseAudioFiles(publicDir);
        expect(files).toHaveLength(1);
        expect(files[0].epoch).toBe(epoch);
        expect(files[0].name).toBe(filename);
    });

    it("sorts files newest-first by embedded epoch", () => {
        const epochs = [1700000001000, 1700000003000, 1700000002000];
        for (const e of epochs) {
            fs.writeFileSync(path.join(publicDir, `audio_slug_${e}_aaaa0000.mp3`), "");
        }

        const files = parseAudioFiles(publicDir);
        expect(files[0].epoch).toBe(1700000003000);
        expect(files[1].epoch).toBe(1700000002000);
        expect(files[2].epoch).toBe(1700000001000);
    });

    it("assigns epoch 0 to files with unparseable timestamps", () => {
        fs.writeFileSync(path.join(publicDir, "audio_badname.mp3"), "");
        const files = parseAudioFiles(publicDir);
        expect(files[0].epoch).toBe(0);
    });
});

// ─── pruneAudioFiles ──────────────────────────────────────────────────────────

describe("pruneAudioFiles", () => {
    let publicDir: string;

    beforeEach(() => {
        publicDir = makeTempDir();
    });

    afterEach(() => {
        fs.rmSync(publicDir, { recursive: true, force: true });
    });

    function makeEntry(epoch: number, name = `audio_slug_${epoch}_aaaa.mp3`): AudioFileEntry {
        const fullPath = path.join(publicDir, name);
        fs.writeFileSync(fullPath, "");
        return { name, fullPath, epoch };
    }

    it("deletes nothing when file count is within limit", () => {
        const files = [makeEntry(3000), makeEntry(2000), makeEntry(1000)];
        const cleaned = pruneAudioFiles(files, 10, 1000, 9999999);
        expect(cleaned).toBe(0);
        expect(fs.readdirSync(publicDir)).toHaveLength(3);
    });

    it("deletes old files beyond the keep limit", () => {
        const now = 1700000010000;
        const maxAgeMs = 5000; // 5 seconds
        // 3 recent files + 2 old files (beyond keep limit of 3)
        const files = [
            makeEntry(now - 1000), // recent
            makeEntry(now - 2000), // recent
            makeEntry(now - 3000), // recent — kept (index 2, within limit of 3)
            makeEntry(now - 6000), // old — beyond limit AND older than maxAge → delete
            makeEntry(now - 7000), // old — beyond limit AND older than maxAge → delete
        ];
        const cleaned = pruneAudioFiles(files, 3, maxAgeMs, now);
        expect(cleaned).toBe(2);
        expect(fs.readdirSync(publicDir)).toHaveLength(3);
    });

    it("does not delete files beyond limit that are still within maxAge", () => {
        const now = 1700000010000;
        const maxAgeMs = 60000; // 60 seconds
        const files = [
            makeEntry(now - 1000),
            makeEntry(now - 2000),
            makeEntry(now - 3000),
            makeEntry(now - 4000), // beyond limit but still young → keep
        ];
        const cleaned = pruneAudioFiles(files, 3, maxAgeMs, now);
        expect(cleaned).toBe(0);
        expect(fs.readdirSync(publicDir)).toHaveLength(4);
    });

    it("returns 0 when given an empty list", () => {
        expect(pruneAudioFiles([], 10, 1000)).toBe(0);
    });
});
