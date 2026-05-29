/**
 * TTS Provider Interface
 * Abstracts TTS services (ElevenLabs, Google Cloud TTS, etc.)
 */

export interface WordTimestamp {
    word: string;
    startTime: number;
    endTime: number;
}

export interface TTSResult {
    audioBuffer: Buffer;
    transcript: WordTimestamp[];
}

export interface TTSProvider {
    readonly name: string;
    /**
     * Generate audio from text with word-level timestamps
     * @param text The text to synthesize
     * @returns Audio buffer and word-level timestamps
     */
    synthesize(text: string): Promise<TTSResult>;
}

/**
 * Factory to create appropriate TTS provider based on available API keys
 * Priority chain (best free tier first):
 * 1. Google Cloud TTS (4M chars/month free)
 * 2. Azure Cognitive Services Speech (500K chars/month free)
 * 3. Amazon Polly (5M chars/month for 12 months)
 * 4. ElevenLabs (10K chars/month free, limited voices)
 */
export async function createTTSProvider(): Promise<TTSProvider | null> {
    // Priority: Google Cloud TTS (free tier) > Azure > Amazon Polly > ElevenLabs
    if (process.env.GOOGLE_CLOUD_API_KEY) {
        const { GoogleCloudTTSProvider } = await import("./GoogleCloudTTSProvider");
        return new GoogleCloudTTSProvider();
    }

    if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) {
        const { AzureTTSProvider } = await import("./AzureTTSProvider");
        return new AzureTTSProvider();
    }

    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        const { AmazonPollyTTSProvider } = await import("./AmazonPollyTTSProvider");
        return new AmazonPollyTTSProvider();
    }
    
    if (process.env.ELEVENLABS_API_KEY) {
        const { ElevenLabsTTSProvider } = await import("./ElevenLabsTTSProvider");
        return new ElevenLabsTTSProvider();
    }
    
    return null;
}
