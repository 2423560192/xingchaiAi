/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { expect, it } from 'vitest'

import {
  buildSample,
  ParamRangeCell,
  RateLimitsSection,
  SupportedParametersSection,
} from '../components/model-details-api'
import { buildSupportedParameters } from '../lib/mock-stats'
import type { PricingModel } from '../types'

const seedance: PricingModel = {
  id: 1,
  model_name: 'seedance-2.0-mini',
  quota_type: 1,
  model_ratio: 1,
  completion_ratio: 1,
  enable_groups: ['Seedance'],
  supported_endpoint_types: ['openai-response', 'openai-video'],
}

const gptImage2: PricingModel = {
  id: 2,
  model_name: 'gpt-image-2',
  quota_type: 1,
  model_ratio: 1,
  completion_ratio: 1,
  enable_groups: ['OpenAI'],
  supported_endpoint_types: ['image-generation'],
}

const GPT_IMAGE_2_SIZE_RANGE =
  '宽x高；边长16的倍数；比例1:3~3:1；总像素65.5万~829.4万；单边≤3840px。'

it.each(['gpt-image-2', 'gpt-image-2-2026-04-21'])(
  'shows %s generation parameters and their exact accepted values',
  (modelName) => {
    const parameters = buildSupportedParameters({
      ...gptImage2,
      model_name: modelName,
    })
    const names = parameters.map((parameter) => parameter.name)

    expect(names).toEqual([
      'prompt',
      'size',
      'quality',
      'n',
      'background',
      'output_format',
      'output_compression',
      'moderation',
      'stream',
      'partial_images',
      'user',
    ])
    expect(
      parameters.find((parameter) => parameter.name === 'quality')
    ).toMatchObject({
      defaultValue: 'auto',
      enumValues: ['auto', 'low', 'medium', 'high'],
    })
    expect(
      parameters.find((parameter) => parameter.name === 'background')
    ).toMatchObject({
      defaultValue: 'auto',
      enumValues: ['auto', 'opaque', 'transparent'],
    })
    expect(
      parameters.find((parameter) => parameter.name === 'size')
    ).toMatchObject({
      defaultValue: 'auto',
      range: GPT_IMAGE_2_SIZE_RANGE,
      descriptionKey: expect.stringContaining(
        'Valid examples: 1024x1024, 1280x768, 768x1280, 1920x1088, and 3840x2160.'
      ),
    })
    expect(
      parameters.find((parameter) => parameter.name === 'output_format')
    ).toMatchObject({
      defaultValue: 'png',
      enumValues: ['png', 'jpeg', 'webp'],
    })
    expect(
      parameters.find((parameter) => parameter.name === 'partial_images')
    ).toMatchObject({ range: '0 ~ 3' })
  }
)

it.each([
  'gpt-image-2.5-sunburst',
  'gpt-image-2.5-sunburst-2026-09-08',
  'gpt-image-2.5-flare',
  'gpt-image-2.5-flare-2026-09-08',
])('includes extended quality levels for %s', (modelName) => {
  const parameters = buildSupportedParameters({
    ...gptImage2,
    model_name: modelName,
  })

  expect(
    parameters.find((parameter) => parameter.name === 'quality')
  ).toMatchObject({
    defaultValue: 'auto',
    enumValues: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'],
  })
})

it('renders every enum option when the parameter also has a default', () => {
  render(
    createElement(ParamRangeCell, {
      param: {
        name: 'quality',
        type: 'enum',
        defaultValue: 'auto',
        enumValues: ['auto', 'low', 'medium', 'high'],
        descriptionKey: 'Generation quality preset',
      },
    })
  )

  expect(screen.getByText('auto')).toBeVisible()
  expect(screen.getByText('low')).toBeVisible()
  expect(screen.getByText('medium')).toBeVisible()
  expect(screen.getByText('high')).toBeVisible()
})

it('fixes the supported-parameter table layout so long parameter text wraps', () => {
  render(createElement(SupportedParametersSection, { model: gptImage2 }))

  expect(screen.getByRole('table')).toHaveClass('table-fixed')
  expect(screen.getByText(GPT_IMAGE_2_SIZE_RANGE)).toHaveClass(
    'whitespace-normal'
  )
  expect(screen.getByText(/Use auto to let the model choose/)).toHaveClass(
    'whitespace-normal'
  )
})

it('labels the rate-limit table as sample data', () => {
  render(createElement(RateLimitsSection, { model: gptImage2 }))

  expect(screen.getByText('Example')).toBeVisible()
  expect(screen.getByText(/Sample values for reference only/)).toBeVisible()
})

