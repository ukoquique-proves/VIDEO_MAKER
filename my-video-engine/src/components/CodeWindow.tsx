import React, { useEffect, useState } from "react";
import { useCurrentFrame, useVideoConfig, spring, delayRender, continueRender } from "remotion";
import { createHighlighter, type BundledLanguage, type BundledTheme } from "shiki";

// ─── Singleton Shiki highlighter ──────────────────────────────────────────────
let highlighterPromise: ReturnType<typeof createHighlighter> | null = null;

const getHighlighter = () => {
    if (!highlighterPromise) {
        highlighterPromise = createHighlighter({
            themes: ["github-dark"],
            langs: ["java", "typescript", "javascript", "python", "bash", "json", "tsx", "text"],
        });
        // Clear on error so HMR can retry (prevents stuck state in Remotion Studio)
        highlighterPromise.catch(() => { highlighterPromise = null; });
    }
    return highlighterPromise;
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface Token {
    content: string;
    color: string;
}

interface CodeWindowProps {
    code: string;
    language: BundledLanguage;
    title?: string;
    /** Frame at which this component was first mounted (for typing animation) */
    startFrame: number;
    /** How many frames to take to fully type out the code (default: 90) */
    typingDurationFrames?: number;
}

// ─── Parse Shiki HTML → token array ──────────────────────────────────────────
const parseShikiTokens = (html: string): Token[] => {
    const tokens: Token[] = [];
    const spanRegex = /<span style="color: ?([^"]+)">([\s\S]*?)<\/span>/g;
    let match;
    while ((match = spanRegex.exec(html)) !== null) {
        const text = match[2]
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");
        tokens.push({ color: match[1], content: text });
    }
    return tokens;
};

// ─── Inject blink keyframe ────────────────────────────────────────────────────
if (typeof document !== "undefined") {
    const styleId = "cw-blink-keyframe";
    if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`;
        document.head.appendChild(style);
    }
}

// ─── CodeWindow Component ─────────────────────────────────────────────────────
export const CodeWindow: React.FC<CodeWindowProps> = ({
    code,
    language,
    title,
    startFrame,
    typingDurationFrames = 90,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const [tokens, setTokens] = useState<Token[]>([]);

    // Spring pop-in animation (stiffness: 200, damping: 15 as per spec)
    const relativeFrame = Math.max(0, frame - startFrame);
    const scale = spring({
        frame: relativeFrame,
        fps,
        config: { stiffness: 200, damping: 15 },
    });
    const opacity = Math.min(1, relativeFrame / 5);

    // Typing progress: 0 → 1 over typingDurationFrames.
    // Use decoded token length as the source of truth so visibleChars aligns
    // with what renderTokens actually walks — raw code length diverges whenever
    // HTML entities (&lt; &gt; &amp; etc.) appear in the Shiki output.
    const typingProgress = Math.min(1, relativeFrame / typingDurationFrames);
    const decodedLength = tokens.length > 0
        ? tokens.reduce((sum, t) => sum + t.content.length, 0)
        : code.length;
    const visibleChars = Math.floor(decodedLength * typingProgress);

    // Load Shiki tokens — use delayRender so Remotion waits for the Promise
    // before capturing any frames, guaranteeing syntax-highlighted output.
    useEffect(() => {
        let cancelled = false;
        const handle = delayRender("Loading Shiki highlighter");
        getHighlighter().then((hl) => {
            if (!cancelled) {
                const html = hl.codeToHtml(code, {
                    lang: language as BundledLanguage,
                    theme: "github-dark" as BundledTheme,
                });
                setTokens(parseShikiTokens(html));
            }
            continueRender(handle);
        }).catch((err) => {
            console.error("Shiki failed to load:", err);
            continueRender(handle);
        });
        return () => { cancelled = true; };
    }, [code, language]);

    // Build visible token content from character count
    const renderTokens = () => {
        if (tokens.length === 0) {
            return (
                <span style={{ color: "#e6edf3" }}>
                    {code.substring(0, visibleChars)}
                    <span style={styles.cursor} />
                </span>
            );
        }
        let charsRendered = 0;
        const rendered: React.ReactNode[] = [];
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (charsRendered >= visibleChars) break;
            const available = visibleChars - charsRendered;
            const slice = token.content.substring(0, available);
            rendered.push(
                <span key={i} style={{ color: token.color }}>
                    {slice}
                </span>
            );
            charsRendered += slice.length;
        }
        if (typingProgress < 1) {
            rendered.push(<span key="cursor" style={styles.cursor} />);
        }
        return rendered;
    };

    return (
        <div style={{ ...styles.wrapper, transform: `scale(${scale})`, opacity }}>
            {/* Terminal chrome */}
            <div style={styles.titleBar}>
                <div style={styles.trafficLights}>
                    <div style={{ ...styles.dot, background: "#FF5F56" }} />
                    <div style={{ ...styles.dot, background: "#FFBD2E" }} />
                    <div style={{ ...styles.dot, background: "#27C93F" }} />
                </div>
                <span style={styles.titleText}>{title ?? language}</span>
                <div style={{ width: 56 }} />
            </div>
            {/* Code area */}
            <div style={styles.codeBody}>
                <pre style={styles.pre}>
                    <code>{renderTokens()}</code>
                </pre>
            </div>
        </div>
    );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
    wrapper: {
        borderRadius: 12,
        overflow: "hidden",
        background: "rgba(13, 17, 23, 0.85)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(0, 255, 255, 0.2)",
        boxShadow: "0 0 40px rgba(0, 255, 255, 0.08), 0 20px 60px rgba(0,0,0,0.7)",
        transformOrigin: "center center",
    },
    titleBar: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 16px",
        background: "rgba(255,255,255,0.04)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
    },
    trafficLights: {
        display: "flex",
        gap: 8,
    },
    dot: {
        width: 12,
        height: 12,
        borderRadius: "50%",
    },
    titleText: {
        color: "rgba(255,255,255,0.5)",
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        letterSpacing: 1,
    },
    codeBody: {
        padding: "20px 24px",
        overflowX: "hidden",
    },
    pre: {
        margin: 0,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
        fontSize: 16,
        lineHeight: 1.7,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
    },
    cursor: {
        display: "inline-block",
        width: 2,
        height: "1em",
        background: "#00FFFF",
        verticalAlign: "text-bottom",
        marginLeft: 2,
        animation: "blink 1s step-start infinite",
    },
};
