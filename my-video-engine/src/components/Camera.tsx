import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

interface CameraProps {
    children: React.ReactNode;
    /** 1.0 = no zoom, 1.05 = 5% zoom-in. Default: 1.02 */
    zoomLevel?: number;
    /** 0 = no shake. Default: 0 for calm scenes, set higher for emphasis. */
    shakeIntensity?: number;
    /** Frame at which camera motion starts */
    startFrame?: number;
}

export const Camera: React.FC<CameraProps> = ({
    children,
    zoomLevel = 1.02,
    shakeIntensity = 0,
    startFrame = 0,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const relativeFrame = Math.max(0, frame - startFrame);

    // Smooth zoom-in using spring – settles gently onto the target zoom level
    const zoom = spring({
        frame: relativeFrame,
        fps,
        config: { stiffness: 40, damping: 20 },
        from: 1,
        to: zoomLevel,
    });

    // Organic shake: sum of two sine waves at different frequencies
    const shakeX =
        shakeIntensity > 0
            ? Math.sin(frame * 0.37) * 3 * shakeIntensity +
            Math.sin(frame * 0.71) * 1.5 * shakeIntensity
            : 0;
    const shakeY =
        shakeIntensity > 0
            ? Math.cos(frame * 0.29) * 2 * shakeIntensity +
            Math.cos(frame * 0.63) * 1 * shakeIntensity
            : 0;

    // Slight rotation drift for cinematic feel
    const rotateDeg =
        shakeIntensity > 0 ? Math.sin(frame * 0.19) * 0.15 * shakeIntensity : 0;

    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                transform: `scale(${zoom}) translate(${shakeX}px, ${shakeY}px) rotate(${rotateDeg}deg)`,
                transformOrigin: "center center",
                overflow: "hidden",
            }}
        >
            {children}
        </div>
    );
};