it('reads GPT Image 2 generation results from the base64 response field', () => {
  const context = {
    baseUrl: 'https://api.example.com',
    apiKeyEnv: 'NEW_API_KEY',
    modelName: 'gpt-image-2',
    endpointType: 'image-generation',
    endpointPath: '/v1/images/generations',
  }

  const pythonSample = buildSample('python', 'image-generation', context)
  const typescriptSample = buildSample(
    'typescript',
    'image-generation',
    context
  )

  expect(pythonSample).toContain('response.data[0].b64_json')
  expect(pythonSample).not.toContain('response.data[0].url')
  expect(typescriptSample).toContain('response.data[0].b64_json')
  expect(typescriptSample).not.toContain('response.data[0].url')
})

it('shows the real Seedance video request parameters instead of chat parameters', () => {
  const parameters = buildSupportedParameters(seedance)
  const names = parameters.map((parameter) => parameter.name)

  expect(names).toEqual(
    expect.arrayContaining([
      'prompt',
      'content',
      'resolution',
      'ratio',
      'duration',
      'generate_audio',
      'seed',
      'guidance_scale',
      'watermark',
      'bitrate_mode',
    ])
  )
  expect(names).not.toEqual(
    expect.arrayContaining([
      'temperature',
      'top_p',
      'max_tokens',
      'frequency_penalty',
      'fps',
    ])
  )
  expect(
    parameters.find((parameter) => parameter.name === 'resolution')
  ).toMatchObject({
    defaultValue: '720p',
    enumValues: ['480p', '720p'],
  })
  expect(
    parameters.find((parameter) => parameter.name === 'ratio')
  ).toMatchObject({
    defaultValue: '16:9',
    enumValues: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
  })
  expect(
    parameters.find((parameter) => parameter.name === 'duration')
  ).toMatchObject({
    defaultValue: 8,
    range: '4 ~ 15',
  })
})

it('builds Seedance video examples with fields accepted by each endpoint', () => {
  const context = {
    baseUrl: 'https://api.example.com',
    apiKeyEnv: 'NEW_API_KEY',
    modelName: 'seedance-2.0-mini',
    endpointType: 'openai-video',
    endpointPath: '/v1/videos',
  }
  const videoSample = buildSample('curl', 'openai-video', context)

  expect(videoSample).toContain('POST')
  expect(videoSample).toContain('/v1/videos')
  expect(videoSample).toContain('"prompt"')
  expect(videoSample).toContain('"resolution": "720p"')
  expect(videoSample).toContain('"ratio": "16:9"')
  expect(videoSample).toContain('"duration": 8')
  expect(videoSample).toContain('"generate_audio": true')
  expect(videoSample).not.toContain('"messages"')

  const responsesSample = buildSample('curl', 'openai-response', {
    ...context,
    endpointType: 'openai-response',
    endpointPath: '/v1/responses',
  })
  expect(responsesSample).toContain('/v1/responses')
  expect(responsesSample).toContain('"input"')
  expect(responsesSample).not.toContain('"messages"')
})

it('builds vendor-shaped chat samples for the text-model vendors', () => {
  const context = {
    baseUrl: 'https://inko.dev',
    apiKeyEnv: 'NEW_API_KEY',
    endpointType: 'openai',
    endpointPath: '/v1/chat/completions',
  }

  const deepseek = buildSample('curl', 'openai', {
    ...context,
    modelName: 'deepseek-flash',
  })
  expect(deepseek).toContain('"system"')
  expect(deepseek).toContain('You are a helpful assistant.')
  expect(deepseek).toContain('"stream": false')
  expect(deepseek).not.toContain('"temperature"')

  const kimi = buildSample('python', 'openai', {
    ...context,
    modelName: 'kimi-k2.6',
  })
  expect(kimi).toContain('你是 Kimi，由 Moonshot AI 提供的人工智能助手')
  expect(kimi).not.toContain('temperature')

  const glm = buildSample('typescript', 'openai', {
    ...context,
    modelName: 'glm-5.1',
  })
  expect(glm).toContain("content: '你好'")
  expect(glm).toContain('temperature: 1,')

  const qwen = buildSample('curl', 'openai', {
    ...context,
    modelName: 'qwen3.7-plus',
  })
  expect(qwen).toContain('你是谁？')

  const minimax = buildSample('python', 'openai', {
    ...context,
    modelName: 'MiniMax-M2.7',
  })
  expect(minimax).toContain('Hello, how are you?')

  // MiniMax-M3.1-Flash mirrors the official quick-start, including the
  // thinking object and reasoning_effort showcase fields.
  const m31flash = buildSample('curl', 'openai', {
    ...context,
    modelName: 'MiniMax-M3.1-Flash',
  })
  expect(m31flash).toContain('Which is bigger, 9.11 or 9.9?')
  expect(m31flash).toContain('"thinking"')
  expect(m31flash).toContain('"type": "adaptive"')
  expect(m31flash).toContain('"reasoning_effort": "max"')
  expect(m31flash).toContain('"max_completion_tokens": 500')
  expect(m31flash).not.toContain('"temperature"')

  const m31flashTs = buildSample('typescript', 'openai', {
    ...context,
    modelName: 'MiniMax-M3.1-Flash',
  })
  expect(m31flashTs).toContain('reasoning_effort: "max",')
  expect(m31flashTs).toContain('max_completion_tokens: 500,')

  const glmFlash = buildSample('curl', 'openai', {
    ...context,
    modelName: 'glm-5.3-flash',
  })
  expect(glmFlash).toContain('你好')
  expect(glmFlash).toContain('"temperature": 1')
})

