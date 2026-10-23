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
import {
  ChevronRight,
  Gauge,
  KeyRound,
  ScrollText,
  Sigma,
  Zap,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BundledLanguage } from 'shiki/bundle/web'

import {
  CodeBlock,
  CodeBlockCopyButton,
} from '@/components/ai-elements/code-block'
import {
  StaticDataTable,
  staticDataTableClassNames as tableStyles,
} from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useStatus } from '@/hooks/use-status'

import {
  buildRateLimits,
  buildSupportedParameters,
  formatRateLimit,
  isGptImage2Model,
  type SupportedParameter,
} from '../lib/mock-stats'
import { replaceModelInPath } from '../lib/model-helpers'
import type { PricingModel } from '../types'

// ---------------------------------------------------------------------------
// Code-sample registry
// ---------------------------------------------------------------------------
//
// Each sample is keyed by language and endpoint type. The endpoint type comes
// from the model's `supported_endpoint_types`; we render samples only for the
// types the model actually supports. This keeps copy-pasted code accurate and
// provider-shaped (OpenAI vs Anthropic vs Gemini, etc.).

type Lang = 'curl' | 'python' | 'typescript' | 'javascript'

const LANG_LABELS: Record<Lang, string> = {
  curl: 'cURL',
  python: 'Python',
  typescript: 'TypeScript',
  javascript: 'JavaScript',
}

const LANG_HIGHLIGHT: Record<Lang, BundledLanguage> = {
  curl: 'bash',
  python: 'python',
  typescript: 'typescript',
  javascript: 'javascript',
}

type SampleContext = {
  baseUrl: string
  apiKeyEnv: string
  modelName: string
  endpointType: string
  endpointPath: string
}

type VendorChatMessage = { role: 'system' | 'user'; content: string }

type VendorChatSpec = {
  messages: VendorChatMessage[]
  temperature?: number
  stream?: boolean
  // Extra request-body fields copied verbatim from the vendor's official
  // quick-start example (e.g. thinking / reasoning_effort objects).
  extraBody?: Record<string, unknown>
}

// Vendor-shaped chat examples for the text models served through this gateway.
// Each spec mirrors the vendor's official quick-start example (message flavor
// and default sampling), while the base URL and API key stay gateway-scoped.
const VENDOR_CHAT_SPECS: Array<{ match: RegExp; spec: VendorChatSpec }> = [
  {
    match: /^deepseek/i,
    spec: {
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
      ],
      stream: false,
    },
  },
  {
    match: /^kimi/i,
    spec: {
      messages: [
        {
          role: 'system',
          content:
            '你是 Kimi，由 Moonshot AI 提供的人工智能助手，你更擅长中文和英文的对话。',
        },
        { role: 'user', content: '你好，请你介绍一下自己。' },
      ],
      // kimi-k2.6 / kimi-k2.7-code fix temperature server-side (1.0 thinking
      // / 0.6 non-thinking) and reject other values, so no sampling params.
    },
  },
  {
    match: /^minimax-m3\.1-flash/i,
    spec: {
      messages: [{ role: 'user', content: 'Which is bigger, 9.11 or 9.9?' }],
      extraBody: {
        thinking: { type: 'adaptive' },
        reasoning_effort: 'max',
        max_completion_tokens: 500,
      },
    },
  },
  {
    match: /^minimax/i,
    spec: {
      messages: [{ role: 'user', content: 'Hello, how are you?' }],
    },
  },
  {
    match: /^glm/i,
    spec: {
      messages: [{ role: 'user', content: '你好' }],
      temperature: 1,
    },
  },
  {
    match: /^qwen/i,
    spec: {
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: '你是谁？' },
      ],
    },
  },
]

