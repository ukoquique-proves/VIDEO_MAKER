import { TTSProvider, TTSResult, WordTimestamp } from "./TTSProvider";

interface GoogleTTSAudioConfig {
    audioEncoding: "MP3" | "OGG_OPUS" | "LINEAR16";
    speakingRate?: number;
    pitch?: number;
}

interface GoogleTTSVoice {
    languageCode: string;
    name?: string;
    ssmlGender?: "MALE" | "FEMALE" | "NEUTRAL";
}

interface GoogleTTSRequest {
    input: { text?: string; ssml?: string };
    voice: GoogleTTSVoice;
    audioConfig: GoogleTTSAudioConfig;
    enableTimePointing?: ["SSML_MARK"];
}

interface GoogleTTSTimepoint {
    markName: string;
    timeSeconds: number;
}

interface GoogleTTSResponse {
    audioContent: string; // base64
    timepoints?: GoogleTTSTimepoint[];
}

export class GoogleCloudTTSProvider implements TTSProvider {
    readonly name = "Google Cloud TTS";
    private apiKey: string;
    private voice: GoogleTTSVoice;
    private audioConfig: GoogleTTSAudioConfig;

    constructor() {
        const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
        if (!apiKey) {
            throw new Error("GOOGLE_CLOUD_API_KEY not set");
        }
        this.apiKey = apiKey;
        
        // Default: Standard voice (free tier)
        // Premium voices (WaveNet, Neural2) require paid plan
        this.voice = {
            languageCode: process.env.GOOGLE_CLOUD_LANGUAGE_CODE ?? "en-US",
            name: process.env.GOOGLE_CLOUD_VOICE_NAME ?? "en-US-Standard-C",
            ssmlGender: "FEMALE",
        };
        
        this.audioConfig = {
            audioEncoding: "MP3",
            speakingRate: parseFloat(process.env.GOOGLE_CLOUD_SPEAKING_RATE ?? "1.0"),
            pitch: parseFloat(process.env.GOOGLE_CLOUD_PITCH ?? "0.0"),
        };
    }

    async synthesize(text: string, segments?: string[]): Promise<TTSResult> {
        console.log(`   Using Google Cloud TTS voice: ${this.voice.name} (${this.voice.languageCode})`);

        // Use segments if provided to insert natural pauses
        const contentToSynthesize = segments && segments.length > 0
            ? segments.join(' <break time="1s"/> ')
            : text;

        const words = contentToSynthesize.split(/\s+/);
        const ssmlMarks: string[] = [];
        let markIndex = 0;

        // Build SSML with mark tags at word boundaries
        for (const word of words) {
            // Escape XML special characters in word
            const escapedWord = word
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&apos;");
            ssmlMarks.push(`${escapedWord}<mark name="w${markIndex}"/>`);
            markIndex++;
        }

        const ssmlText = `<speak>${ssmlMarks.join(" ")}</speak>`;

        const request: GoogleTTSRequest = {
            input: { ssml: ssmlText },
            voice: this.voice,
            audioConfig: this.audioConfig,
            enableTimePointing: ["SSML_MARK"],
        };

        const response = await fetch(
            `https://texttospeech.googleapis.com/v1/text:synthesize?key=${this.apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(request),
            }
        );

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Google Cloud TTS failed: ${response.status} ${error}`);
        }

        const data = await response.json() as GoogleTTSResponse;
        const audioBuffer = Buffer.from(data.audioContent, "base64");

        // Build transcript from timepoints
        const transcript: WordTimestamp[] = [];
        const timepoints = data.timepoints ?? [];

        // Warn if timepoints are missing — subtitles will use estimated timing
        if (timepoints.length === 0) {
            console.warn("╔════════════════════════════════════════════════════════════════╗");
            console.warn("║  ⚠️  WARNING: Google Cloud TTS returned NO timepoints         ║");
            console.warn("║                                                                ║");
            console.warn("║  Subtitles will use estimated 300ms/word timing and may be     ║");
            console.warn("║  desynchronized from audio.                                    ║");
            console.warn("║                                                                ║");
            console.warn("║  Possible causes:                                              ║");
            console.warn("║  • SSML marks not supported by this voice (try Standard voices) ║");
            console.warn("║  • enableTimePointing not set correctly                      ║");
            console.warn("║  • Text-to-Speech API not enabled in Google Cloud Console      ║");
            console.warn("║                                                                ║");
            console.warn("║  Workaround: Set ELEVENLABS_API_KEY for precise word timings   ║");
            console.warn("╚════════════════════════════════════════════════════════════════╝");
        }

        // Calculate approximate end times based on next word's start time
        // For the last word, estimate based on speaking rate
        const avgWordDuration = 0.3; // 300ms per word average

        for (let i = 0; i < words.length; i++) {
            const tp = timepoints.find(t => t.markName === `w${i}`);
            const startTime = tp?.timeSeconds ?? (i * avgWordDuration);
            
            // End time is next word's start time or estimated
            const nextTp = timepoints.find(t => t.markName === `w${i + 1}`);
            const endTime = nextTp?.timeSeconds ?? (startTime + avgWordDuration);

            transcript.push({
                word: words[i],
                startTime,
                endTime,
            });
        }

        return { audioBuffer, transcript };
    }
}
