/**
 * Integration tests for TTS Provider architecture
 */

import { createTTSProvider } from '../TTSProvider';

describe('TTS Provider Factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables before each test
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.GOOGLE_CLOUD_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return null when no TTS keys are configured', async () => {
    const provider = await createTTSProvider();
    expect(provider).toBeNull();
  });

  it('should prioritize Google Cloud TTS over ElevenLabs', async () => {
    process.env.GOOGLE_CLOUD_API_KEY = 'test-google-key';
    process.env.ELEVENLABS_API_KEY = 'test-elevenlabs-key';

    const provider = await createTTSProvider();
    expect(provider).not.toBeNull();
    expect(provider?.name).toBe('Google Cloud TTS');
  });

  it('should fallback to ElevenLabs when only ElevenLabs key is set', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-elevenlabs-key';

    const provider = await createTTSProvider();
    expect(provider).not.toBeNull();
    expect(provider?.name).toBe('ElevenLabs');
  });

  it('should select Google Cloud TTS when only Google key is set', async () => {
    process.env.GOOGLE_CLOUD_API_KEY = 'test-google-key';

    const provider = await createTTSProvider();
    expect(provider).not.toBeNull();
    expect(provider?.name).toBe('Google Cloud TTS');
  });
});