function buildChatSample(lang: Lang, ctx: SampleContext): string {
  const url = `${ctx.baseUrl}${ctx.endpointPath}`
  const isResponses = ctx.endpointType === 'openai-response'
  const isReasoning = /^o[1-4]|reasoning|thinking|deepseek-r/i.test(
    ctx.modelName
  )
  const vendor = VENDOR_CHAT_SPECS.find((entry) =>
    entry.match.test(ctx.modelName)
  )?.spec
  const messages: VendorChatMessage[] = vendor?.messages ?? [
    { role: 'user', content: 'Explain quantum entanglement in one paragraph.' },
  ]
  const userMessage = messages.at(-1)?.content ?? ''
  let temperature: number | undefined
  if (vendor) {
    temperature = vendor.temperature
  } else {
    temperature = isReasoning ? undefined : 0.7
  }

  const chatBody = {
    model: ctx.modelName,
    messages,
    ...(temperature !== undefined ? { temperature } : {}),
    ...(vendor?.stream !== undefined ? { stream: vendor.stream } : {}),
    ...vendor?.extraBody,
  }

  const bodyJson = isResponses
    ? JSON.stringify({ model: ctx.modelName, input: userMessage }, null, 2)
    : JSON.stringify(chatBody, null, 2)

  const fnCall = isResponses ? 'responses.create' : 'chat.completions.create'

  if (lang === 'curl') {
    return [
      `curl ${url} \\`,
      `  -H "Authorization: Bearer $${ctx.apiKeyEnv}" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '${bodyJson.replaceAll('\n', '\n     ')}'`,
    ].join('\n')
  }

  if (lang === 'python') {
    if (isResponses) {
      return [
        'from openai import OpenAI',
        '',
        'client = OpenAI(',
        `    base_url="${ctx.baseUrl}/v1",`,
        `    api_key="<YOUR_API_KEY>",`,
        ')',
        '',
        `response = client.${fnCall}(\n    model="${ctx.modelName}",\n    input="${userMessage}",\n)\n\nprint(response.output_text)`,
      ].join('\n')
    }
    const messageLines = messages
      .map((m) => `        {"role": "${m.role}", "content": "${m.content}"}`)
      .join(',\n')
    const paramLines = [
      `    model="${ctx.modelName}",`,
      '    messages=[',
      messageLines,
      '    ],',
      ...(temperature !== undefined ? [`    temperature=${temperature},`] : []),
      ...(vendor?.stream !== undefined ? [`    stream=${vendor.stream},`] : []),
      ...Object.entries(vendor?.extraBody ?? {}).map(
        ([key, value]) => `    ${key}=${JSON.stringify(value)},`
      ),
    ]
    return [
      'from openai import OpenAI',
      '',
      'client = OpenAI(',
      `    base_url="${ctx.baseUrl}/v1",`,
      `    api_key="<YOUR_API_KEY>",`,
      ')',
      '',
      `completion = client.${fnCall}(`,
      ...paramLines,
      ')',
      '',
      'print(completion.choices[0].message.content)',
    ].join('\n')
  }

  if (lang === 'typescript') {
    if (isResponses) {
      return [
        `import OpenAI from 'openai'`,
        '',
        `const client = new OpenAI({`,
        `  baseURL: '${ctx.baseUrl}/v1',`,
        `  apiKey: process.env.${ctx.apiKeyEnv},`,
        `})`,
        '',
        `const response = await client.${fnCall}({\n  model: '${ctx.modelName}',\n  input: '${userMessage}',\n})\n\nconsole.log(response.output_text)`,
      ].join('\n')
    }
    const singleMessage = messages.length === 1 ? messages[0] : undefined
    const messagesLine = singleMessage
      ? `  messages: [{ role: '${singleMessage.role}', content: '${singleMessage.content}' }],`
      : [
          '  messages: [',
          ...messages.map(
            (m) => `    { role: '${m.role}', content: '${m.content}' },`
          ),
          '  ],',
        ].join('\n')
    const paramLines = [
      `  model: '${ctx.modelName}',`,
      messagesLine,
      ...(temperature !== undefined ? [`  temperature: ${temperature},`] : []),
      ...(vendor?.stream !== undefined ? [`  stream: ${vendor.stream},`] : []),
      ...Object.entries(vendor?.extraBody ?? {}).map(
        ([key, value]) => `  ${key}: ${JSON.stringify(value)},`
      ),
    ]
    return [
      `import OpenAI from 'openai'`,
      '',
      `const client = new OpenAI({`,
      `  baseURL: '${ctx.baseUrl}/v1',`,
      `  apiKey: process.env.${ctx.apiKeyEnv},`,
      `})`,
      '',
      `const completion = await client.${fnCall}({`,
      ...paramLines,
      '})',
      '',
      'console.log(completion.choices[0].message.content)',
    ].join('\n')
  }

  return [
    `const response = await fetch('${url}', {`,
    `  method: 'POST',`,
    `  headers: {`,
    `    Authorization: \`Bearer \${process.env.${ctx.apiKeyEnv}}\`,`,
    `    'Content-Type': 'application/json',`,
    `  },`,
    `  body: JSON.stringify(${bodyJson}),`,
    `})`,
    '',
    `const data = await response.json()`,
    `console.log(data)`,
  ].join('\n')
}

