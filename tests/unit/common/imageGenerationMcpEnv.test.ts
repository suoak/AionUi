import { describe, expect, it } from 'vitest';

import {
  IMAGE_GEN_ENV_KEYS,
  readImageGenerationRuntimeEnv,
  resolveImageGenerationMcpEnv,
} from '@/common/config/imageGenerationMcpEnv';
import type { IProvider } from '@/common/config/storage';

const geminiProvider: IProvider = {
  id: '03c8482c',
  platform: 'gemini',
  name: 'Gemini',
  base_url: 'https://generativelanguage.googleapis.com',
  api_key: 'provider-key',
  models: ['gemini-2.5-pro', 'gemini-3-pro-image-preview'],
  enabled: true,
};

describe('resolveImageGenerationMcpEnv', () => {
  it('resolves image generation env from provider id and selected model', () => {
    const result = resolveImageGenerationMcpEnv({ id: '03c8482c', use_model: 'gemini-3-pro-image-preview' }, [
      geminiProvider,
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe('provider-id');
    expect(result.env).toEqual({
      [IMAGE_GEN_ENV_KEYS.providerId]: '03c8482c',
      [IMAGE_GEN_ENV_KEYS.platform]: 'gemini',
      [IMAGE_GEN_ENV_KEYS.baseUrl]: 'https://generativelanguage.googleapis.com',
      [IMAGE_GEN_ENV_KEYS.apiKey]: 'provider-key',
      [IMAGE_GEN_ENV_KEYS.model]: 'gemini-3-pro-image-preview',
    });
  });

  it('matches legacy env by platform, base URL, and model when provider id is absent', () => {
    const result = resolveImageGenerationMcpEnv(undefined, [geminiProvider], {
      CSBU_WORKMATE_IMG_PLATFORM: 'gemini',
      CSBU_WORKMATE_IMG_BASE_URL: 'https://generativelanguage.googleapis.com/',
      CSBU_WORKMATE_IMG_MODEL: 'gemini-3-pro-image-preview',
      CSBU_WORKMATE_IMG_API_KEY: 'stale-key',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe('field-match');
    expect(result.env.CSBU_WORKMATE_IMG_PROVIDER_ID).toBe('03c8482c');
    expect(result.env.CSBU_WORKMATE_IMG_API_KEY).toBe('provider-key');
  });

  it('fails loudly when neither provider id nor legacy fields match a provider', () => {
    const result = resolveImageGenerationMcpEnv(
      { platform: 'gemini', base_url: 'https://unknown.example', use_model: 'gemini-3-pro-image-preview' },
      [geminiProvider]
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('no-provider-match');
  });

  it('fails when the selected model is not present on the matched provider', () => {
    const result = resolveImageGenerationMcpEnv({ id: '03c8482c', use_model: 'missing-image-model' }, [geminiProvider]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('model-not-found');
  });
});

describe('readImageGenerationRuntimeEnv', () => {
  it('reads the branded environment written by the settings page', () => {
    expect(
      readImageGenerationRuntimeEnv({
        CSBU_WORKMATE_IMG_PLATFORM: 'openai',
        CSBU_WORKMATE_IMG_BASE_URL: 'https://images.example.com/v1',
        CSBU_WORKMATE_IMG_API_KEY: 'test-key',
        CSBU_WORKMATE_IMG_MODEL: 'gpt-image-2',
        CSBU_WORKMATE_IMG_PROXY: 'http://proxy.example.com',
      })
    ).toEqual({
      platform: 'openai',
      baseUrl: 'https://images.example.com/v1',
      apiKey: 'test-key',
      model: 'gpt-image-2',
      proxy: 'http://proxy.example.com',
    });
  });

  it('falls back to legacy AionUi environment keys', () => {
    expect(
      readImageGenerationRuntimeEnv({
        AIONUI_IMG_PLATFORM: 'gemini',
        AIONUI_IMG_MODEL: 'gemini-2.5-flash-image',
      })
    ).toEqual({ platform: 'gemini', baseUrl: '', apiKey: '', model: 'gemini-2.5-flash-image', proxy: undefined });
  });
});
