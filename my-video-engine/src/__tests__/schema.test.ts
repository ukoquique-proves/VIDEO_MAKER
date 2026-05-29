/**
 * Integration tests for VideoData schema validation
 * Ensures pipeline output JSON conforms to expected structure
 */

import * as fs from 'fs';
import * as path from 'path';
import { VideoDataSchema, VideoData, getDurationSeconds } from '../Schema';

const SAMPLE_DIR = path.join(__dirname, '..', '..', 'sample_data');

describe('VideoData Schema Validation', () => {
  describe('demo.json sample data', () => {
    let demoData: unknown;

    beforeAll(() => {
      const demoPath = path.join(SAMPLE_DIR, 'demo.json');
      const content = fs.readFileSync(demoPath, 'utf-8');
      demoData = JSON.parse(content);
    });

    it('should validate against VideoDataSchema without errors', () => {
      expect(() => VideoDataSchema.parse(demoData)).not.toThrow();
    });

    it('should return a valid VideoData object with all required fields', () => {
      const result = VideoDataSchema.parse(demoData) as VideoData;
      
      expect(result.audioUrl).toBeDefined();
      expect(result.transcript).toBeInstanceOf(Array);
      expect(result.codeSnippets).toBeInstanceOf(Array);
      expect(result.scenes).toBeInstanceOf(Array);
    });

    it('should have transcript with word-level timestamps', () => {
      const result = VideoDataSchema.parse(demoData) as VideoData;
      
      expect(result.transcript.length).toBeGreaterThan(0);
      
      result.transcript.forEach((word, index) => {
        expect(word.word).toBeDefined();
        expect(typeof word.word).toBe('string');
        expect(typeof word.startTime).toBe('number');
        expect(typeof word.endTime).toBe('number');
        expect(word.startTime).toBeLessThanOrEqual(word.endTime);
        
        // Check for gaps between consecutive words (if any)
        if (index > 0) {
          const prev = result.transcript[index - 1];
          // Allow small overlap or gap (up to 0.5s)
          expect(word.startTime).toBeGreaterThanOrEqual(prev.endTime - 0.5);
        }
      });
    });

    it('should have valid code snippets with language and code', () => {
      const result = VideoDataSchema.parse(demoData) as VideoData;
      
      if (result.codeSnippets.length > 0) {
        result.codeSnippets.forEach(snippet => {
          expect(snippet.language).toMatch(/^(java|typescript|javascript|python|bash|json|tsx|text)$/);
          expect(typeof snippet.code).toBe('string');
          expect(snippet.code.length).toBeGreaterThan(0);
          expect(typeof snippet.startTime).toBe('number');
          expect(typeof snippet.endTime).toBe('number');
        });
      }
    });

    it('should have scenes with valid structure', () => {
      const result = VideoDataSchema.parse(demoData) as VideoData;
      
      expect(result.scenes.length).toBeGreaterThan(0);
      
      result.scenes.forEach((scene, index) => {
        expect(typeof scene.startTime).toBe('number');
        expect(typeof scene.endTime).toBe('number');
        expect(scene.startTime).toBeLessThan(scene.endTime);
        expect(['title', 'code', 'split']).toContain(scene.type);
        
        // Check for chronological order
        if (index > 0) {
          const prev = result.scenes[index - 1];
          expect(scene.startTime).toBeGreaterThanOrEqual(prev.startTime);
        }
        
        // Type-specific validation
        if (scene.type === 'title') {
          expect(typeof scene.heading).toBe('string');
          expect(scene.heading.length).toBeGreaterThan(0);
        }
        
        if (scene.type === 'code' || scene.type === 'split') {
          expect(typeof scene.snippetIndex).toBe('number');
          expect(scene.snippetIndex).toBeGreaterThanOrEqual(0);
          expect(scene.snippetIndex).toBeLessThan(result.codeSnippets.length);
        }
        
        if (scene.type === 'split') {
          expect(scene.bullets).toBeInstanceOf(Array);
          expect(scene.bullets.length).toBeGreaterThan(0);
        }
      });
    });

    it('should have consistent total duration', () => {
      const result = VideoDataSchema.parse(demoData) as VideoData;
      const duration = getDurationSeconds(result);
      
      expect(duration).toBeGreaterThan(0);
      
      // Last scene end time should match duration
      if (result.scenes.length > 0) {
        const lastScene = result.scenes[result.scenes.length - 1];
        expect(lastScene.endTime).toBeCloseTo(duration, 1);
      }
    });

    it('should have transcript with valid timing structure', () => {
      const result = VideoDataSchema.parse(demoData) as VideoData;
      
      if (result.transcript.length > 0) {
        const firstWord = result.transcript[0];
        const lastWord = result.transcript[result.transcript.length - 1];
        
        // First word should start near 0
        expect(firstWord.startTime).toBeGreaterThanOrEqual(0);
        expect(firstWord.startTime).toBeLessThan(5);
        
        // Words should have positive duration
        result.transcript.forEach(word => {
          expect(word.endTime).toBeGreaterThan(word.startTime);
        });
      }
    });
  });

  describe('invalid data rejection', () => {
    it('should reject missing required fields', () => {
      const invalid = {
        audioUrl: 'test.mp3',
        // missing transcript, codeSnippets, scenes
      };
      
      expect(() => VideoDataSchema.parse(invalid)).toThrow();
    });

    it('should reject invalid scene types', () => {
      const invalid = {
        audioUrl: 'test.mp3',
        transcript: [],
        codeSnippets: [],
        scenes: [
          { type: 'invalid', startTime: 0, endTime: 5 }
        ],
      };
      
      expect(() => VideoDataSchema.parse(invalid)).toThrow();
    });

    it('should reject invalid scene type', () => {
      const invalid = {
        audioUrl: 'test.mp3',
        transcript: [],
        codeSnippets: [],
        scenes: [
          { type: 'invalid_type', startTime: 0, endTime: 5 }
        ],
      };
      
      expect(() => VideoDataSchema.parse(invalid)).toThrow();
    });

    it('should reject title scene without heading', () => {
      const invalid = {
        audioUrl: 'test.mp3',
        transcript: [],
        codeSnippets: [],
        scenes: [
          { type: 'title', startTime: 0, endTime: 5 }
        ],
      };
      
      expect(() => VideoDataSchema.parse(invalid)).toThrow();
    });

    it('should reject code scene without snippetIndex', () => {
      const invalid = {
        audioUrl: 'test.mp3',
        transcript: [],
        codeSnippets: [{ language: 'java', code: 'test', title: 'Test', startTime: 0, endTime: 5 }],
        scenes: [
          { type: 'code', startTime: 0, endTime: 5 }
        ],
      };
      
      expect(() => VideoDataSchema.parse(invalid)).toThrow();
    });
  });
});