function buildAnthropicSample(lang: Lang, ctx: SampleContext): string {
  const url = `${ctx.baseUrl}${ctx.endpointPath}`
  const userMessage = 'Explain quantum entanglement in one paragraph.'

  if (lang === 'curl') {
    const body = JSON.stringify(
      {
        model: ctx.modelName,
        max_tokens: 1024,
        messages: [{ role: 'user', content: userMessage }],
      },
      null,
      2
    )
    return [
      `curl ${url} \\`,
      `  -H "x-api-key: $${ctx.apiKeyEnv}" \\`,
      `  -H "anthropic-version: 2023-06-01" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '${body.replaceAll('\n', '\n     ')}'`,
    ].join('\n')
  }
  if (lang === 'python') {
    return [
      'import anthropic',
      '',
      'client = anthropic.Anthropic(',
      `    base_url="${ctx.baseUrl}",`,
      `    api_key="<YOUR_API_KEY>",`,
      ')',
      '',
      `message = client.messages.create(`,
      `    model="${ctx.modelName}",`,
      `    max_tokens=1024,`,
      `    messages=[{"role": "user", "content": "${userMessage}"}],`,
      ')',
      '',
      'print(message.content[0].text)',
    ].join('\n')
  }
  if (lang === 'typescript') {
    return [
      `import Anthropic from '@anthropic-ai/sdk'`,
      '',
      `const client = new Anthropic({`,
      `  baseURL: '${ctx.baseUrl}',`,
      `  apiKey: process.env.${ctx.apiKeyEnv},`,
      `})`,
      '',
      `const message = await client.messages.create({`,
      `  model: '${ctx.modelName}',`,
      `  max_tokens: 1024,`,
      `  messages: [{ role: 'user', content: '${userMessage}' }],`,
      `})`,
      '',
      `console.log(message.content[0].text)`,
    ].join('\n')
  }
  return [
    `const response = await fetch('${url}', {`,
    `  method: 'POST',`,
    `  headers: {`,
    `    'x-api-key': process.env.${ctx.apiKeyEnv},`,
    `    'anthropic-version': '2023-06-01',`,
    `    'Content-Type': 'application/json',`,
    `  },`,
    `  body: JSON.stringify({`,
    `    model: '${ctx.modelName}',`,
    `    max_tokens: 1024,`,
    `    messages: [{ role: 'user', content: '${userMessage}' }],`,
    `  }),`,
    `})`,
    '',
    `const data = await response.json()`,
    `console.log(data.content[0].text)`,
  ].join('\n')
}

