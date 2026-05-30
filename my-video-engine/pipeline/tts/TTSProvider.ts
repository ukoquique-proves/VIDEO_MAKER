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
    transcriptSource?: string;
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
 * Factory to create a list of appropriate TTS providers based on available API keys.
 * We return an array to allow the caller to implement fallback logic if a provider
 * fails at runtime (e.g. network issues or missing local dependencies).
 */
export async function getAvailableTTSProviders(): Promise<TTSProvider[]> {
    const providers: TTSProvider[] = [];

    // 1. Edge-TTS (Free/Unlimited)
    try {
        const { EdgeTTSProvider } = await import("./EdgeTTSProvider");
        providers.push(new EdgeTTSProvider());
    } catch (e) {
        console.warn("   ⚠️  Edge-TTS dependency check failed (Python or edge-tts package missing).");
    }

    // 2. Google Cloud TTS
    if (process.env.GOOGLE_CLOUD_API_KEY && process.env.GOOGLE_CLOUD_API_KEY !== "your_google_cloud_key_here") {
        try {
            const { GoogleCloudTTSProvider } = await import("./GoogleCloudTTSProvider");
            providers.push(new GoogleCloudTTSProvider());
        } catch (e) {}
    }

    // 3. Azure
    if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_KEY !== "your_azure_speech_key_here" && process.env.AZURE_SPEECH_REGION) {
        try {
            const { AzureTTSProvider } = await import("./AzureTTSProvider");
            providers.push(new AzureTTSProvider());
        } catch (e) {}
    }

    // 4. Amazon Polly
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_ACCESS_KEY_ID !== "your_aws_access_key_here" && process.env.AWS_SECRET_ACCESS_KEY) {
        try {
            const { AmazonPollyTTSProvider } = await import("./AmazonPollyTTSProvider");
            providers.push(new AmazonPollyTTSProvider());
        } catch (e) {}
    }
    
    // 5. ElevenLabs
    if (process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_API_KEY !== "your_elevenlabs_key_here") {
        try {
            const { ElevenLabsTTSProvider } = await import("./ElevenLabsTTSProvider");
            providers.push(new ElevenLabsTTSProvider());
        } catch (e) {}
    }
    
    return providers;
}

/** Legacy helper - returns the first available provider */
export async function createTTSProvider(): Promise<TTSProvider | null> {
    const providers = await getAvailableTTSProviders();
    return providers.length > 0 ? providers[0] : null;
}
