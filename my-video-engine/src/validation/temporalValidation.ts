/**
 * Temporal validation for VideoData
 * Post-parse checks that Zod schema doesn't cover (timing invariants)
 */

import { VideoData, Scene } from "../Schema";
import * as fs from "fs";
import * as path from "path";

export interface TemporalValidationError {
  type: "temporal";
  message: string;
  location: string;
  details?: Record<string, unknown>;
}

export interface TemporalValidationResult {
  valid: boolean;
  errors: TemporalValidationError[];
  warnings: string[];
}

/**
 * Validates temporal invariants in VideoData that Zod schema doesn't check:
 * - startTime < endTime for all timed elements
 * - No overlaps between consecutive scenes
 * - Transcript words have positive duration
 * - Optional: gaps between scenes (warning only)
 */
export function validateTemporalConstraints(data: VideoData): TemporalValidationResult {
  const errors: TemporalValidationError[] = [];
  const warnings: string[] = [];

  // 1. Validate scenes: startTime < endTime and no overlaps
  const sortedScenes = [...data.scenes].sort((a, b) => a.startTime - b.startTime);
  
  for (let i = 0; i < sortedScenes.length; i++) {
    const scene = sortedScenes[i];
    const location = `scenes[${i}] (type: ${scene.type})`;

    // Check start < end
    if (scene.startTime >= scene.endTime) {
      errors.push({
        type: "temporal",
        message: `Scene has invalid timing: startTime (${scene.startTime}) >= endTime (${scene.endTime})`,
        location,
        details: { startTime: scene.startTime, endTime: scene.endTime },
      });
    }

    // Check for overlaps with previous scene
    if (i > 0) {
      const prevScene = sortedScenes[i - 1];
      if (scene.startTime < prevScene.endTime) {
        errors.push({
          type: "temporal",
          message: `Scene overlap detected: starts at ${scene.startTime}s before previous scene ends at ${prevScene.endTime}s`,
          location,
          details: {
            currentStart: scene.startTime,
            previousEnd: prevScene.endTime,
            overlapAmount: prevScene.endTime - scene.startTime,
          },
        });
      }

      // Warn about gaps > 1 second between scenes
      const gap = scene.startTime - prevScene.endTime;
      if (gap > 1.0) {
        warnings.push(
          `Gap of ${gap.toFixed(2)}s between scene ${i - 1} (ends ${prevScene.endTime}s) and scene ${i} (starts ${scene.startTime}s)`
        );
      }
    }
  }

  // 2. Validate code snippets timing
  data.codeSnippets.forEach((snippet, i) => {
    const location = `codeSnippets[${i}] (title: ${snippet.title ?? "unnamed"})`;

    if (snippet.startTime >= snippet.endTime) {
      errors.push({
        type: "temporal",
        message: `Code snippet has invalid timing: startTime (${snippet.startTime}) >= endTime (${snippet.endTime})`,
        location,
        details: { startTime: snippet.startTime, endTime: snippet.endTime },
      });
    }
  });

  // 3. Validate transcript words
  const sortedTranscript = [...data.transcript].sort((a, b) => a.startTime - b.startTime);
  
  for (let i = 0; i < sortedTranscript.length; i++) {
    const word = sortedTranscript[i];
    const location = `transcript[${i}] (word: "${word.word}")`;

    if (word.startTime >= word.endTime) {
      errors.push({
        type: "temporal",
        message: `Word has invalid timing: startTime (${word.startTime}) >= endTime (${word.endTime})`,
        location,
        details: { word: word.word, startTime: word.startTime, endTime: word.endTime },
      });
    }

    // Check for overlaps with previous word
    if (i > 0) {
      const prevWord = sortedTranscript[i - 1];
      if (word.startTime < prevWord.endTime) {
        errors.push({
          type: "temporal",
          message: `Word overlap detected: starts at ${word.startTime}s before previous word ends at ${prevWord.endTime}s`,
          location,
          details: {
            word: word.word,
            previousWord: prevWord.word,
            currentStart: word.startTime,
            previousEnd: prevWord.endTime,
          },
        });
      }
    }
  }

  // 4. Validate scene references (snippetIndex bounds)
  sortedScenes.forEach((scene, i) => {
    if (scene.type === "code" || scene.type === "split") {
      if (scene.snippetIndex < 0 || scene.snippetIndex >= data.codeSnippets.length) {
        errors.push({
          type: "temporal",
          message: `Invalid snippetIndex: ${scene.snippetIndex} (codeSnippets length: ${data.codeSnippets.length})`,
          location: `scenes[${i}] (type: ${scene.type})`,
          details: { snippetIndex: scene.snippetIndex, availableSnippets: data.codeSnippets.length },
        });
      }
    }
  });

  // 5. Check duration consistency
  const calculatedDuration = sortedScenes.length > 0 
    ? sortedScenes[sortedScenes.length - 1].endTime 
    : 0;
  
  if (data.durationSeconds !== undefined && data.durationSeconds !== null) {
    const durationDiff = Math.abs(data.durationSeconds - calculatedDuration);
    if (durationDiff > 1.0) {
      warnings.push(
        `durationSeconds (${data.durationSeconds}s) differs significantly from last scene endTime (${calculatedDuration}s) by ${durationDiff.toFixed(2)}s`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates VideoData with full temporal checks.
 * Throws if temporal invariants are violated.
 */
export function assertValidTemporalConstraints(data: VideoData): void {
  const result = validateTemporalConstraints(data);
  
  if (!result.valid) {
    const errorMessages = result.errors.map(
      e => `[${e.location}] ${e.message}`
    ).join("\n  ");
    
    throw new Error(
      `Temporal validation failed with ${result.errors.length} error(s):\n  ${errorMessages}`
    );
  }

  // Log warnings for visibility
  if (result.warnings.length > 0) {
    console.warn("⚠️  Temporal validation warnings:");
    result.warnings.forEach(w => console.warn(`  - ${w}`));
  }
}