function buildGeminiSample(lang: Lang, ctx: SampleContext): string {
  const url = `${ctx.baseUrl}${ctx.endpointPath}?key=$${ctx.apiKeyEnv}`
  const userMessage = 'Explain quantum entanglement in one paragraph.'

  if (lang === 'curl') {
    const body = JSON.stringify(
      { contents: [{ parts: [{ text: userMessage }] }] },
      null,
      2
    )
    return [
      `curl '${url}' \\`,
      `  -H 'Content-Type: application/json' \\`,
      `  -d '${body.replaceAll('\n', '\n     ')}'`,
    ].join('\n')
  }
  if (lang === 'python') {
    return [
      'import google.generativeai as genai',
      '',
      `genai.configure(api_key="<YOUR_API_KEY>")`,
      '',
      `model = genai.GenerativeModel("${ctx.modelName}")`,
      `response = model.generate_content("${userMessage}")`,
      '',
      `print(response.text)`,
    ].join('\n')
  }
  if (lang === 'typescript') {
    return [
      `import { GoogleGenerativeAI } from '@google/generative-ai'`,
      '',
      `const genAI = new GoogleGenerativeAI(process.env.${ctx.apiKeyEnv}!)`,
      `const model = genAI.getGenerativeModel({ model: '${ctx.modelName}' })`,
      '',
      `const result = await model.generateContent('${userMessage}')`,
      `console.log(result.response.text())`,
    ].join('\n')
  }
  return [
    `const response = await fetch('${url}', {`,
    `  method: 'POST',`,
    `  headers: { 'Content-Type': 'application/json' },`,
    `  body: JSON.stringify({`,
    `    contents: [{ parts: [{ text: '${userMessage}' }] }],`,
    `  }),`,
    `})`,
    '',
    `const data = await response.json()`,
    `console.log(data.candidates[0].content.parts[0].text)`,
  ].join('\n')
}

function buildEmbeddingSample(lang: Lang, ctx: SampleContext): string {
  const url = `${ctx.baseUrl}${ctx.endpointPath}`
  const text = 'The food was delicious and the waiter…'

  if (lang === 'curl') {
    const body = JSON.stringify({ model: ctx.modelName, input: text }, null, 2)
    return [
      `curl ${url} \\`,
      `  -H "Authorization: Bearer $${ctx.apiKeyEnv}" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '${body.replaceAll('\n', '\n     ')}'`,
    ].join('\n')
  }
  if (lang === 'python') {
    return [
      'from openai import OpenAI',
      '',
      `client = OpenAI(base_url="${ctx.baseUrl}/v1", api_key="<YOUR_API_KEY>")`,
      '',
      'response = client.embeddings.create(',
      `    model="${ctx.modelName}",`,
      `    input="${text}",`,
      ')',
      '',
      'print(response.data[0].embedding[:8])',
    ].join('\n')
  }
  if (lang === 'typescript') {
    return [
      `import OpenAI from 'openai'`,
      '',
      `const client = new OpenAI({`,
      `  baseURL: '${ctx.baseUrl}/v1',`,
      `  apiKey: process.env.${ctx.apiKeyEnv},`,
      `})`,
      '',
      `const response = await client.embeddings.create({`,
      `  model: '${ctx.modelName}',`,
      `  input: '${text}',`,
      `})`,
      '',
      `console.log(response.data[0].embedding.slice(0, 8))`,
    ].join('\n')
  }
  return [
    `const response = await fetch('${url}', {`,
    `  method: 'POST',`,
    `  headers: {`,
    `    Authorization: \`Bearer \${process.env.${ctx.apiKeyEnv}}\`,`,
    `    'Content-Type': 'application/json',`,
    `  },`,
    `  body: JSON.stringify({`,
    `    model: '${ctx.modelName}',`,
    `    input: '${text}',`,
    `  }),`,
    `})`,
    '',
    `const data = await response.json()`,
    `console.log(data.data[0].embedding.slice(0, 8))`,
  ].join('\n')
}

