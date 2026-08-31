/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { isImageGenSupported, resolveImageGenerationApiMode } from '@/common/utils/imageModelAllowlist';

describe('isImageGenSupported', () => {
  it('accepts native Gemini image models', () => {
    const provider = { platform: 'gemini', name: 'Gemini' };
    expect(isImageGenSupported(provider, 'gemini-3.1-flash-image')).toBe(true);
  });

  it('accepts Vertex AI Gemini image models', () => {
    const provider = { platform: 'gemini-vertex-ai', name: 'Vertex AI' };
    expect(isImageGenSupported(provider, 'gemini-2.5-flash-image')).toBe(true);
  });

  it('accepts OpenRouter image chat models via base_url', () => {
    const provider = { platform: 'custom', base_url: 'https://openrouter.ai/api/v1', name: 'OpenRouter' };
    expect(isImageGenSupported(provider, 'google/gemini-2.5-flash-image-preview')).toBe(true);
    expect(isImageGenSupported(provider, 'nano-banana')).toBe(true);
  });

  it('accepts AntigravityTools by name', () => {
    const provider = { platform: 'custom', name: 'AntigravityTools' };
    expect(isImageGenSupported(provider, 'gemini-3-pro-image-1x1')).toBe(true);
  });

  it('rejects models without an image-style suffix even on supported providers', () => {
    const provider = { platform: 'gemini', name: 'Gemini' };
    expect(isImageGenSupported(provider, 'gemini-2.5-pro')).toBe(false);
  });

  it('routes GPT Image models through the Images API', () => {
    const provider = { platform: 'custom', base_url: 'https://api.openai.com/v1', name: 'OpenAI' };
    expect(resolveImageGenerationApiMode(provider, 'gpt-image-2')).toBe('openai-images');
    expect(resolveImageGenerationApiMode(provider, 'dall-e-3')).toBe('openai-images');
  });

  it('does not claim compatibility for vendor-native endpoints', () => {
    const provider = { platform: 'custom', base_url: 'https://api.stability.ai', name: 'Stability AI' };
    expect(isImageGenSupported(provider, 'sd3.5-large')).toBe(false);
  });

  it.each([
    'grok-imagine-image-2.0',
    'doubao-seedream-5-0-pro',
    'black-forest-labs/flux.2-pro',
    'stable-diffusion-3.5-large',
    'recraftv4_1_pro',
    'qwen-image-3.0-pro',
    'ideogram-4.0',
  ])('routes compatible model family %s through the Images API', (modelName) => {
    const provider = { platform: 'custom', base_url: 'https://images.example.com/v1', name: 'Gateway' };
    expect(resolveImageGenerationApiMode(provider, modelName)).toBe('openai-images');
  });

  it('keeps OpenRouter image models on the chat-completions route', () => {
    const provider = { platform: 'custom', base_url: 'https://openrouter.ai/api/v1', name: 'OpenRouter' };
    expect(resolveImageGenerationApiMode(provider, 'gpt-image-2')).toBe('chat-completions');
  });

  it('recognizes Microsoft MAI endpoints with custom deployment names', () => {
    const provider = {
      platform: 'custom',
      base_url: 'https://example.services.ai.azure.com/mai/v1',
      name: 'Microsoft Foundry',
    };
    expect(resolveImageGenerationApiMode(provider, 'production-deployment')).toBe('openai-images');
  });

  it('leaves an unknown image-like model unverified', () => {
    const provider = { platform: 'custom', base_url: 'https://images.example.com/v1', name: 'Custom' };
    expect(isImageGenSupported(provider, 'my-image-model')).toBe(false);
  });
});
