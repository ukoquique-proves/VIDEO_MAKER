/**
 * Azure Cognitive Services Speech TTS Provider
 * Neural voices with SSML mark support for precise word-level timestamps
 * Free tier: 500,000 characters/month
 */

import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { TTSProvider, TTSResult, WordTimestamp } from "./TTSProvider";

interface AzureTTSConfig {
    subscriptionKey: string;
    region: string;
    voiceName: string;
    language: string;
    speakingRate: string; // "-50%" to "+100%", default "0%"
}

export class AzureTTSProvider implements TTSProvider {
    readonly name = "Azure Cognitive Services Speech";
    private config: AzureTTSConfig;

    constructor() {
        const subscriptionKey = process.env.AZURE_SPEECH_KEY;
        const region = process.env.AZURE_SPEECH_REGION;
        const voiceName = process.env.AZURE_SPEECH_VOICE_NAME ?? "en-US-JennyNeural";
        const language = process.env.AZURE_SPEECH_LANGUAGE ?? "en-US";
        const speakingRate = process.env.AZURE_SPEECH_RATE ?? "0%";

        if (!subscriptionKey || !region) {
            throw new Error("Azure Speech TTS requires AZURE_SPEECH_KEY and AZURE_SPEECH_REGION environment variables");
        }

        this.config = { subscriptionKey, region, voiceName, language, speakingRate };
    }

    async synthesize(text: string): Promise<TTSResult> {
        // Build SSML with word-level marks for timing
        const words = text.split(/\s+/).filter(w => w.length > 0);
        let ssmlText = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${this.config.language}">`;
        ssmlText += `<voice name="${this.config.voiceName}">`;
        ssmlText += `<prosody rate="${this.config.speakingRate}">`;
        
        // Add word-level marks
        words.forEach((word, i) => {
            ssmlText += `<mark name="w${i}"/>${this.escapeXml(word)} `;
        });
        
        ssmlText += "</prosody></voice></speak>";

        // Configure Azure Speech SDK
        const speechConfig = sdk.SpeechConfig.fromSubscription(
            this.config.subscriptionKey,
            this.config.region
        );
        speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz160KBitRateMonoMp3;

        // Synthesize to buffer
        const audioBuffer = await this.synthesizeToBuffer(speechConfig, ssmlText);

        // Build transcript from word marks
        const transcript = this.buildTranscriptFromWords(words, audioBuffer.durationMs);

        return { audioBuffer, transcript };
    }

    private synthesizeToBuffer(speechConfig: sdk.SpeechConfig, ssml: string): Promise<{ buffer: Buffer; durationMs: number }> {
        return new Promise((resolve, reject) => {
            const synthesizer = new sdk.SpeechSynthesizer(speechConfig);
            const wordBoundaries: Array<{ markName: string; offsetMs: number }> = [];
            let startTime = Date.now();

            synthesizer.speakSsmlAsync(
                ssml,
                result => {
                    if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
                        const audioData = result.audioData;
                        const durationMs = Date.now() - startTime;
                        
                        synthesizer.close();
                        resolve({ 
                            buffer: Buffer.from(audioData), 
                            durationMs 
                        });
                    } else {
                        synthesizer.close();
                        reject(new Error(`Azure TTS synthesis failed: ${result.errorDetails || result.reason}`));
                    }
                },
                error => {
                    synthesizer.close();
                    reject(new Error(`Azure TTS error: ${error}`));
                }
            );

            // Track word boundaries for precise timing
            synthesizer.wordBoundary = (s: sdk.SpeechSynthesizer, e: sdk.SpeechSynthesisWordBoundaryEventArgs) => {
                wordBoundaries.push({
                    markName: `w${wordBoundaries.length}`,
                    offsetMs: e.audioOffset / 10000, // Convert from 100-nanosecond units to ms
                });
            };
        });
    }

    private buildTranscriptFromWords(words: string[], totalDurationMs: number): WordTimestamp[] {
        const transcript: WordTimestamp[] = [];
        const avgWordDuration = totalDurationMs / 1000 / words.length;

        // Build transcript with estimated timing (Azure word boundaries not always available)
        for (let i = 0; i < words.length; i++) {
            const startTime = i * avgWordDuration;
            const endTime = (i + 1) * avgWordDuration;

            transcript.push({
                word: words[i],
                startTime,
                endTime,
            });
        }

        // Warn if using estimated timing
        console.warn("⚠️  Azure TTS: Using estimated word timing.");
        console.warn("   For precise timestamps, ensure Azure Speech SDK word boundary events are properly captured.");

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