function buildImageSample(lang: Lang, ctx: SampleContext): string {
  const url = `${ctx.baseUrl}${ctx.endpointPath}`
  const prompt = 'A serene koi pond at sunset, ukiyo-e style.'
  const responseField = isGptImage2Model(ctx.modelName) ? 'b64_json' : 'url'

  if (lang === 'curl') {
    const body = JSON.stringify(
      { model: ctx.modelName, prompt, size: '1024x1024', n: 1 },
      null,
      2
    )
    return [
      `curl ${url} \\`,
      `  -H "Authorization: Bearer $${ctx.apiKeyEnv}" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '${body.replaceAll('\n', '\n     ')}'`,
    ].join('\n')
  }
  if (lang === 'python') {
    return [
      'from openai import OpenAI',
      '',
      `client = OpenAI(base_url="${ctx.baseUrl}/v1", api_key="<YOUR_API_KEY>")`,
      '',
      'response = client.images.generate(',
      `    model="${ctx.modelName}",`,
      `    prompt="${prompt}",`,
      `    size="1024x1024",`,
      `    n=1,`,
      ')',
      '',
      `print(response.data[0].${responseField})`,
    ].join('\n')
  }
  if (lang === 'typescript') {
    return [
      `import OpenAI from 'openai'`,
      '',
      `const client = new OpenAI({`,
      `  baseURL: '${ctx.baseUrl}/v1',`,
      `  apiKey: process.env.${ctx.apiKeyEnv},`,
      `})`,
      '',
      `const response = await client.images.generate({`,
      `  model: '${ctx.modelName}',`,
      `  prompt: '${prompt}',`,
      `  size: '1024x1024',`,
      `  n: 1,`,
      `})`,
      '',
      `console.log(response.data[0].${responseField})`,
    ].join('\n')
  }
  return [
    `const response = await fetch('${url}', {`,
    `  method: 'POST',`,
    `  headers: {`,
    `    Authorization: \`Bearer \${process.env.${ctx.apiKeyEnv}}\`,`,
    `    'Content-Type': 'application/json',`,
    `  },`,
    `  body: JSON.stringify({`,
    `    model: '${ctx.modelName}',`,
    `    prompt: '${prompt}',`,
    `    size: '1024x1024',`,
    `    n: 1,`,
    `  }),`,
    `})`,
    '',
    `const data = await response.json()`,
    `console.log(data.data[0].url)`,
  ].join('\n')
}

function buildVideoSample(lang: Lang, ctx: SampleContext): string {
  const url = ctx.baseUrl + ctx.endpointPath
  const prompt = 'A cinematic tracking shot through a neon-lit rainy alley.'
  const name = ctx.modelName.toLowerCase()
  let requestBody: Record<string, unknown>
  if (/^wan[\s-]?3/.test(name)) {
    // Wan 3.0: prompt + duration(5-30s) + 480p/720p/1080p, per-second billing.
    requestBody = {
      model: ctx.modelName,
      prompt,
      duration: 5,
      resolution: '480p',
    }
  } else if (/^minimax[\s-]?h3/.test(name)) {
    // MiniMax H3: prompt + duration(4-15s) + ratio + 768p.
    requestBody = {
      model: ctx.modelName,
      prompt,
      duration: 5,
      ratio: '16:9',
      resolution: '768p',
    }
  } else {
    requestBody = {
      model: ctx.modelName,
      resolution: '720p',
      ratio: '16:9',
      duration: 8,
      generate_audio: true,
      bitrate_mode: 'standard',
    }
  }
  if (ctx.endpointType === 'openai-response') {
    requestBody.input = prompt
  } else {
    requestBody.prompt = prompt
  }
  const bodyJson = JSON.stringify(requestBody, null, 2)

  if (lang === 'curl') {
    return [
      'curl -X POST ' + url + ' \\',
      '  -H "Authorization: Bearer $' + ctx.apiKeyEnv + '" \\',
      '  -H "Content-Type: application/json" \\',
      "  -d '" + bodyJson.replaceAll('\n', '\n     ') + "'",
    ].join('\n')
  }

  if (lang === 'python') {
    return [
      'import json',
      'import os',
      'import requests',
      '',
      'response = requests.post(',
      '    "' + url + '",',
      '    headers={',
      '        "Authorization": "Bearer " + os.environ["' +
        ctx.apiKeyEnv +
        '"],',
      '        "Content-Type": "application/json",',
      '    },',
      '    json=json.loads(r"""' + bodyJson + '"""),',
      ')',
      'response.raise_for_status()',
      'print(response.json())',
    ].join('\n')
  }

  const token = 'process.env.' + ctx.apiKeyEnv
  const tokenValue = lang === 'typescript' ? token + '!' : token
  return [
    "const response = await fetch('" + url + "', {",
    "  method: 'POST',",
    '  headers: {',
    "    Authorization: 'Bearer ' + " + tokenValue + ',',
    "    'Content-Type': 'application/json',",
    '  },',
    '  body: JSON.stringify(' + bodyJson + '),',
    '})',
    '',
    'if (!response.ok) throw new Error(await response.text())',
    'const video = await response.json()',
    'console.log(video)',
  ].join('\n')
}