it('keeps the generic chat sample for models without a vendor profile', () => {
  const generic = buildSample('curl', 'openai', {
    baseUrl: 'https://api.example.com',
    apiKeyEnv: 'NEW_API_KEY',
    modelName: 'some-unknown-model',
    endpointType: 'openai',
    endpointPath: '/v1/chat/completions',
  })

  expect(generic).toContain('Explain quantum entanglement in one paragraph.')
  expect(generic).toContain('"temperature": 0.7')
  expect(generic).not.toContain('"system"')
})

const textModel = (modelName: string): PricingModel => ({
  id: 3,
  model_name: modelName,
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 1,
  enable_groups: ['default'],
  supported_endpoint_types: ['openai'],
})

it('builds vendor chat parameter tables from each vendor API reference', () => {
  const names = (modelName: string) =>
    buildSupportedParameters(textModel(modelName)).map(
      (parameter) => parameter.name
    )
  const find = (modelName: string, name: string) =>
    buildSupportedParameters(textModel(modelName)).find(
      (parameter) => parameter.name === name
    )

  const deepseek = names('deepseek-flash')
  expect(deepseek).toEqual(
    expect.arrayContaining([
      'thinking.type',
      'reasoning_effort',
      'stream_options',
    ])
  )
  expect(deepseek).not.toEqual(
    expect.arrayContaining([
      'frequency_penalty',
      'presence_penalty',
      'n',
      'seed',
      'logit_bias',
    ])
  )
  expect(find('deepseek-flash', 'thinking.type')).toMatchObject({
    enumValues: ['enabled', 'disabled'],
    defaultValue: 'enabled',
  })
  expect(find('deepseek-flash', 'reasoning_effort')).toMatchObject({
    enumValues: ['none', 'low', 'high', 'max'],
    defaultValue: 'high',
  })
  expect(find('deepseek-flash', 'stop')).toMatchObject({
    range: '<= 16',
    descriptionKey: 'Sequences that stop generation',
  })
  expect(find('deepseek-flash', 'response_format')).toMatchObject({
    enumValues: ['text', 'json_object'],
    defaultValue: 'text',
  })
  expect(find('deepseek-flash', 'tools')?.range).toBeUndefined()

  const kimi = names('kimi-k2.7-code')
  expect(kimi).toEqual(
    expect.arrayContaining([
      'temperature',
      'thinking',
      'max_completion_tokens',
      'prompt_cache_key',
    ])
  )
  expect(kimi).not.toContain('top_p')
  expect(find('kimi-k2.7-code', 'temperature')).toMatchObject({
    range: 'thinking 1.0 / non-thinking 0.6',
  })
  expect(find('kimi-k2.7-code', 'temperature')?.defaultValue).toBeUndefined()
  expect(find('kimi-k2.7-code', 'thinking')).toMatchObject({
    type: 'object',
    descriptionKey:
      'Thinking is always enabled; output returns in reasoning_content',
  })
  expect(find('kimi-k2.7-code', 'thinking')?.defaultValue).toBeUndefined()
  expect(find('kimi-k2.6', 'thinking')).toMatchObject({
    type: 'enum',
    enumValues: ['enabled', 'disabled'],
    defaultValue: 'enabled',
  })
  expect(find('kimi-k2.6', 'stop')).toMatchObject({
    range: '<= 5 x 32 bytes',
  })
  expect(find('kimi-k2.6', 'response_format')).toMatchObject({
    enumValues: ['text', 'json_object', 'json_schema'],
    defaultValue: 'text',
  })

  expect(find('MiniMax-M2.7', 'top_p')).toMatchObject({ defaultValue: 0.9 })
  expect(find('MiniMax-M3', 'top_p')).toMatchObject({ defaultValue: 0.95 })
  expect(find('MiniMax-M2.7', 'thinking')).toMatchObject({
    type: 'object',
    descriptionKey:
      'Thinking is always enabled; output returns in reasoning_content',
  })
  expect(find('MiniMax-M3', 'thinking.type')).toMatchObject({
    type: 'enum',
    enumValues: ['adaptive', 'disabled'],
    defaultValue: 'adaptive',
  })
  expect(names('MiniMax-M2.7')).toContain('service_tier')

  expect(find('MiniMax-M3.1-Flash', 'thinking.type')).toMatchObject({
    type: 'enum',
    enumValues: ['adaptive'],
    defaultValue: 'adaptive',
    range: 'disabled is rejected',
  })
  expect(find('MiniMax-M3.1-Flash', 'reasoning_effort')).toMatchObject({
    type: 'enum',
    enumValues: ['max', 'xhigh', 'high', 'medium', 'low'],
    defaultValue: 'max',
  })
  expect(find('MiniMax-M3.1-Flash', 'temperature')).toMatchObject({
    defaultValue: 1,
    range: '0 ~ 2',
  })
  expect(find('MiniMax-M3.1-Flash', 'top_p')).toMatchObject({
    defaultValue: 0.95,
  })
  expect(find('MiniMax-M3.1-Flash', 'max_completion_tokens')).toMatchObject({
    range: '1 ~ 524288',
  })
  expect(names('MiniMax-M3.1-Flash')).not.toContain('service_tier')

  expect(names('kimi-k3')).not.toContain('thinking')
  expect(find('kimi-k3', 'reasoning_effort')).toMatchObject({
    enumValues: ['low', 'high', 'max'],
    defaultValue: 'max',
  })
  expect(find('kimi-k3', 'temperature')).toMatchObject({
    range: 'fixed 1.0 (omit)',
  })
  expect(find('kimi-k3', 'max_completion_tokens')).toMatchObject({
    defaultValue: 131072,
    range: '1 ~ 1048576',
  })

  expect(find('glm-5.1', 'temperature')).toMatchObject({
    defaultValue: 1,
    range: '(0, 1]',
  })
  expect(find('glm-5.1', 'top_p')).toMatchObject({ defaultValue: 0.95 })
  expect(find('glm-5.1', 'thinking.type')).toMatchObject({
    enumValues: ['enabled', 'disabled'],
    defaultValue: 'enabled',
  })
  expect(find('glm-5.1', 'stop')).toMatchObject({ range: '<= 4' })
  expect(names('glm-5.1')).toContain('do_sample')
  expect(names('glm-5.1')).not.toContain('reasoning_effort')
  expect(names('glm-5.2')).toContain('reasoning_effort')
  expect(find('glm-5.2', 'reasoning_effort')).toMatchObject({
    enumValues: ['max', 'xhigh', 'high', 'medium', 'low', 'minimal', 'none'],
    defaultValue: 'max',
  })
  expect(find('glm-5.3', 'thinking.type')).toMatchObject({
    enumValues: ['enabled'],
    defaultValue: 'enabled',
  })
  expect(find('glm-5.3', 'reasoning_effort')).toMatchObject({
    enumValues: ['max', 'high', 'low'],
    defaultValue: 'max',
  })

  // GLM-5.3-Flash docs: text parameters are identical to GLM-5.3.
  expect(find('glm-5.3-flash', 'thinking.type')).toMatchObject({
    enumValues: ['enabled'],
    defaultValue: 'enabled',
  })
  expect(find('glm-5.3-flash', 'reasoning_effort')).toMatchObject({
    enumValues: ['max', 'high', 'low'],
    defaultValue: 'max',
  })
  expect(find('glm-5.3-flash', 'temperature')).toMatchObject({
    defaultValue: 1,
    range: '(0, 1]',
  })
  expect(find('glm-5.3-flash', 'max_tokens')).toMatchObject({
    range: '1 ~ 131072',
  })

  const qwen = names('qwen3.8-max')
  expect(qwen).toEqual(
    expect.arrayContaining([
      'enable_thinking',
      'top_k',
      'repetition_penalty',
      'stream_options',
    ])
  )
  expect(find('qwen3.8-max', 'temperature')?.defaultValue).toBeUndefined()
  expect(find('qwen3.8-max', 'seed')).toMatchObject({
    range: '0 ~ 2147483647',
  })
})

it('keeps the generic chat parameters for models without a vendor profile', () => {
  const names = buildSupportedParameters(textModel('some-unknown-model')).map(
    (parameter) => parameter.name
  )

  expect(names).toEqual(
    expect.arrayContaining([
      'temperature',
      'top_p',
      'max_tokens',
      'n',
      'seed',
      'logit_bias',
    ])
  )
  expect(names).not.toContain('thinking')
})
