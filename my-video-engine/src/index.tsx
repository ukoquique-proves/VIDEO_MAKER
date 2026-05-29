import React from "react";
import { Composition, registerRoot } from "remotion";
import { Orchestrator } from "./Orchestrator";
import { VideoData, getDurationSeconds, toFrames } from "./Schema";

// ─── Default demo props for Remotion Studio preview ───────────────────────────
const defaultProps: VideoData = {
    audioUrl: "",
    transcript: [
        { word: "Hello", startTime: 0.5, endTime: 0.9 },
        { word: "World", startTime: 0.95, endTime: 1.4 },
        { word: "from", startTime: 1.45, endTime: 1.7 },
        { word: "Java!", startTime: 1.75, endTime: 2.3 },
        { word: "This", startTime: 3.0, endTime: 3.3 },
        { word: "is", startTime: 3.35, endTime: 3.5 },
        { word: "your", startTime: 3.55, endTime: 3.85 },
        { word: "automated", startTime: 3.9, endTime: 4.4 },
        { word: "video", startTime: 4.45, endTime: 4.75 },
        { word: "engine.", startTime: 4.8, endTime: 5.4 },
    ],
    codeSnippets: [
        {
            language: "java",
            code: `public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}`,
            title: "HelloWorld.java",
            startTime: 5,
            endTime: 20,
        },
        {
            language: "java",
            code: `// Add a method
public static String greet(String name) {
    return "Hello, " + name + "!";
}`,
            title: "HelloWorld.java",
            startTime: 20,
            endTime: 30,
        },
    ],
    scenes: [
        {
            type: "title",
            startTime: 0,
            endTime: 5,
            heading: "Java Hello World",
            subheading: "The classic program — explained",
        },
        {
            type: "code",
            startTime: 5,
            endTime: 20,
            snippetIndex: 0,
        },
        {
            type: "split",
            startTime: 20,
            endTime: 30,
            snippetIndex: 1,
            bullets: [
                "Methods accept parameters",
                "String concatenation with +",
                "return ends the method",
            ],
        },
    ],
    durationSeconds: 30,
};

const calculateDuration = (props: VideoData, fps: number): number =>
    toFrames(getDurationSeconds(props), fps);

// ─── Dynamic duration calculator ────────────────────────────────────────────────
const calculateDurationFromProps = (props: VideoData, fps: number): number => {
    const duration = getDurationSeconds(props);
    return toFrames(duration, fps);
};

// ─── Register compositions ─────────────────────────────────────────────────────
export const RemotionRoot: React.FC = () => {
    const fps = 30;

    return (
        <>
            {/* 9:16 Vertical (YouTube Shorts / TikTok) */}
            <Composition
                id="Main"
                component={Orchestrator}
                durationInFrames={calculateDuration(defaultProps, fps)}
                fps={fps}
                width={1080}
                height={1920}
                defaultProps={defaultProps}
                calculateMetadata={({ props }) => {
                    return {
                        durationInFrames: calculateDurationFromProps(props as VideoData, fps),
                    };
                }}
            />

            {/* 16:9 Horizontal (YouTube standard) */}
            <Composition
                id="MainWide"
                component={Orchestrator}
                durationInFrames={calculateDuration(defaultProps, fps)}
                fps={fps}
                width={1920}
                height={1080}
                defaultProps={defaultProps}
                calculateMetadata={({ props }) => {
                    return {
                        durationInFrames: calculateDurationFromProps(props as VideoData, fps),
                    };
                }}
            />
        </>
    );
};

registerRoot(RemotionRoot);
