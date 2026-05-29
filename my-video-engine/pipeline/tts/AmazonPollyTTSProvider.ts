/**
 * Amazon Polly TTS Provider
 * Neural and Standard voices with SSML mark support
 * Free tier: 5 million characters/month for 12 months
 */

import { PollyClient, SynthesizeSpeechCommand, SynthesizeSpeechCommandInput, Engine } from "@aws-sdk/client-polly";
import { TTSProvider, TTSResult, WordTimestamp } from "./TTSProvider";

interface AmazonPollyConfig {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    voiceId: string;
    engine: Engine; // "neural" | "standard"
    languageCode: string;
}

export class AmazonPollyTTSProvider implements TTSProvider {
    readonly name = "Amazon Polly";
    private config: AmazonPollyConfig;
    private client: PollyClient;

    constructor() {
        const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
        const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
        const region = process.env.AWS_REGION ?? "us-east-1";
        const voiceId = process.env.AWS_POLLY_VOICE_ID ?? "Joanna";
        const engine = (process.env.AWS_POLLY_ENGINE as Engine) ?? "neural";
        const languageCode = process.env.AWS_POLLY_LANGUAGE_CODE ?? "en-US";

        if (!accessKeyId || !secretAccessKey) {
            throw new Error("Amazon Polly requires AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables");
        }

        this.config = { accessKeyId, secretAccessKey, region, voiceId, engine, languageCode };

        this.client = new PollyClient({
            region: this.config.region,
            credentials: {
                accessKeyId: this.config.accessKeyId,
                secretAccessKey: this.config.secretAccessKey,
            },
        });
    }

    async synthesize(text: string): Promise<TTSResult> {
        // Build SSML with word-level marks for timing
        // Amazon Polly supports <mark name="..."/> for speech synthesis markers
        const words = text.split(/\s+/).filter(w => w.length > 0);
        let ssmlText = `<speak>`;
        
        // Add word-level marks
        words.forEach((word, i) => {
            ssmlText += `<mark name="w${i}"/>${this.escapeXml(word)} `;
        });
        
        ssmlText += `</speak>`;

        // Configure synthesis request
        const params: SynthesizeSpeechCommandInput = {
            Engine: this.config.engine,
            LanguageCode: this.config.languageCode,
            OutputFormat: "mp3",
            Text: ssmlText,
            TextType: "ssml",
            VoiceId: this.config.voiceId,
        };

        try {
            const command = new SynthesizeSpeechCommand(params);
            const response = await this.client.send(command);

            // Get audio buffer from response
            const audioBuffer = await this.streamToBuffer(response.AudioStream);

            // Build transcript from word marks
            // Note: Amazon Polly returns marks in a separate stream (not currently implemented)
            // Using estimated timing as fallback
            const transcript = this.buildTranscriptFromWords(words, audioBuffer.length);

            return { audioBuffer, transcript };
        } catch (error) {
            throw new Error(`Amazon Polly synthesis failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async streamToBuffer(stream: ReadableStream<Uint8Array> | Blob | undefined): Promise<Buffer> {
        if (!stream) {
            throw new Error("No audio stream received from Amazon Polly");
        }

        // Handle different stream types
        if (stream instanceof Blob) {
            const arrayBuffer = await stream.arrayBuffer();
            return Buffer.from(arrayBuffer);
        }

        // Handle ReadableStream
        const reader = stream.getReader();
        const chunks: Uint8Array[] = [];
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }

        // Concatenate chunks
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }

        return Buffer.from(result);
    }

    private buildTranscriptFromWords(words: string[], audioByteLength: number): WordTimestamp[] {
        const transcript: WordTimestamp[] = [];
        
        // Estimate duration based on audio size (MP3 ~16KB per second at 128kbps)
        const estimatedDurationSeconds = audioByteLength / 16000;
        const avgWordDuration = estimatedDurationSeconds / words.length;

        for (let i = 0; i < words.length; i++) {
            const startTime = i * avgWordDuration;
            const endTime = (i + 1) * avgWordDuration;

            transcript.push({
                word: words[i],
                startTime,
                endTime,
            });
        }

        // Warn about estimated timing
        console.warn("⚠️  Amazon Polly: Using estimated word timing.");
        console.warn("   For precise timestamps, implement separate mark stream parsing from Polly response.");

        return transcript;
    }

    private escapeXml(text: string): string {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
    }
}
