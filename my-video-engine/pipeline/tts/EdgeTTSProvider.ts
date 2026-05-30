import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { TTSProvider, TTSResult, WordTimestamp } from "./TTSProvider";

export class EdgeTTSProvider implements TTSProvider {
    readonly name = "EdgeTTS";
    private voice: string;

    constructor() {
        // Default to a neutral/friendly Spanish voice (es-AR-TomasNeural or es-ES-AlvaroNeural)
        // Since Pedro is in Uruguay, es-AR (Argentine) is linguistically closest.
        this.voice = process.env.EDGE_TTS_VOICE ?? "es-AR-TomasNeural";
    }

    async synthesize(text: string): Promise<TTSResult> {
        console.log(`   Using Edge-TTS voice: ${this.voice}`);
        
        const tempAudioPath = path.join(process.cwd(), `temp_edge_tts_${Date.now()}.mp3`);
        
        try {
            // Call the python edge-tts CLI
            // edge-tts --voice es-AR-TomasNeural --text "Hola" --write-media out.mp3
            const result = spawnSync("edge-tts", [
                "--voice", this.voice,
                "--text", text,
                "--write-media", tempAudioPath
            ]);

            if (result.status !== 0) {
                throw new Error(`Edge-TTS failed: ${result.stderr.toString()}`);
            }

            const audioBuffer = fs.readFileSync(tempAudioPath);
            
            // Clean up temp file
            if (fs.existsSync(tempAudioPath)) {
                fs.unlinkSync(tempAudioPath);
            }

            // Edge-TTS CLI doesn't provide word-level timestamps easily in one call.
            // We'll use the same estimation logic as ElevenLabs fallback for now.
            const words = text.split(/\s+/).filter(w => w.length > 0);
            const avgWordDuration = 0.22; // Spanish tends to be slightly slower than English per word
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

            console.warn(`   ⚠️  Edge-TTS (Free) active. Using estimated timing: ${Math.round(avgWordDuration * 1000)}ms/word`);
            return { audioBuffer, transcript };

        } catch (error) {
            if (fs.existsSync(tempAudioPath)) {
                fs.unlinkSync(tempAudioPath);
            }
            throw error;
        }
    }
}