// Exported for focused request-example regression tests.
// eslint-disable-next-line react-refresh/only-export-components
export function buildSample(
  lang: Lang,
  endpointType: string,
  ctx: SampleContext
): string {
  const seedanceName = ctx.modelName.toLowerCase()
  const isVideoEndpoint =
    endpointType === 'openai-video' || endpointType === 'openai-response'
  const isVideoModel =
    seedanceName.startsWith('seedance-2.0') ||
    seedanceName === 'seedance-2.5' ||
    /^minimax[\s-]?h3/.test(seedanceName) ||
    /^wan[\s-]?3/.test(seedanceName)
  if (isVideoEndpoint && isVideoModel) {
    return buildVideoSample(lang, ctx)
  }
  if (endpointType === 'anthropic') {
    return buildAnthropicSample(lang, ctx)
  }
  if (endpointType === 'gemini') {
    return buildGeminiSample(lang, ctx)
  }
  if (endpointType === 'embeddings' || endpointType === 'jina-rerank') {
    return buildEmbeddingSample(lang, ctx)
  }
  if (endpointType === 'image-generation') {
    return buildImageSample(lang, ctx)
  }
  return buildChatSample(lang, ctx)
}

// ---------------------------------------------------------------------------
// Code samples section
// ---------------------------------------------------------------------------

