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
     * @param segments Optional segments for better pause control
     * @returns Audio buffer and word-level timestamps
     */
    synthesize(text: string, segments?: string[]): Promise<TTSResult>;
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
    // Priority: Edge-TTS (Free/Unlimited) > Google Cloud TTS > Azure > Amazon Polly > ElevenLabs
    
    // Edge-TTS is now our primary free provider (no API key needed)
    try {
        const { EdgeTTSProvider } = await import("./EdgeTTSProvider");
        return new EdgeTTSProvider();
    } catch (e) {
        console.warn("   ⚠️  Edge-TTS not available, falling back to other providers.");
    }

    if (process.env.GOOGLE_CLOUD_API_KEY && process.env.GOOGLE_CLOUD_API_KEY !== "your_google_cloud_key_here") {
        const { GoogleCloudTTSProvider } = await import("./GoogleCloudTTSProvider");
        return new GoogleCloudTTSProvider();
    }

    if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_KEY !== "your_azure_speech_key_here" && process.env.AZURE_SPEECH_REGION) {
        const { AzureTTSProvider } = await import("./AzureTTSProvider");
        return new AzureTTSProvider();
    }

    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_ACCESS_KEY_ID !== "your_aws_access_key_here" && process.env.AWS_SECRET_ACCESS_KEY) {
        const { AmazonPollyTTSProvider } = await import("./AmazonPollyTTSProvider");
        return new AmazonPollyTTSProvider();
    }
    
    if (process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_API_KEY !== "your_elevenlabs_key_here") {
        const { ElevenLabsTTSProvider } = await import("./ElevenLabsTTSProvider");
        return new ElevenLabsTTSProvider();
    }
    
    return null;
}
