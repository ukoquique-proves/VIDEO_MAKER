import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { WordTimestamp } from "../Schema";

interface SubtitlesProps {
    transcript: WordTimestamp[];
    /** Font size in px. Default: 42 */
    fontSize?: number;
    /** Color for the active word. Default: #00FFFF (Cyan) */
    activeColor?: string;
    /** Color for inactive words. Default: #FFFFFF */
    inactiveColor?: string;
}

export const Subtitles: React.FC<SubtitlesProps> = ({
    transcript,
    fontSize = 42,
    activeColor = "#00FFFF",
    inactiveColor = "#FFFFFF",
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const currentTimeSec = frame / fps;

    // Find active word index
    const activeIndex = transcript.findIndex(
        (w) => currentTimeSec >= w.startTime && currentTimeSec < w.endTime
    );

    // Find the last word whose startTime has passed (most recently spoken)
    const lastSpokenIndex = transcript.reduce((best, w, i) => {
        return currentTimeSec >= w.startTime ? i : best;
    }, -1);

    const displayIndex = activeIndex !== -1 ? activeIndex : lastSpokenIndex;
    if (displayIndex === -1 || transcript.length === 0) return null;

    // Build a sentence window: show the 3 words before and 3 after display word
    const windowStart = Math.max(0, displayIndex - 3);
    const windowEnd = Math.min(transcript.length - 1, displayIndex + 5);
    const visibleWords = transcript.slice(windowStart, windowEnd + 1);

    if (visibleWords.length === 0) return null;

    return (
        <div style={styles.container}>
            <div style={styles.textWrapper}>
                {visibleWords.map((wordObj, i) => {
                    const globalIndex = windowStart + i;
                    const isActive = globalIndex === activeIndex;
                    const isPast = globalIndex < activeIndex;
                    return (
                        <span
                            key={globalIndex}
                            style={{
                                ...styles.word,
                                color: isActive
                                    ? activeColor
                                    : isPast
                                        ? "rgba(255,255,255,0.45)"
                                        : "rgba(255,255,255,0.25)",
                                fontSize,
                                transform: isActive ? "scale(1.08)" : "scale(1)",
                                display: "inline-block",
                                transition: "transform 0.1s",
                                textShadow: isActive
                                    ? `0 0 20px ${activeColor}88`
                                    : "0 2px 8px rgba(0,0,0,0.8)",
                            }}
                        >
                            {wordObj.word}{" "}
                        </span>
                    );
                })}
            </div>
        </div>
    );
};

const styles: Record<string, React.CSSProperties> = {
    container: {
        position: "absolute",
        bottom: 80,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "0 60px",
        zIndex: 100,
    },
    textWrapper: {
        background: "rgba(0, 0, 0, 0.55)",
        backdropFilter: "blur(8px)",
        borderRadius: 16,
        padding: "16px 28px",
        maxWidth: "90%",
        textAlign: "center",
        lineHeight: 1.5,
        border: "1px solid rgba(255,255,255,0.08)",
    },
    word: {
        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
        fontWeight: 700,
        letterSpacing: 0.3,
    },
};
