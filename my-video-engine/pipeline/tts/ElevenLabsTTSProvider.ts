import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { TTSProvider, TTSResult, WordTimestamp } from "./TTSProvider";

export class ElevenLabsTTSProvider implements TTSProvider {
    readonly name = "ElevenLabs";
    private client: ElevenLabsClient;
    private voiceId: string;

    constructor() {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
            throw new Error("ELEVENLABS_API_KEY not set");
        }
        this.client = new ElevenLabsClient({ apiKey });
        // Standard pre-made voice IDs (usually safe for free tier)
        // Bella: EXAVITQu4vr4xnSDxMaL
        // Antoni: AZnzlk1XhxPoo8BVmuRr
        // Rachel: 21m00Tcm4TlvDq8ikWAM
        this.voiceId = process.env.ELEVENLABS_VOICE_ID ?? "EXAVITQu4vr4xnSDxMaL"; 
    }

    async synthesize(text: string): Promise<TTSResult> {
        console.log(`   Using ElevenLabs voice: ${this.voiceId}`);

        // Try timestamps endpoint first (for paid plans or compatible voices)
        try {
            const response = await this.client.textToSpeech.convertWithTimestamps(
                this.voiceId,
                {
                    text,
                    modelId: "eleven_multilingual_v2",
                    voiceSettings: { stability: 0.5, similarityBoost: 0.8 },
                }
            );

            // Write MP3
            const audioBuffer = Buffer.from(response.audioBase64!, "base64");

            // Rebuild transcript from character-level timestamps
            if (!response.alignment) {
                throw new Error("ElevenLabs response missing alignment data.");
            }

            const { characters, characterStartTimesSeconds, characterEndTimesSeconds } = response.alignment;
            const transcript: WordTimestamp[] = [];
            let wordChars: string[] = [];
            let wordStart = 0;
            let wordEnd = 0;

            for (let i = 0; i < characters.length; i++) {
                const ch = characters[i];
                const isLast = i === characters.length - 1;

                if (ch !== ' ') {
                    if (wordChars.length === 0) wordStart = characterStartTimesSeconds[i];
                    wordChars.push(ch);
                    wordEnd = characterEndTimesSeconds[i];
                }

                if (ch === ' ' || isLast) {
                    if (wordChars.length > 0) {
                        transcript.push({
                            word: wordChars.join(""),
                            startTime: wordStart,
                            endTime: wordEnd,
                        });
                        wordChars = [];
                    }
                }
            }

            console.log("   ✅ Using ElevenLabs precise word timestamps");
            return { audioBuffer, transcript };

        } catch (error: any) {
            // If 402 payment required or specific paid_plan_required error, fall back to standard endpoint with estimated timing
            const isPaymentRequired = 
                (error.statusCode === 402) || 
                (error.body?.detail?.type === "payment_required") ||
                (error.message && error.message.includes("402"));

            if (isPaymentRequired) {
                console.warn("   ⚠️  ElevenLabs timestamps require paid plan. Falling back to standard synthesis with estimated timing.");
                return this.synthesizeWithEstimation(text);
            }
            console.error("   ❌ ElevenLabs synthesis failed:", error.body?.detail?.message || error.message);
            throw error;
        }
    }

    private async synthesizeWithEstimation(text: string): Promise<TTSResult> {
        // Use standard convert endpoint (works on free tier)
        const audioStream = await this.client.textToSpeech.convert(
            this.voiceId,
            {
                text,
                modelId: "eleven_multilingual_v2",
                voiceSettings: { stability: 0.5, similarityBoost: 0.8 },
                outputFormat: "mp3_44100_128",
            }
        );

        // Convert stream to buffer
        const chunks: Uint8Array[] = [];
        const reader = (audioStream as unknown as ReadableStream<Uint8Array>).getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) chunks.push(value);
        }
        // Concatenate all chunks into a single Uint8Array, then convert to Buffer
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        const audioBuffer = Buffer.from(result);

        // Estimate timing: ~150ms per word average for natural speech
        const words = text.split(/\s+/).filter(w => w.length > 0);
        const avgWordDuration = 0.15; // 150ms per word
        const transcript: WordTimestamp[] = [];

        for (let i = 0; i < words.length; i++) {
            const startTime = i * avgWordDuration;
            const endTime = (i + 1) * avgWordDuration;
            transcript.push({
                word: words[i],
                startTime,
                endTime,
            });
        }

        console.warn(`   ⚠️  Using estimated timing: ${avgWordDuration * 1000}ms/word (subtitles may be slightly off)`);
        return { audioBuffer, transcript };
    }
}
