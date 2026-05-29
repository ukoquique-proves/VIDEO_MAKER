import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { VideoData } from "../Schema";
import { chapterLabel, getTimelineDurationSeconds } from "../Schema";

type ChapterProgressProps = Pick<VideoData, "scenes" | "codeSnippets" | "durationSeconds">;

export const ChapterProgress: React.FC<ChapterProgressProps> = ({
    scenes,
    codeSnippets,
    durationSeconds,
}) => {
    const frame = useCurrentFrame();
    const { durationInFrames, fps } = useVideoConfig();

    const totalSec = getTimelineDurationSeconds(scenes, durationSeconds);
    const progress = Math.min(1, Math.max(0, durationInFrames > 1 ? frame / (durationInFrames - 1) : 0));
    const currentSec = frame / fps;

    // Find active scene for label display (prevents overlapping labels)
    const activeScene = scenes.find(
        (scene) => currentSec >= scene.startTime && currentSec < scene.endTime
    ) ?? scenes[0];

    return (
        <div style={styles.wrap} aria-hidden>
            <div style={styles.labelsRow}>
                {activeScene ? (
                    (() => {
                        const label = chapterLabel(activeScene, codeSnippets);
                        if (!label) return null;
                        const left = `${(activeScene.startTime / totalSec) * 100}%`;
                        return (
                            <span
                                key={`${activeScene.type}-${activeScene.startTime}`}
                                style={{
                                    ...styles.chapterLabel,
                                    ...styles.chapterLabelActive,
                                    left,
                                }}
                            >
                                {label.length > 18 ? `${label.slice(0, 16)}…` : label}
                            </span>
                        );
                    })()
                ) : null}
            </div>
            <div style={styles.track}>
                <div style={{ ...styles.fill, width: `${progress * 100}%` }} />
                {scenes.map((scene) => (
                    <div
                        key={`tick-${scene.type}-${scene.startTime}`}
                        style={{
                            ...styles.tick,
                            left: `${(scene.startTime / totalSec) * 100}%`,
                        }}
                    />
                ))}
            </div>
        </div>
    );
};

const styles: Record<string, React.CSSProperties> = {
    wrap: {
        position: "absolute",
        bottom: 0,
        left: 40,
        right: 40,
        zIndex: 90,
        pointerEvents: "none",
    },
    labelsRow: {
        position: "relative",
        height: 22,
        marginBottom: 6,
    },
    chapterLabel: {
        position: "absolute",
        transform: "translateX(-50%)",
        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
        fontSize: 11,
        fontWeight: 600,
        color: "rgba(255,255,255,0.55)",
        textTransform: "uppercase",
        letterSpacing: 0.8,
        maxWidth: 120,
        textAlign: "center",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    chapterLabelActive: {
        color: "rgba(255,255,255,0.95)",
    },
    track: {
        position: "relative",
        height: 4,
        borderRadius: 2,
        background: "rgba(255,255,255,0.1)",
        overflow: "visible",
    },
    fill: {
        height: "100%",
        borderRadius: 2,
        background: "linear-gradient(90deg, rgba(0,255,255,0.85) 0%, rgba(57,255,20,0.75) 100%)",
        boxShadow: "0 0 12px rgba(0,255,255,0.35)",
    },
    tick: {
        position: "absolute",
        top: -6,
        width: 2,
        height: 14,
        marginLeft: -1,
        background: "rgba(0,255,255,0.9)",
        borderRadius: 1,
        boxShadow: "0 0 6px rgba(0,255,255,0.5)",
    },
};