function CodeSamplesSection(props: {
  model: PricingModel
  endpointMap: Record<string, { path?: string; method?: string }>
}) {
  const { t } = useTranslation()
  const { status } = useStatus()

  const baseUrl = useMemo(() => {
    const candidate =
      (status as Record<string, unknown> | null)?.server_address ??
      (status as Record<string, unknown> | null)?.serverAddress ??
      (status?.data as Record<string, unknown> | undefined)?.server_address ??
      (status?.data as Record<string, unknown> | undefined)?.serverAddress
    if (candidate && typeof candidate === 'string') {
      return candidate.replace(/\/$/, '')
    }
    if (typeof window !== 'undefined') return window.location.origin
    return 'https://api.example.com'
  }, [status])

  const endpoints = useMemo(() => {
    const types = props.model.supported_endpoint_types || []
    return types
      .map((type) => {
        const info = props.endpointMap[type] || {}
        let path = info.path || ''
        if (path && path.includes('{model}')) {
          path = replaceModelInPath(path, props.model.model_name || '')
        }
        return { type, path, method: info.method || 'POST' }
      })
      .filter((e) => Boolean(e.path))
  }, [props.model, props.endpointMap])

  const [endpointType, setEndpointType] = useState<string>(
    endpoints[0]?.type ?? ''
  )
  const [lang, setLang] = useState<Lang>('curl')

  const activeEndpoint = useMemo(() => {
    return endpoints.find((e) => e.type === endpointType) ?? endpoints[0]
  }, [endpointType, endpoints])

  if (endpoints.length === 0 || !activeEndpoint) {
    return null
  }

  const code = buildSample(lang, activeEndpoint.type, {
    baseUrl,
    apiKeyEnv: 'NEW_API_KEY',
    modelName: props.model.model_name || '',
    endpointType: activeEndpoint.type,
    endpointPath: activeEndpoint.path,
  })

  return (
    <section>
      <SectionTitle icon={ScrollText}>{t('Code samples')}</SectionTitle>

      <div className='flex flex-wrap items-center gap-2'>
        {endpoints.length > 1 && (
          <Tabs value={endpointType} onValueChange={setEndpointType}>
            <TabsList className='bg-muted/40 h-8 p-0.5'>
              {endpoints.map((ep) => (
                <TabsTrigger
                  key={ep.type}
                  value={ep.type}
                  className='h-7 px-2.5 text-xs'
                >
                  {ep.type}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        <Tabs
          value={lang}
          onValueChange={(v) => setLang(v as Lang)}
          className='ml-auto'
        >
          <TabsList className='bg-muted/40 h-8 p-0.5'>
            {(Object.keys(LANG_LABELS) as Lang[]).map((l) => (
              <TabsTrigger key={l} value={l} className='h-7 px-2.5 text-xs'>
                {LANG_LABELS[l]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className='mt-3'>
        <CodeBlock code={code} language={LANG_HIGHLIGHT[lang]}>
          <CodeBlockCopyButton />
        </CodeBlock>
      </div>

      <p className='text-muted-foreground mt-2 text-xs'>
        {t('Replace')}{' '}
        <code className='bg-muted rounded px-1 py-0.5 font-mono text-[11px]'>
          {'<YOUR_API_KEY>'}
        </code>{' '}
        {t('with the API key from your token settings.')}
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Supported parameters table
// ---------------------------------------------------------------------------

// Exported for focused supported-parameter layout regression tests.
// eslint-disable-next-line react-refresh/only-export-components
export function SupportedParametersSection(props: { model: PricingModel }) {
  const { t } = useTranslation()
  const params = useMemo(
    () => buildSupportedParameters(props.model),
    [props.model]
  )

  if (params.length === 0) return null

  return (
    <section>
      <SectionTitle icon={Sigma}>{t('Supported parameters')}</SectionTitle>
      <StaticDataTable
        className={tableStyles.sectionContainer}
        headerRowClassName={tableStyles.mutedHeaderRow}
        tableClassName='table-fixed'
        data={params}
        getRowKey={(param) => param.name}
        getRowClassName={() => 'hover:bg-muted/20'}
        columns={[
          {
            id: 'parameter',
            header: t('Parameter'),
            className: 'h-9 w-44',
            cellClassName: tableStyles.topCell,
            cell: (p) => (
              <div className='flex items-center gap-1.5'>
                <code className='font-mono text-sm font-medium'>{p.name}</code>
                {p.required && (
                  <Badge
                    variant='outline'
                    className='h-6 border-rose-500/40 px-2 text-sm text-rose-600 dark:text-rose-400'
                  >
                    {t('required')}
                  </Badge>
                )}
              </div>
            ),
          },
          {
            id: 'type',
            header: t('Type'),
            className: 'h-9 w-24',
            cellClassName: tableStyles.topCell,
            cell: (p) => (
              <Badge
                variant='secondary'
                className='h-7 rounded-full px-2.5 font-mono text-sm font-normal'
              >
                {p.type}
              </Badge>
            ),
          },
          {
            id: 'range',
            header: t('Default / range'),
            className: 'h-9 w-56',
            cellClassName: tableStyles.topCell,
            cell: (p) => <ParamRangeCell param={p} />,
          },
          {
            id: 'description',
            header: t('Description'),
            className: 'h-9',
            cellClassName: tableStyles.topMutedCell,
            cell: (p) => (
              <span className='break-words whitespace-normal'>
                {t(p.descriptionKey)}
              </span>
            ),
          },
        ]}
      />
    </section>
  )
}

// Exported for focused parameter-value rendering regression tests.
// eslint-disable-next-line react-refresh/only-export-components
export function ParamRangeCell(props: { param: SupportedParameter }) {
  const hasDefault = props.param.defaultValue !== undefined
  const enumValues =
    props.param.enumValues?.filter(
      (value) => !hasDefault || value !== String(props.param.defaultValue)
    ) ?? []

  if (hasDefault || props.param.range || enumValues.length > 0) {
    return (
      <div className='flex min-w-0 flex-wrap items-center gap-1'>
        {hasDefault ? (
          <>
            <span className='text-muted-foreground text-sm'>=</span>
            <code className='bg-muted rounded px-1.5 py-0.5 font-mono text-sm'>
              {String(props.param.defaultValue)}
            </code>
          </>
        ) : null}
        {props.param.range ? (
          <span className='text-muted-foreground min-w-0 font-mono text-sm break-words whitespace-normal'>
            {props.param.range}
          </span>
        ) : null}
        {enumValues.map((value) => (
          <code
            key={value}
            className='bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-sm'
          >
            {value}
          </code>
        ))}
      </div>
    )
  }
  return <span className='text-muted-foreground/60 text-sm'>—</span>
}

// ---------------------------------------------------------------------------
// Rate-limits table
// ---------------------------------------------------------------------------

// Exported for focused sample-rate-limit labeling regression tests.
// eslint-disable-next-line react-refresh/only-export-components
export function RateLimitsSection(props: { model: PricingModel }) {
  const { t } = useTranslation()
  const limits = useMemo(() => buildRateLimits(props.model), [props.model])

  if (limits.length === 0) return null

  return (
    <section>
      <SectionTitle icon={Gauge}>
        {t('Rate limits')}
        <Badge
          variant='outline'
          className='h-6 border-amber-500/40 px-2 text-sm text-amber-600 dark:text-amber-400'
        >
          {t('Example')}
        </Badge>
      </SectionTitle>
      <StaticDataTable
        className={tableStyles.sectionContainer}
        headerRowClassName={tableStyles.mutedHeaderRow}
        data={limits}
        getRowKey={(limit) => limit.group}
        getRowClassName={() => 'hover:bg-muted/20'}
        columns={[
          {
            id: 'group',
            header: t('Group'),
            className: 'h-9',
            cellClassName: 'py-2 font-mono',
            cell: (limit) => limit.group,
          },
          {
            id: 'rpm',
            header: 'RPM',
            className: 'h-9 text-right',
            cellClassName: tableStyles.topNumericCell,
            cell: (limit) => formatRateLimit(limit.rpm),
          },
          {
            id: 'tpm',
            header: 'TPM',
            className: 'h-9 text-right',
            cellClassName: tableStyles.topNumericCell,
            cell: (limit) => formatRateLimit(limit.tpm),
          },
          {
            id: 'rpd',
            header: 'RPD',
            className: 'h-9 text-right',
            cellClassName: tableStyles.topNumericCell,
            cell: (limit) => formatRateLimit(limit.rpd),
          },
        ]}
      />
      <p className='text-muted-foreground mt-2 text-[11px] leading-relaxed'>
        {t(
          'Sample values for reference only; this deployment does not enforce these limits. RPM = requests per minute, TPM = tokens per minute, RPD = requests per day.'
        )}
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Authentication preview
// ---------------------------------------------------------------------------

function AuthSection() {
  const { t } = useTranslation()
  return (
    <section>
      <SectionTitle icon={KeyRound}>{t('Authentication')}</SectionTitle>
      <div className='border-border/60 bg-muted/20 flex items-start gap-2 rounded-lg border p-3'>
        <ChevronRight className='text-muted-foreground mt-0.5 size-3.5 shrink-0' />
        <div className='space-y-1.5 text-xs leading-relaxed'>
          <p>
            {t('All requests must include')}{' '}
            <code className='bg-muted rounded px-1 py-0.5 font-mono text-[11px]'>
              Authorization: Bearer &lt;TOKEN&gt;
            </code>{' '}
            {t('header. Anthropic-formatted endpoints accept the')}{' '}
            <code className='bg-muted rounded px-1 py-0.5 font-mono text-[11px]'>
              x-api-key
            </code>{' '}
            {t('header instead.')}
          </p>
          <p className='text-muted-foreground'>
            {t(
              'Generate tokens from the Tokens page; you can scope them to specific models, groups, IPs, and rate-limits.'
            )}
          </p>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Composite API tab
// ---------------------------------------------------------------------------

export function ModelDetailsApi(props: {
  model: PricingModel
  endpointMap: Record<string, { path?: string; method?: string }>
}) {
  return (
    <div className='space-y-6'>
      <CodeSamplesSection model={props.model} endpointMap={props.endpointMap} />
      <AuthSection />
      <SupportedParametersSection model={props.model} />
      <RateLimitsSection model={props.model} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Local UI helpers
// ---------------------------------------------------------------------------

function SectionTitle(props: {
  children: React.ReactNode
  icon: React.ComponentType<{ className?: string }>
}) {
  const Icon = props.icon
  return (
    <h3 className='text-foreground mb-3 flex items-center gap-1.5 text-sm font-semibold'>
      <Icon className='text-muted-foreground/70 size-3.5' />
      {props.children}
    </h3>
  )
}

// Re-export so the parent can keep its own SectionTitle if it wants:
export { Zap as ApiTabIcon }
