/**
 * Integration tests for TTS Provider architecture
 */

import { createTTSProvider, getAvailableTTSProviders } from "../TTSProvider";

describe("TTS Provider Factory", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
        delete process.env.GOOGLE_CLOUD_API_KEY;
        delete process.env.ELEVENLABS_API_KEY;
        delete process.env.AZURE_SPEECH_KEY;
        delete process.env.AZURE_SPEECH_REGION;
        delete process.env.AWS_ACCESS_KEY_ID;
        delete process.env.AWS_SECRET_ACCESS_KEY;
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it("should always include EdgeTTS as the first provider (no API key required)", async () => {
        const providers = await getAvailableTTSProviders();
        expect(providers.length).toBeGreaterThanOrEqual(1);
        expect(providers[0].name).toBe("EdgeTTS");
    });

    it("createTTSProvider returns EdgeTTS even with no API keys configured", async () => {
        const provider = await createTTSProvider();
        expect(provider).not.toBeNull();
        expect(provider?.name).toBe("EdgeTTS");
    });

    it("should include Google Cloud TTS after EdgeTTS when key is set", async () => {
        process.env.GOOGLE_CLOUD_API_KEY = "test-google-key";

        const providers = await getAvailableTTSProviders();
        const names = providers.map((p) => p.name);
        expect(names[0]).toBe("EdgeTTS");
        expect(names).toContain("Google Cloud TTS");
        expect(names.indexOf("EdgeTTS")).toBeLessThan(names.indexOf("Google Cloud TTS"));
    });

    it("should include ElevenLabs after EdgeTTS when key is set", async () => {
        process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";

        const providers = await getAvailableTTSProviders();
        const names = providers.map((p) => p.name);
        expect(names[0]).toBe("EdgeTTS");
        expect(names).toContain("ElevenLabs");
    });

    it("should include both Google Cloud TTS and ElevenLabs when both keys are set, Google before ElevenLabs", async () => {
        process.env.GOOGLE_CLOUD_API_KEY = "test-google-key";
        process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";

        const providers = await getAvailableTTSProviders();
        const names = providers.map((p) => p.name);
        expect(names).toContain("Google Cloud TTS");
        expect(names).toContain("ElevenLabs");
        expect(names.indexOf("Google Cloud TTS")).toBeLessThan(names.indexOf("ElevenLabs"));
    });
});
