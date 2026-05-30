import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate, Img, staticFile } from "remotion";

interface TitleCardProps {
    heading: string;
    subheading?: string;
    startFrame: number;
}

export const TitleCard: React.FC<TitleCardProps> = ({
    heading,
    subheading,
    startFrame,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const relFrame = Math.max(0, frame - startFrame);

    const titleScale = spring({
        frame: relFrame,
        fps,
        config: { stiffness: 100, damping: 10 },
    });

    const subOpacity = interpolate(relFrame, [15, 35], [0, 1], {
        extrapolateRight: "clamp",
        extrapolateLeft: "clamp",
    });

    return (
        <div style={styles.container}>
            {/* Neon accent line */}
            <div style={styles.accentLine} />

            <h1
                style={{
                    ...styles.heading,
                    transform: `scale(${titleScale})`,
                    transformOrigin: "center center",
                }}
            >
                {heading}
            </h1>

            {subheading && (
                <p style={{ ...styles.subheading, opacity: subOpacity }}>
                    {subheading}
                </p>
            )}

            {/* Bottom accent bar */}
            <div style={styles.bottomBar} />
        </div>
    );
};

// ─── Bullet list scene component ──────────────────────────────────────────────
interface BulletListProps {
    bullets: string[];
    startFrame: number;
}

export const BulletList: React.FC<BulletListProps> = ({
    bullets,
    startFrame,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    return (
        <div style={styles.bulletContainer}>
            {bullets.map((bullet, i) => {
                const relFrame = Math.max(0, frame - startFrame - i * 8);
                const itemSpring = spring({
                    frame: relFrame,
                    fps,
                    config: { stiffness: 120, damping: 12 },
                });
                const itemOpacity = Math.min(1, relFrame / 6);

                return (
                    <div
                        key={i}
                        style={{
                            ...styles.bulletItem,
                            transform: `translateX(${(1 - itemSpring) * -60}px)`,
                            opacity: itemOpacity,
                        }}
                    >
                        <span style={styles.bulletDot}>▸</span>
                        <span style={styles.bulletText}>{bullet}</span>
                    </div>
                );
            })}
        </div>
    );
};

// ─── Image scene component ──────────────────────────────────────────────────
interface ImageCardProps {
    imageUrl: string;
    caption?: string;
    startFrame: number;
}

export const ImageCard: React.FC<ImageCardProps> = ({
    imageUrl,
    caption,
    startFrame,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const relFrame = Math.max(0, frame - startFrame);

    const imageSpring = spring({
        frame: relFrame,
        fps,
        config: { stiffness: 100, damping: 15 },
    });

    const captionOpacity = interpolate(relFrame, [20, 40], [0, 1], {
        extrapolateRight: "clamp",
        extrapolateLeft: "clamp",
    });

    const src = imageUrl.startsWith("/") ? staticFile(imageUrl) : imageUrl;

    return (
        <div style={styles.imageContainer}>
            <div
                style={{
                    ...styles.imageWrapper,
                    transform: `scale(${0.9 + 0.1 * imageSpring})`,
                    opacity: imageSpring,
                }}
            >
                <Img
                    src={src}
                    style={styles.image}
                />
            </div>
            {caption && (
                <p style={{ ...styles.imageCaption, opacity: captionOpacity }}>
                    {caption}
                </p>
            )}
        </div>
    );
};

const styles: Record<string, React.CSSProperties> = {
    container: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "60px 80px",
    },
    accentLine: {
        width: 120,
        height: 4,
        background: "linear-gradient(90deg, #00FFFF, #39FF14)",
        borderRadius: 2,
        marginBottom: 32,
        boxShadow: "0 0 20px rgba(0,255,255,0.5)",
    },
    heading: {
        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
        fontSize: 72,
        fontWeight: 900,
        color: "#FFFFFF",
        textAlign: "center",
        lineHeight: 1.1,
        margin: 0,
        letterSpacing: -1,
        textShadow: "0 0 40px rgba(0,255,255,0.3)",
    },
    subheading: {
        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
        fontSize: 32,
        color: "rgba(255,255,255,0.65)",
        textAlign: "center",
        marginTop: 24,
        fontWeight: 400,
        letterSpacing: 0.5,
    },
    bottomBar: {
        width: 60,
        height: 2,
        background: "rgba(0,255,255,0.4)",
        borderRadius: 1,
        marginTop: 40,
    },
    bulletContainer: {
        display: "flex",
        flexDirection: "column",
        gap: 20,
        padding: "40px 60px",
        flex: 1,
        justifyContent: "center",
    },
    bulletItem: {
        display: "flex",
        alignItems: "flex-start",
        gap: 16,
    },
    bulletDot: {
        color: "#00FFFF",
        fontSize: 28,
        lineHeight: 1.4,
        flexShrink: 0,
    },
    bulletText: {
        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
        fontSize: 28,
        color: "#E6EDF3",
        lineHeight: 1.5,
        fontWeight: 500,
    },
    imageContainer: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "40px",
    },
    imageWrapper: {
        width: "80%",
        maxHeight: "70%",
        borderRadius: 24,
        overflow: "hidden",
        boxShadow: "0 20px 50px rgba(0,0,0,0.5), 0 0 20px rgba(0,255,255,0.2)",
        border: "1px solid rgba(255,255,255,0.1)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#0B0F19",
    },
    image: {
        width: "100%",
        height: "100%",
        objectFit: "contain",
    },
    imageCaption: {
        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
        fontSize: 32,
        color: "rgba(255,255,255,0.85)",
        textAlign: "center",
        marginTop: 32,
        fontWeight: 500,
        textShadow: "0 2px 10px rgba(0,0,0,0.5)",
    },
};
