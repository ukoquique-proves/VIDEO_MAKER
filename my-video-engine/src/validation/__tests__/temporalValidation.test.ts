/**
 * Tests for temporal validation of VideoData
 */

import { validateTemporalConstraints, assertValidTemporalConstraints } from "../temporalValidation";
import { VideoData } from "../../Schema";

const validVideoData: VideoData = {
  audioUrl: "test.mp3",
  transcript: [
    { word: "Hello", startTime: 0.5, endTime: 0.9 },
    { word: "World", startTime: 0.95, endTime: 1.4 },
    { word: "test", startTime: 1.5, endTime: 2.0 },
  ],
  codeSnippets: [
    { language: "java", code: "test", title: "Test.java", startTime: 2, endTime: 10 },
  ],
  scenes: [
    { type: "title", startTime: 0, endTime: 2, heading: "Title" },
    { type: "code", startTime: 2, endTime: 10, snippetIndex: 0 },
  ],
};

describe("Temporal Validation", () => {
  describe("validateTemporalConstraints", () => {
    it("should return valid for correct data", () => {
      const result = validateTemporalConstraints(validVideoData);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    describe("scene timing validation", () => {
      it("should detect startTime >= endTime in scenes", () => {
        const invalid: VideoData = {
          ...validVideoData,
          scenes: [
            { type: "title", startTime: 5, endTime: 3, heading: "Bad" },
          ],
        };
        
        const result = validateTemporalConstraints(invalid);
        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain("startTime (5) >= endTime (3)");
      });

      it("should detect scene overlaps", () => {
        const invalid: VideoData = {
          ...validVideoData,
          scenes: [
            { type: "title", startTime: 0, endTime: 5, heading: "First" },
            { type: "code", startTime: 3, endTime: 10, snippetIndex: 0 }, // Overlaps with first
          ],
        };
        
        const result = validateTemporalConstraints(invalid);
        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain("overlap detected");
        expect(result.errors[0].details?.overlapAmount).toBe(2);
      });

      it("should warn about large gaps between scenes", () => {
        const withGap: VideoData = {
          ...validVideoData,
          scenes: [
            { type: "title", startTime: 0, endTime: 2, heading: "First" },
            { type: "code", startTime: 5, endTime: 10, snippetIndex: 0 }, // 3s gap
          ],
        };
        
        const result = validateTemporalConstraints(withGap);
        expect(result.valid).toBe(true);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain("Gap of 3.00s");
      });
    });

    describe("code snippet timing validation", () => {
      it("should detect invalid snippet timing", () => {
        const invalid: VideoData = {
          ...validVideoData,
          codeSnippets: [
            { language: "java", code: "test", title: "Bad.java", startTime: 10, endTime: 5 },
          ],
        };
        
        const result = validateTemporalConstraints(invalid);
        expect(result.valid).toBe(false);
        expect(result.errors[0].location).toContain("codeSnippets[0]");
      });
    });

    describe("transcript word timing validation", () => {
      it("should detect word with start >= end", () => {
        const invalid: VideoData = {
          ...validVideoData,
          transcript: [
            { word: "Bad", startTime: 1.0, endTime: 0.5 },
          ],
        };
        
        const result = validateTemporalConstraints(invalid);
        expect(result.valid).toBe(false);
        expect(result.errors[0].message).toContain("startTime (1) >= endTime (0.5)");
      });

      it("should detect overlapping words", () => {
        const invalid: VideoData = {
          ...validVideoData,
          transcript: [
            { word: "First", startTime: 0, endTime: 1.0 },
            { word: "Second", startTime: 0.5, endTime: 1.5 }, // Overlaps
          ],
        };
        
        const result = validateTemporalConstraints(invalid);
        expect(result.valid).toBe(false);
        expect(result.errors[0].message).toContain("overlap detected");
        expect(result.errors[0].details?.previousWord).toBe("First");
      });
    });

    describe("snippetIndex bounds validation", () => {
      it("should detect out-of-bounds snippetIndex", () => {
        const invalid: VideoData = {
          ...validVideoData,
          codeSnippets: [], // Empty, but scene references index 0
          scenes: [
            { type: "code", startTime: 0, endTime: 5, snippetIndex: 0 },
          ],
        };
        
        const result = validateTemporalConstraints(invalid);
        expect(result.valid).toBe(false);
        expect(result.errors[0].message).toContain("Invalid snippetIndex: 0");
      });

      it("should detect negative snippetIndex", () => {
        const invalid: VideoData = {
          ...validVideoData,
          scenes: [
            { type: "code", startTime: 0, endTime: 5, snippetIndex: -1 },
          ],
        };
        
        const result = validateTemporalConstraints(invalid);
        expect(result.valid).toBe(false);
        expect(result.errors[0].message).toContain("Invalid snippetIndex: -1");
      });
    });

    describe("duration consistency", () => {
      it("should warn when durationSeconds differs from calculated duration", () => {
        const withDuration: VideoData = {
          ...validVideoData,
          durationSeconds: 100, // Much larger than last scene end (10)
        };
        
        const result = validateTemporalConstraints(withDuration);
        expect(result.valid).toBe(true);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain("durationSeconds (100s) differs");
        expect(result.warnings[0]).toContain("by 90.00s");
      });

      it("should not warn when durationSeconds is consistent", () => {
        const withDuration: VideoData = {
          ...validVideoData,
          scenes: [
            { type: "title", startTime: 0, endTime: 30, heading: "Title" },
          ],
          durationSeconds: 30,
        };
        
        const result = validateTemporalConstraints(withDuration);
        expect(result.valid).toBe(true);
        // May have gap warnings but not duration mismatch
        const durationWarnings = result.warnings.filter(w => w.includes("durationSeconds"));
        expect(durationWarnings).toHaveLength(0);
      });
    });
  });

  describe("assertValidTemporalConstraints", () => {
    it("should not throw for valid data", () => {
      expect(() => assertValidTemporalConstraints(validVideoData)).not.toThrow();
    });

    it("should throw with detailed message for invalid data", () => {
      const invalid: VideoData = {
        ...validVideoData,
        scenes: [
          { type: "title", startTime: 5, endTime: 3, heading: "Bad" },
        ],
      };
      
      expect(() => assertValidTemporalConstraints(invalid)).toThrow(
        "Temporal validation failed with 1 error(s)"
      );
    });

    it("should log warnings for valid data with warnings", () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
      
      const withGap: VideoData = {
        ...validVideoData,
        scenes: [
          { type: "title", startTime: 0, endTime: 2, heading: "First" },
          { type: "code", startTime: 5, endTime: 10, snippetIndex: 0 }, // 3s gap
        ],
      };
      
      assertValidTemporalConstraints(withGap);
      
      expect(consoleSpy).toHaveBeenCalledWith("⚠️  Temporal validation warnings:");
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Gap of 3.00s"));
      
      consoleSpy.mockRestore();
    });
  });
});
