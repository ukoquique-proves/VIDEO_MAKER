import React from "react";
import { AbsoluteFill, Audio, Sequence, useVideoConfig, staticFile } from "remotion";
import { VideoData, toFrames } from "./Schema";
import { Camera } from "./components/Camera";
import { CodeWindow } from "./components/CodeWindow";
import { Subtitles } from "./components/Subtitles";
import { TitleCard, BulletList } from "./components/SceneComponents";
import { ChapterProgress } from "./components/ChapterProgress";
import { type BundledLanguage } from "shiki";

// ─── Background: animated grid ────────────────────────────────────────────────
const GridBackground: React.FC = () => (
    <AbsoluteFill
        style={{
            background: "#0D1117",
            backgroundImage: `
        linear-gradient(rgba(0,255,255,0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0,255,255,0.04) 1px, transparent 1px)
      `,
            backgroundSize: "60px 60px",
        }}
    />
);

// ─── Orchestrator ──────────────────────────────────────────────────────────────
export const Orchestrator: React.FC<VideoData> = ({
    audioUrl,
    transcript,
    codeSnippets,
    scenes,
    durationSeconds,
    showProgressBar,
    // durationSeconds is also consumed by the Composition wrapper in index.tsx via calculateDuration()
}) => {
    const { fps } = useVideoConfig();

    return (
        <AbsoluteFill style={{ background: "#0D1117" }}>
            {/* Background */}
            <GridBackground />

            {/* Audio track */}
            {audioUrl && audioUrl.length > 0 && (
                <Audio src={audioUrl.startsWith("/") ? staticFile(audioUrl) : audioUrl} />
            )}

            {/* Camera wrapper around all content */}
            <Camera zoomLevel={1.02} shakeIntensity={0}>
                <AbsoluteFill>
                    {/* ── Map scenes to Remotion Sequences ── */}
                    {scenes.map((scene, i) => {
                        const from = toFrames(scene.startTime, fps);
                        const duration = toFrames(scene.endTime - scene.startTime, fps);

                        if (scene.type === "title") {
                            return (
                                <Sequence key={`${scene.type}-${scene.startTime}`} from={from} durationInFrames={duration}>
                                    <AbsoluteFill style={sceneStyles.centered}>
                                        <TitleCard
                                            heading={scene.heading}
                                            subheading={scene.subheading}
                                            startFrame={0}
                                        />
                                    </AbsoluteFill>
                                </Sequence>
                            );
                        }

                        if (scene.type === "code") {
                            const snippet = codeSnippets[scene.snippetIndex];
                            if (!snippet) {
                                console.warn(`Orchestrator: code scene at ${scene.startTime}s has snippetIndex ${scene.snippetIndex} out of range (max: ${codeSnippets.length - 1})`);
                                return null;
                            }
                            return (
                                <Sequence key={`${scene.type}-${scene.startTime}`} from={from} durationInFrames={duration}>
                                    <AbsoluteFill style={sceneStyles.padded}>
                                        <CodeWindow
                                            code={snippet.code}
                                            language={snippet.language as BundledLanguage}
                                            title={snippet.title}
                                            startFrame={0}
                                            typingDurationFrames={Math.min(duration - 10, 90)}
                                        />
                                    </AbsoluteFill>
                                </Sequence>
                            );
                        }

                        if (scene.type === "split") {
                            const snippet = codeSnippets[scene.snippetIndex];
                            if (!snippet) {
                                console.warn(`Orchestrator: split scene at ${scene.startTime}s has snippetIndex ${scene.snippetIndex} out of range (max: ${codeSnippets.length - 1})`);
                                return null;
                            }
                            return (
                                <Sequence key={`${scene.type}-${scene.startTime}`} from={from} durationInFrames={duration}>
                                    <AbsoluteFill style={sceneStyles.splitLayout}>
                                        {/* Left: code */}
                                        <div style={sceneStyles.splitLeft}>
                                            <CodeWindow
                                                code={snippet.code}
                                                language={snippet.language as BundledLanguage}
                                                title={snippet.title}
                                                startFrame={0}
                                                typingDurationFrames={Math.min(duration - 10, 90)}
                                            />
                                        </div>
                                        {/* Right: bullets */}
                                        <div style={sceneStyles.splitRight}>
                                            <BulletList bullets={scene.bullets} startFrame={0} />
                                        </div>
                                    </AbsoluteFill>
                                </Sequence>
                            );
                        }

                        return null;
                    })}

                    {/* ── Global subtitles overlay ── */}
                    <Subtitles transcript={transcript} fontSize={38} />

                    {showProgressBar !== false && (
                        <ChapterProgress
                            scenes={scenes}
                            codeSnippets={codeSnippets}
                            durationSeconds={durationSeconds}
                        />
                    )}
                </AbsoluteFill>
            </Camera>
        </AbsoluteFill>
    );
};

const sceneStyles: Record<string, React.CSSProperties> = {
    centered: {
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
    },
    padded: {
        padding: "80px 60px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
    },
    splitLayout: {
        display: "flex",
        flexDirection: "row",
        padding: "60px 40px",
        gap: 40,
    },
    splitLeft: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
    },
    splitRight: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
    },
};
