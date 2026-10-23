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
import type { PricingModel } from '../types'
import {
  hashStringToSeed,
  randomInRange,
  randomIntInRange,
  seededRandom,
} from './seed'

// ----------------------------------------------------------------------------
// Mock model statistics
// ----------------------------------------------------------------------------
//
// The backend has not yet implemented latency / uptime / app-ranking data.
// These helpers generate plausible, deterministic mock values seeded from
// the model name (and optionally the group name) so that:
//   - Every render of the same model shows the same numbers
//   - Different models / different groups render visibly distinct values
//
// When the backend ships real metrics, callers should switch to the
// real API and these helpers can be deleted. The shape of the returned
// data is designed to mirror what we expect the real endpoints to return.

export type GroupPerformance = {
  group: string
  ttft_p50_ms: number
  ttft_p95_ms: number
  ttft_p99_ms: number
  throughput_tps: number
  uptime_30d_pct: number
  /** Number of monitored requests in the last 24h (display only). */
  request_volume_24h: number
}

export type LatencyTimePoint = {
  timestamp: string
  group: string
  ttft_ms: number
}

export type UptimeDayPoint = {
  date: string
  uptime_pct: number
  incidents: number
  outage_minutes: number
}

export type AppRanking = {
  rank: number
  name: string
  description: string
  category: string
  growth_pct: number
  monthly_tokens: number
  url?: string
  initial: string
}

const APP_TEMPLATES: Array<
  Omit<AppRanking, 'rank' | 'monthly_tokens' | 'growth_pct' | 'initial'>
> = [
  {
    name: 'Cline',
    description: 'Autonomous coding agent inside the IDE',
    category: 'Coding',
    url: 'https://cline.bot',
  },
  {
    name: 'Roo Code',
    description: 'AI agent for VS Code with multi-step planning',
    category: 'Coding',
    url: 'https://roocode.com',
  },
  {
    name: 'Open WebUI',
    description: 'Self-hosted ChatGPT-like web interface',
    category: 'Chat',
    url: 'https://openwebui.com',
  },
  {
    name: 'LibreChat',
    description: 'Open-source chat platform with multi-model support',
    category: 'Chat',
    url: 'https://librechat.ai',
  },
  {
    name: 'Lobe Chat',
    description: 'Modern open-source chat UI with plugins',
    category: 'Chat',
    url: 'https://lobehub.com',
  },
  {
    name: 'NextChat',
    description: 'Cross-platform private ChatGPT client',
    category: 'Chat',
    url: 'https://nextchat.dev',
  },
  {
    name: 'Continue',
    description: 'Open-source AI code assistant for editors',
    category: 'Coding',
    url: 'https://continue.dev',
  },
  {
    name: 'Aider',
    description: 'Pair-programming agent in your terminal',
    category: 'Coding',
    url: 'https://aider.chat',
  },
  {
    name: 'Dify',
    description: 'LLM application development platform',
    category: 'Platform',
    url: 'https://dify.ai',
  },
  {
    name: 'FastGPT',
    description: 'Knowledge base orchestration and chat platform',
    category: 'Platform',
    url: 'https://fastgpt.in',
  },
  {
    name: 'Flowise',
    description: 'Low-code LLM workflow builder',
    category: 'Platform',
    url: 'https://flowiseai.com',
  },
  {
    name: 'OpenInterpreter',
    description: 'Natural-language code execution agent',
    category: 'Coding',
    url: 'https://openinterpreter.com',
  },
  {
    name: 'Devika',
    description: 'Open-source AI software engineer',
    category: 'Coding',
    url: 'https://github.com/stitionai/devika',
  },
  {
    name: 'Cherry Studio',
    description: 'Multi-model desktop chat client',
    category: 'Chat',
    url: 'https://cherry-ai.com',
  },
  {
    name: 'AnythingLLM',
    description: 'Workspaces around your private documents',
    category: 'Platform',
    url: 'https://anythingllm.com',
  },
  {
    name: 'OpenHands',
    description: 'Coding agent with browser-and-code tools',
    category: 'Coding',
    url: 'https://docs.all-hands.dev',
  },
  {
    name: 'Cursor',
    description: 'AI-native code editor',
    category: 'Coding',
    url: 'https://cursor.com',
  },
  {
    name: 'Zed',
    description: 'Multiplayer code editor with AI',
    category: 'Coding',
    url: 'https://zed.dev',
  },
  {
    name: 'Notion AI',
    description: 'Documents and writing assistant',
    category: 'Productivity',
    url: 'https://notion.so',
  },
  {
    name: 'Raycast AI',
    description: 'AI on your macOS launcher',
    category: 'Productivity',
    url: 'https://raycast.com',
  },
  {
    name: 'Obsidian Smart Connections',
    description: 'Connect notes with semantic search',
    category: 'Productivity',
  },
  {
    name: 'Bolt.new',
    description: 'Prompt-to-app full-stack builder',
    category: 'Coding',
    url: 'https://bolt.new',
  },
  {
    name: 'Pieces',
    description: 'AI workflow companion for developers',
    category: 'Productivity',
    url: 'https://pieces.app',
  },
  {
    name: 'AmazingAI',
    description: 'Personal AI knowledge assistant',
    category: 'Productivity',
  },
  {
    name: 'TypingMind',
    description: 'Better UI for ChatGPT and Claude',
    category: 'Chat',
    url: 'https://typingmind.com',
  },
]

const PROFILE_BY_NAME = (name: string) => {
  const n = name.toLowerCase()
  if (/embed|rerank/.test(n)) return 'embedding'
  if (/image|sora|veo|kling|pika|jimeng|dalle|imagen/.test(n)) return 'image'
  if (/whisper|tts|voice|audio/.test(n)) return 'audio'
  if (/o1|o3|o4|reasoning|thinking|deepseek-r/.test(n)) return 'reasoning'
  if (/flash|haiku|mini|small|nano|fast/.test(n)) return 'fast'
  if (/gpt-5|opus|ultra|405|70b/.test(n)) return 'large'
  return 'standard'
}

type ProfileSpec = {
  ttftRange: [number, number]
  throughputRange: [number, number]
  uptimeRange: [number, number]
}

const PROFILE_SPECS: Record<string, ProfileSpec> = {
  embedding: {
    ttftRange: [40, 120],
    throughputRange: [0, 0],
    uptimeRange: [99.9, 99.99],
  },
  image: {
    ttftRange: [2_500, 12_000],
    throughputRange: [0, 0],
    uptimeRange: [98.5, 99.8],
  },
  audio: {
    ttftRange: [180, 600],
    throughputRange: [0, 0],
    uptimeRange: [99.5, 99.95],
  },
  reasoning: {
    ttftRange: [1_800, 5_500],
    throughputRange: [25, 70],
    uptimeRange: [99.4, 99.95],
  },
  fast: {
    ttftRange: [180, 480],
    throughputRange: [110, 240],
    uptimeRange: [99.7, 99.99],
  },
  large: {
    ttftRange: [600, 1_400],
    throughputRange: [55, 95],
    uptimeRange: [99.5, 99.95],
  },
  standard: {
    ttftRange: [400, 900],
    throughputRange: [70, 140],
    uptimeRange: [99.6, 99.97],
  },
}

function rangeFromSeed(
  rand: () => number,
  [min, max]: [number, number]
): number {
  return randomInRange(rand, min, max)
}

function applyGroupFactor(value: number, factor: number): number {
  return value * factor
}

function groupFactor(
  group: string,
  baseSeed: number
): { ttft: number; throughput: number; uptime: number } {
  const rand = seededRandom(baseSeed ^ hashStringToSeed(group || 'default'))
  return {
    ttft: 0.85 + rand() * 0.55,
    throughput: 0.85 + rand() * 0.4,
    uptime: 0.997 + rand() * 0.003,
  }
}

/**
 * Build per-group performance stats for a model. Always returns at least one
 * row for each enabled group, sorted alphabetically.
 */
export function buildGroupPerformance(model: PricingModel): GroupPerformance[] {
  const groups = (model.enable_groups ?? []).filter((g) => g && g !== 'auto')
  const targets = groups.length > 0 ? groups : ['default']
  const profile = PROFILE_BY_NAME(model.model_name)
  const spec = PROFILE_SPECS[profile]
  const baseSeed = hashStringToSeed(model.model_name)

  return [...targets]
    .sort((a, b) => a.localeCompare(b))
    .map<GroupPerformance>((group) => {
      const rand = seededRandom(baseSeed ^ hashStringToSeed(group))
      const factor = groupFactor(group, baseSeed)
      const ttftP50 = applyGroupFactor(
        rangeFromSeed(rand, spec.ttftRange),
        factor.ttft
      )
      const throughput = applyGroupFactor(
        rangeFromSeed(rand, spec.throughputRange),
        factor.throughput
      )
      const uptimePct = Math.min(
        99.99,
        rangeFromSeed(rand, spec.uptimeRange) * factor.uptime
      )
      const requestVolume = randomIntInRange(rand, 18_000, 480_000)
      return {
        group,
        ttft_p50_ms: Math.round(ttftP50),
        ttft_p95_ms: Math.round(ttftP50 * (1.6 + rand() * 0.4)),
        ttft_p99_ms: Math.round(ttftP50 * (2.4 + rand() * 0.6)),
        throughput_tps: throughput === 0 ? 0 : Math.round(throughput * 10) / 10,
        uptime_30d_pct: Math.round(uptimePct * 100) / 100,
        request_volume_24h: requestVolume,
      }
    })
}

/**
 * Build a 24-hour latency series for each group. Returns one point per hour
 * (24 buckets), oldest first.
 */
export function buildLatencyTimeSeries(
  model: PricingModel
): LatencyTimePoint[] {
  const performances = buildGroupPerformance(model)
  if (performances.length === 0) return []

  const now = new Date()
  now.setMinutes(0, 0, 0)
  const baseSeed = hashStringToSeed(`${model.model_name}:lat`)
  const points: LatencyTimePoint[] = []

  for (const perf of performances) {
    const rand = seededRandom(baseSeed ^ hashStringToSeed(perf.group))
    for (let i = 23; i >= 0; i--) {
      const ts = new Date(now.getTime() - i * 3_600_000)
      const noise = 0.7 + rand() * 0.7
      const trend = 0.85 + Math.sin(i / 3) * 0.1
      const value = Math.max(50, Math.round(perf.ttft_p50_ms * noise * trend))
      points.push({
        timestamp: ts.toISOString(),
        group: perf.group,
        ttft_ms: value,
      })
    }
  }
  return points
}

/**
 * Build a 30-day uptime series. Returns one point per day, oldest first.
 *
 * If `group` is provided the series is anchored on that group's mean uptime,
 * otherwise it uses the per-model average. Either way the seed is derived
 * deterministically so re-renders are stable.
 */
export function buildUptimeSeries(
  model: PricingModel,
  group?: string
): UptimeDayPoint[] {
  const performances = buildGroupPerformance(model)
  if (performances.length === 0) return []

  const target = group ? performances.find((p) => p.group === group) : null
  const baseUptime = target
    ? target.uptime_30d_pct
    : performances.reduce((s, p) => s + p.uptime_30d_pct, 0) /
      performances.length
  const baseSeed = hashStringToSeed(`${model.model_name}:up:${group ?? '_all'}`)
  const rand = seededRandom(baseSeed)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const points: UptimeDayPoint[] = []

  for (let i = 29; i >= 0; i--) {
    const date = new Date(today.getTime() - i * 86_400_000)
    const isoDate = date.toISOString().slice(0, 10)
    const incidentChance = rand()
    const incidents = incidentChance > 0.92 ? 1 : 0
    const outageMinutes = incidents > 0 ? Math.round(rand() * 30 + 5) : 0
    const downtimePct = (outageMinutes / 1_440) * 100
    const dayUptime = Math.max(85, Math.min(100, baseUptime - downtimePct))
    points.push({
      date: isoDate,
      uptime_pct: Math.round(dayUptime * 100) / 100,
      incidents,
      outage_minutes: outageMinutes,
    })
  }

  return points
}

/**
 * Build a deterministic top-apps ranking for the model. The first three apps
 * always come from the same template list; the rest is shuffled by the seed
 * so different models surface different long tails.
 */
export function buildAppRankings(
  model: PricingModel,
  count = 12
): AppRanking[] {
  const baseSeed = hashStringToSeed(`${model.model_name}:apps`)
  const rand = seededRandom(baseSeed)
  const candidates = [...APP_TEMPLATES]
  // Fisher–Yates shuffle.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }

  const top = candidates.slice(0, count)
  const baseTokens = randomInRange(rand, 90_000_000, 320_000_000)

  return top.map((app, idx) => {
    const decay = Math.pow(0.78, idx)
    const monthlyTokens = Math.round(baseTokens * decay * (0.85 + rand() * 0.3))
    const growthPctRaw = randomInRange(rand, -28, 84)
    const growthPct = Math.round(growthPctRaw * 10) / 10
    return {
      rank: idx + 1,
      name: app.name,
      description: app.description,
      category: app.category,
      url: app.url,
      growth_pct: growthPct,
      monthly_tokens: monthlyTokens,
      initial: app.name.charAt(0).toUpperCase(),
    }
  })
}

/** Aggregate uptime over the most recent 30 days. */
export function aggregateUptime(points: UptimeDayPoint[]): {
  uptime_pct: number
  incidents: number
  outage_minutes: number
} {
  if (points.length === 0) {
    return { uptime_pct: 0, incidents: 0, outage_minutes: 0 }
  }
  const incidents = points.reduce((s, p) => s + p.incidents, 0)
  const outageMinutes = points.reduce((s, p) => s + p.outage_minutes, 0)
  const totalMinutes = points.length * 1_440
  const uptimePct = ((totalMinutes - outageMinutes) / totalMinutes) * 100
  return {
    incidents,
    outage_minutes: outageMinutes,
    uptime_pct: Math.round(uptimePct * 1000) / 1000,
  }
}

/** Compact integer formatter for token counts in apps tab. */
export function formatTokenVolume(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

// ---------------------------------------------------------------------------
// Mock supported-parameters & rate-limits & misc API metadata
// ---------------------------------------------------------------------------

export type SupportedParameter = {
  name: string
  type:
    | 'number'
    | 'integer'
    | 'boolean'
    | 'string'
    | 'object'
    | 'array'
    | 'enum'
  defaultValue?: string | number | boolean
  range?: string
  enumValues?: string[]
  descriptionKey: string
  required?: boolean
}

const COMMON_CHAT_PARAMS: SupportedParameter[] = [
  {
    name: 'temperature',
    type: 'number',
    defaultValue: 1,
    range: '0 ~ 2',
    descriptionKey: 'Sampling temperature; lower is more deterministic',
  },
  {
    name: 'top_p',
    type: 'number',
    defaultValue: 1,
    range: '0 ~ 1',
    descriptionKey: 'Nucleus sampling probability mass',
  },
  {
    name: 'max_tokens',
    type: 'integer',
    range: '>= 1',
    descriptionKey: 'Maximum number of tokens in the response',
  },
  {
    name: 'frequency_penalty',
    type: 'number',
    defaultValue: 0,
    range: '-2 ~ 2',
    descriptionKey: 'Penalises repetition of frequent tokens',
  },
  {
    name: 'presence_penalty',
    type: 'number',
    defaultValue: 0,
    range: '-2 ~ 2',
    descriptionKey: 'Encourages introducing new topics',
  },
  {
    name: 'stop',
    type: 'array',
    range: '<= 4',
    descriptionKey: 'Up to 4 strings that stop generation',
  },
  {
    name: 'seed',
    type: 'integer',
    descriptionKey: 'Deterministic sampling seed (best-effort)',
  },
  {
    name: 'n',
    type: 'integer',
    defaultValue: 1,
    range: '>= 1',
    descriptionKey: 'Number of completions to generate',
  },
  {
    name: 'stream',
    type: 'boolean',
    defaultValue: false,
    descriptionKey: 'Stream tokens via Server-Sent Events',
  },
  {
    name: 'response_format',
    type: 'object',
    descriptionKey: 'Force JSON object or schema-conforming output',
  },
  {
    name: 'tools',
    type: 'array',
    descriptionKey: 'Tool / function declarations the model may call',
  },
  {
    name: 'tool_choice',
    type: 'string',
    enumValues: ['auto', 'none', 'required'],
    descriptionKey: 'Tool-choice policy or specific tool name',
  },
  {
    name: 'logprobs',
    type: 'boolean',
    defaultValue: false,
    descriptionKey: 'Return per-token log probabilities',
  },
  {
    name: 'top_logprobs',
    type: 'integer',
    range: '0 ~ 20',
    descriptionKey: 'Number of top log probabilities returned per token',
  },
  {
    name: 'logit_bias',
    type: 'object',
    descriptionKey: 'Per-token logit bias map',
  },
  {
    name: 'user',
    type: 'string',
    descriptionKey: 'End-user identifier for abuse monitoring',
  },
]

const REASONING_PARAMS: SupportedParameter[] = [
  {
    name: 'reasoning_effort',
    type: 'enum',
    enumValues: ['low', 'medium', 'high'],
    defaultValue: 'medium',
    descriptionKey: 'Controls how much the model thinks before answering',
  },
  {
    name: 'max_completion_tokens',
    type: 'integer',
    range: '>= 1',
    descriptionKey: 'Maximum tokens including hidden reasoning tokens',
  },
  {
    name: 'stop',
    type: 'array',
    range: '<= 4',
    descriptionKey: 'Up to 4 strings that stop generation',
  },
  {
    name: 'seed',
    type: 'integer',
    descriptionKey: 'Deterministic sampling seed (best-effort)',
  },
  {
    name: 'stream',
    type: 'boolean',
    defaultValue: false,
    descriptionKey: 'Stream tokens via Server-Sent Events',
  },
  {
    name: 'response_format',
    type: 'object',
    descriptionKey: 'Force JSON object or schema-conforming output',
  },
  {
    name: 'tools',
    type: 'array',
    descriptionKey: 'Tool / function declarations the model may call',
  },
  {
    name: 'tool_choice',
    type: 'string',
    enumValues: ['auto', 'none', 'required'],
    descriptionKey: 'Tool-choice policy or specific tool name',
  },
  {
    name: 'user',
    type: 'string',
    descriptionKey: 'End-user identifier for abuse monitoring',
  },
]

// ---------------------------------------------------------------------------
// Vendor-specific chat parameter tables
// ---------------------------------------------------------------------------
//
// Vendor-shaped chat parameter sets for the text models served through this
// gateway. Each table mirrors the vendor's official API reference (parameter
// names, defaults and ranges); unsupported or deprecated generic parameters
// are omitted. Model-name prefixes mirror VENDOR_CHAT_SPECS in
// model-details-api.tsx.

// DeepSeek V4 API reference (deepseek-flash / deepseek-v4-pro):
// frequency_penalty / presence_penalty are deprecated and n / seed /
// logit_bias are not supported. `thinking` is an object and its `type`
// field toggles thinking; reasoning_effort none also disables thinking.
const DEEPSEEK_CHAT_PARAMS: SupportedParameter[] = [
  {
    name: 'thinking.type',
    type: 'enum',
    enumValues: ['enabled', 'disabled'],
    defaultValue: 'enabled',
    descriptionKey: 'Toggles thinking mode',
  },
  {
    name: 'reasoning_effort',
    type: 'enum',
    enumValues: ['none', 'low', 'high', 'max'],
    defaultValue: 'high',
    range: 'none disables thinking; minimal→low; medium/xhigh→high',
    descriptionKey: 'Controls how much the model thinks before answering',
  },
  {
    name: 'temperature',
    type: 'number',
    defaultValue: 1,
    range: '0 ~ 2 (ignored in thinking mode)',
    descriptionKey: 'Sampling temperature; lower is more deterministic',
  },
  {
    name: 'top_p',
    type: 'number',
    defaultValue: 1,
    range: '0 ~ 1 (effective 0.95 ~ 1 in thinking mode)',
    descriptionKey: 'Nucleus sampling probability mass',
  },
  {
    name: 'max_tokens',
    type: 'integer',
    range: '1 ~ 393216',
    descriptionKey: 'Maximum number of tokens in the response',
  },
  {
    name: 'stop',
    type: 'array',
    range: '<= 16',
    descriptionKey: 'Sequences that stop generation',
  },
  {
    name: 'stream',
    type: 'boolean',
    defaultValue: false,
    descriptionKey: 'Stream tokens via Server-Sent Events',
  },
  {
    name: 'stream_options',
    type: 'object',
    range: 'requires stream: true; include_usage: boolean',
    descriptionKey: 'Options for streaming responses, such as include_usage',
  },
  {
    name: 'response_format',
    type: 'enum',
    enumValues: ['text', 'json_object'],
    defaultValue: 'text',
    descriptionKey: 'Force JSON object or schema-conforming output',
  },
  {
    name: 'logprobs',
    type: 'boolean',
    defaultValue: false,
    descriptionKey: 'Return per-token log probabilities',
  },
  {
    name: 'top_logprobs',
    type: 'integer',
    range: '0 ~ 20',
    descriptionKey: 'Number of top log probabilities returned per token',
  },
  {
    name: 'tools',
    type: 'array',
    descriptionKey: 'Tool / function declarations the model may call',
  },
  {
    name: 'tool_choice',
    type: 'string',
    enumValues: ['auto', 'none', 'required'],
    range: 'required / named tool unsupported in thinking mode',
    descriptionKey: 'Tool-choice policy or specific tool name',
  },
]

// Kimi K2.6 API reference: temperature is fixed by the API (1.0 thinking,
// 0.6 non-thinking) and other values are rejected; top_p is not documented.
const KIMI_CHAT_PARAMS: SupportedParameter[] = [
  {
    name: 'temperature',
    type: 'number',
    range: 'thinking 1.0 / non-thinking 0.6',
    descriptionKey:
      'Sampling temperature is fixed by the model; other values are rejected',
  },
  {
    name: 'thinking',
    type: 'enum',
    enumValues: ['enabled', 'disabled'],
    defaultValue: 'enabled',
    descriptionKey: 'Toggles thinking mode',
  },
  {
    name: 'max_completion_tokens',
    type: 'integer',
    range: '>= 1',
    descriptionKey: 'Maximum number of completion tokens',
  },
  {
    name: 'stop',
    type: 'array',
    range: '<= 5 x 32 bytes',
    descriptionKey: 'Sequences that stop generation',
  },
  {
    name: 'stream',
    type: 'boolean',
    defaultValue: false,
    descriptionKey: 'Stream tokens via Server-Sent Events',
  },
  {
    name: 'stream_options',
    type: 'object',
    range: 'include_usage: boolean',
    descriptionKey: 'Options for streaming responses, such as include_usage',
  },
  {
    name: 'response_format',
    type: 'enum',
    enumValues: ['text', 'json_object', 'json_schema'],
    defaultValue: 'text',
    descriptionKey: 'Force JSON object or schema-conforming output',
  },
  {
    name: 'tools',
    type: 'array',
    range: '<= 128',
    descriptionKey: 'Tool / function declarations the model may call',
  },
  {
    name: 'prompt_cache_key',
    type: 'string',
    descriptionKey: 'Cache key to improve prompt-cache hit rate',
  },
]

// Kimi K3 API reference: thinking is always on and tuned with
// reasoning_effort; temperature / top_p are fixed and must be omitted;
// max_completion_tokens defaults to 131072.
const KIMI_K3_CHAT_PARAMS: SupportedParameter[] = [
  {
    name: 'reasoning_effort',
    type: 'enum',
    enumValues: ['low', 'high', 'max'],
    defaultValue: 'max',
    range: 'K3 always thinks; thinking toggle not supported',
    descriptionKey: 'Controls how much the model thinks before answering',
  },
  {
    name: 'temperature',
    type: 'number',
    range: 'fixed 1.0 (omit)',
    descriptionKey: 'Sampling temperature; lower is more deterministic',
  },
  {
    name: 'top_p',
    type: 'number',
    range: 'fixed 0.95 (omit)',
    descriptionKey: 'Nucleus sampling probability mass',
  },
  {
    name: 'max_completion_tokens',
    type: 'integer',
    defaultValue: 131072,
    range: '1 ~ 1048576',
    descriptionKey: 'Maximum number of completion tokens',
  },
  {
    name: 'stop',
    type: 'array',
    range: '<= 5 x 32 bytes',
    descriptionKey: 'Sequences that stop generation',
  },
  {
    name: 'stream',
    type: 'boolean',
    defaultValue: false,
    descriptionKey: 'Stream tokens via Server-Sent Events',
  },
  {
    name: 'stream_options',
    type: 'object',
    range: 'include_usage: boolean',
    descriptionKey: 'Options for streaming responses, such as include_usage',
  },
  {
    name: 'response_format',
    type: 'enum',
    enumValues: ['text', 'json_object', 'json_schema'],
    defaultValue: 'text',
    descriptionKey: 'Force JSON object or schema-conforming output',
  },
  {
    name: 'tools',
    type: 'array',
    range: '<= 128',
    descriptionKey: 'Tool / function declarations the model may call',
  },
  {
    name: 'prompt_cache_key',
    type: 'string',
    descriptionKey: 'Cache key to improve prompt-cache hit rate',
  },
]

// kimi-k2.7-code always thinks; thinking.type only accepts "enabled" and
// "disabled" is rejected by the API.
const KIMI_CODE_CHAT_PARAMS: SupportedParameter[] = KIMI_CHAT_PARAMS.map(
  (param) => {
    if (param.name === 'thinking') {
      return {
        ...param,
        type: 'object' as const,
        enumValues: undefined,
        defaultValue: undefined,
        descriptionKey:
          'Thinking is always enabled; output returns in reasoning_content',
      }
    }
    return param
  }
)

const MINIMAX_M2_CHAT_PARAMS: SupportedParameter[] = [
  {
    name: 'thinking',
    type: 'object',
    descriptionKey:
      'Thinking is always enabled; output returns in reasoning_content',
  },
  {
    name: 'temperature',
    type: 'number',
    defaultValue: 1,
    range: '0 ~ 2',
    descriptionKey: 'Sampling temperature; lower is more deterministic',
  },
  {
    name: 'top_p',
    type: 'number',
    defaultValue: 0.9,
    range: '0 ~ 1',
    descriptionKey: 'Nucleus sampling probability mass',
  },
  {
    name: 'max_completion_tokens',
    type: 'integer',
    range: '>= 1',
    descriptionKey: 'Maximum number of completion tokens',
  },
  {
    name: 'service_tier',
    type: 'enum',
    enumValues: ['standard', 'priority'],
    defaultValue: 'standard',
    descriptionKey: 'Request admission tier; priority costs 1.5x standard',
  },
  {
    name: 'stream',
    type: 'boolean',
    defaultValue: false,
    descriptionKey: 'Stream tokens via Server-Sent Events',
  },
  {
    name: 'stream_options',
    type: 'object',
    range: 'include_usage: boolean',
    descriptionKey: 'Options for streaming responses, such as include_usage',
  },
  {
    name: 'tools',
    type: 'array',
    descriptionKey: 'Tool / function declarations the model may call',
  },
]

const MINIMAX_M3_CHAT_PARAMS: SupportedParameter[] = MINIMAX_M2_CHAT_PARAMS.map(
  (param) => {
    if (param.name === 'thinking') {
      return {
        ...param,
        name: 'thinking.type',
        type: 'enum' as const,
        enumValues: ['adaptive', 'disabled'],
        defaultValue: 'adaptive',
        descriptionKey: 'Toggles thinking mode',
      }
    }
    if (param.name === 'top_p') {
      return { ...param, defaultValue: 0.95 }
    }
    return param
  }
)

// MiniMax-M3.1-Flash API reference: it always thinks (thinking.type disabled
// returns HTTP 400) and is the only MiniMax model whose thinking depth is
// tunable via reasoning_effort; it does not support service_tier.
const MINIMAX_M31_FLASH_CHAT_PARAMS: SupportedParameter[] = [
  {
    name: 'thinking.type',
    type: 'enum',
    enumValues: ['adaptive'],
    defaultValue: 'adaptive',
    range: 'disabled is rejected',
    descriptionKey: 'Toggles thinking mode',
  },
  {
    name: 'reasoning_effort',
    type: 'enum',
    enumValues: ['max', 'xhigh', 'high', 'medium', 'low'],
    defaultValue: 'max',
    range: 'none is rejected',
    descriptionKey: 'Controls how much the model thinks before answering',
  },
  {
    name: 'temperature',
    type: 'number',
    defaultValue: 1,
    range: '0 ~ 2',
    descriptionKey: 'Sampling temperature; lower is more deterministic',
  },
  {
    name: 'top_p',
    type: 'number',
    defaultValue: 0.95,
    range: '0 ~ 1',
    descriptionKey: 'Nucleus sampling probability mass',
  },
  {
    name: 'max_completion_tokens',
    type: 'integer',
    range: '1 ~ 524288',
    descriptionKey: 'Maximum number of completion tokens',
  },
  {
    name: 'stream',
    type: 'boolean',
    defaultValue: false,
    descriptionKey: 'Stream tokens via Server-Sent Events',
  },
  {
    name: 'stream_options',
    type: 'object',
    range: 'include_usage: boolean',
    descriptionKey: 'Options for streaming responses, such as include_usage',
  },
  {
    name: 'tools',
    type: 'array',
    descriptionKey: 'Tool / function declarations the model may call',
  },
]

// GLM-5.x API reference: `thinking` is an object and its `type` field toggles
// thinking; temperature accepts (0, 1] with two decimals; reasoning_effort is
// only available on GLM-5.2 and later and is validated per model generation.
const GLM_5_1_CHAT_PARAMS: SupportedParameter[] = [
  {
    name: 'thinking.type',
    type: 'enum',
    enumValues: ['enabled', 'disabled'],
    defaultValue: 'enabled',
    descriptionKey: 'Toggles thinking mode',
  },
  {
    name: 'do_sample',
    type: 'boolean',
    defaultValue: true,
    descriptionKey: 'Disables sampling; temperature and top_p are ignored',
  },
  {
    name: 'temperature',
    type: 'number',
    defaultValue: 1,
    range: '(0, 1]',
    descriptionKey: 'Sampling temperature; lower is more deterministic',
  },
  {
    name: 'top_p',
    type: 'number',
    defaultValue: 0.95,
    range: '0.01 ~ 1',
    descriptionKey: 'Nucleus sampling probability mass',
  },
  {
    name: 'max_tokens',
    type: 'integer',
    range: '1 ~ 131072',
    descriptionKey: 'Maximum number of tokens in the response',
  },
  {
    name: 'stop',
    type: 'array',
    range: '<= 4',
    descriptionKey: 'Sequences that stop generation',
  },
  {
    name: 'stream',
    type: 'boolean',
    defaultValue: false,
    descriptionKey: 'Stream tokens via Server-Sent Events',
  },
  {
    name: 'response_format',
    type: 'enum',
    enumValues: ['text', 'json_object'],
    defaultValue: 'text',
    descriptionKey: 'Force JSON object or schema-conforming output',
  },
  {
    name: 'tools',
    type: 'array',
    descriptionKey: 'Tool / function declarations the model may call',
  },
  {
    name: 'tool_choice',
    type: 'string',
    enumValues: ['auto'],
    descriptionKey: 'Tool-choice policy or specific tool name',
  },
]

// GLM-5.2 accepts the full reasoning_effort scale: none / minimal stop
// thinking, low / medium map to high, and xhigh maps to max.
const GLM_5_2_CHAT_PARAMS: SupportedParameter[] = [
  GLM_5_1_CHAT_PARAMS[0],
  {
    name: 'reasoning_effort',
    type: 'enum',
    enumValues: ['max', 'xhigh', 'high', 'medium', 'low', 'minimal', 'none'],
    defaultValue: 'max',
    range: 'none/minimal disables thinking; low/medium→high; xhigh→max',
    descriptionKey: 'Controls how much the model thinks before answering',
  },
  ...GLM_5_1_CHAT_PARAMS.slice(1),
]

// GLM-5.3 always thinks: thinking.type disabled is rejected and only the
// low / high / max reasoning_effort levels are accepted.
const GLM_5_3_CHAT_PARAMS: SupportedParameter[] = [
  {
    name: 'thinking.type',
    type: 'enum',
    enumValues: ['enabled'],
    defaultValue: 'enabled',
    range: 'disabled is rejected',
    descriptionKey: 'Toggles thinking mode',
  },
  {
    name: 'reasoning_effort',
    type: 'enum',
    enumValues: ['max', 'high', 'low'],
    defaultValue: 'max',
    range: 'other values are rejected',
    descriptionKey: 'Controls how much the model thinks before answering',
  },
  ...GLM_5_1_CHAT_PARAMS.slice(1),
]

const QWEN_CHAT_PARAMS: SupportedParameter[] = [
  {
    name: 'enable_thinking',
    type: 'boolean',
    defaultValue: true,
    descriptionKey: 'Toggles thinking mode',
  },
  {
    name: 'temperature',
    type: 'number',
    range: '0 ~ 2',
    descriptionKey: 'Sampling temperature; lower is more deterministic',
  },
  {
    name: 'top_p',
    type: 'number',
    range: '0 ~ 1',
    descriptionKey: 'Nucleus sampling probability mass',
  },
  {
    name: 'top_k',
    type: 'integer',
    range: '0 ~ 100',
    descriptionKey: 'Limits sampling to the top K candidate tokens',
  },
  {
    name: 'presence_penalty',
    type: 'number',
    range: '-2 ~ 2',
    descriptionKey: 'Encourages introducing new topics',
  },
  {
    name: 'frequency_penalty',
    type: 'number',
    range: '-2 ~ 2',
    descriptionKey: 'Penalises repetition of frequent tokens',
  },
  {
    name: 'repetition_penalty',
    type: 'number',
    defaultValue: 1,
    range: '> 0',
    descriptionKey:
      'Multiplier applied to repeated tokens; 1.0 disables the penalty',
  },
  {
    name: 'max_tokens',
    type: 'integer',
    defaultValue: 65536,
    range: '>= 1',
    descriptionKey: 'Maximum number of tokens in the response',
  },
  {
    name: 'seed',
    type: 'integer',
    range: '0 ~ 2147483647',
    descriptionKey: 'Deterministic sampling seed (best-effort)',
  },
  {
    name: 'stop',
    type: 'array',
    descriptionKey: 'Sequences that stop generation',
  },
  {
    name: 'stream',
    type: 'boolean',
    defaultValue: false,
    descriptionKey: 'Stream tokens via Server-Sent Events',
  },
  {
    name: 'stream_options',
    type: 'object',
    range: 'include_usage: boolean',
    descriptionKey: 'Options for streaming responses, such as include_usage',
  },
  {
    name: 'response_format',
    type: 'enum',
    enumValues: ['text', 'json_object'],
    defaultValue: 'text',
    descriptionKey: 'Force JSON object or schema-conforming output',
  },
  {
    name: 'tools',
    type: 'array',
    descriptionKey: 'Tool / function declarations the model may call',
  },
  {
    name: 'tool_choice',
    type: 'string',
    enumValues: ['auto', 'none', 'required'],
    descriptionKey: 'Tool-choice policy or specific tool name',
  },
]

const VENDOR_CHAT_PARAMS: Array<{
  match: RegExp
  params: SupportedParameter[]
}> = [
  { match: /^deepseek/i, params: DEEPSEEK_CHAT_PARAMS },
  { match: /^kimi-k2\.7-code/i, params: KIMI_CODE_CHAT_PARAMS },
  { match: /^kimi-k3/i, params: KIMI_K3_CHAT_PARAMS },
  { match: /^kimi/i, params: KIMI_CHAT_PARAMS },
  { match: /^minimax-m3\.1-flash/i, params: MINIMAX_M31_FLASH_CHAT_PARAMS },
  { match: /^minimax-m3/i, params: MINIMAX_M3_CHAT_PARAMS },
  { match: /^minimax/i, params: MINIMAX_M2_CHAT_PARAMS },
  { match: /^glm-5\.3/i, params: GLM_5_3_CHAT_PARAMS },
  { match: /^glm-5\.2/i, params: GLM_5_2_CHAT_PARAMS },
  { match: /^glm/i, params: GLM_5_1_CHAT_PARAMS },
  { match: /^qwen/i, params: QWEN_CHAT_PARAMS },
]

const EMBEDDING_PARAMS: SupportedParameter[] = [
  {
    name: 'input',
    type: 'string',
    required: true,
    descriptionKey: 'Text or array of texts to embed',
  },
  {
    name: 'dimensions',
    type: 'integer',
    range: '>= 1',
    descriptionKey: 'Truncate embeddings to this many dimensions',
  },
  {
    name: 'encoding_format',
    type: 'enum',
    enumValues: ['float', 'base64'],
    defaultValue: 'float',
    descriptionKey: 'Wire encoding for the embedding vectors',
  },
  {
    name: 'user',
    type: 'string',
    descriptionKey: 'End-user identifier for abuse monitoring',
  },
]

const IMAGE_PARAMS: SupportedParameter[] = [
  {
    name: 'prompt',
    type: 'string',
    required: true,
    descriptionKey: 'Text description of the desired image',
  },
  {
    name: 'size',
    type: 'enum',
    enumValues: ['256x256', '512x512', '1024x1024', '1024x1792', '1792x1024'],
    defaultValue: '1024x1024',
    descriptionKey: 'Output image size',
  },
  {
    name: 'quality',
    type: 'enum',
    enumValues: ['standard', 'hd'],
    defaultValue: 'standard',
    descriptionKey: 'Generation quality preset',
  },
  {
    name: 'n',
    type: 'integer',
    defaultValue: 1,
    range: '1 ~ 10',
    descriptionKey: 'Number of images to generate',
  },
  {
    name: 'response_format',
    type: 'enum',
    enumValues: ['url', 'b64_json'],
    defaultValue: 'b64_json',
    descriptionKey: 'How to deliver the resulting image',
  },
]

const GPT_IMAGE_2_MODEL_PATTERN = /^(?:gpt-)?image-2(?:-\d{4}-\d{2}-\d{2})?$/i
const GPT_IMAGE_25_MODEL_PATTERN =
  /^(?:gpt-)?image-2\.5-(?:sunburst|flare)(?:-\d{4}-\d{2}-\d{2})?$/i

export function isGptImage2Model(modelName: string): boolean {
  return (
    GPT_IMAGE_2_MODEL_PATTERN.test(modelName) ||
    GPT_IMAGE_25_MODEL_PATTERN.test(modelName)
  )
}

function createGptImage2Parameters(
  qualityValues: string[]
): SupportedParameter[] {
  return [
    {
      name: 'prompt',
      type: 'string',
      required: true,
      range: '<= 32,000 characters',
      descriptionKey: 'Text description of the desired image',
    },
    {
      name: 'size',
      type: 'string',
      defaultValue: 'auto',
      range:
        '宽x高；边长16的倍数；比例1:3~3:1；总像素65.5万~829.4万；单边≤3840px。',
      descriptionKey:
        'Use auto to let the model choose, or specify WIDTHxHEIGHT. Valid examples: 1024x1024, 1280x768, 768x1280, 1920x1088, and 3840x2160. Invalid examples: 512x512 (too few total pixels), 1920x1080 (height is not divisible by 16), and 4096x1376 (width exceeds 3,840px).',
    },
    {
      name: 'quality',
      type: 'enum',
      enumValues: qualityValues,
      defaultValue: 'auto',
      descriptionKey: 'Generation quality preset',
    },
    {
      name: 'n',
      type: 'integer',
      defaultValue: 1,
      range: '1 ~ 10',
      descriptionKey: 'Number of images to generate',
    },
    {
      name: 'background',
      type: 'enum',
      enumValues: ['auto', 'opaque', 'transparent'],
      defaultValue: 'auto',
      descriptionKey:
        'Generated image background; transparent requires PNG or WebP',
    },
    {
      name: 'output_format',
      type: 'enum',
      enumValues: ['png', 'jpeg', 'webp'],
      defaultValue: 'png',
      descriptionKey: 'File format for base64-encoded image data',
    },
    {
      name: 'output_compression',
      type: 'integer',
      defaultValue: 100,
      range: '0 ~ 100',
      descriptionKey: 'Compression level for JPEG or WebP output',
    },
    {
      name: 'moderation',
      type: 'enum',
      enumValues: ['auto', 'low'],
      defaultValue: 'auto',
      descriptionKey: 'Content moderation level for generated images',
    },
    {
      name: 'stream',
      type: 'boolean',
      defaultValue: false,
      descriptionKey: 'Stream image generation events',
    },
    {
      name: 'partial_images',
      type: 'integer',
      range: '0 ~ 3',
      descriptionKey: 'Number of preview images returned while streaming',
    },
    {
      name: 'user',
      type: 'string',
      descriptionKey: 'End-user identifier for abuse monitoring',
    },
  ]
}

const GPT_IMAGE_2_PARAMS = createGptImage2Parameters([
  'auto',
  'low',
  'medium',
  'high',
])
const GPT_IMAGE_25_PARAMS = createGptImage2Parameters([
  'auto',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
])

const VIDEO_PARAMS: SupportedParameter[] = [
  {
    name: 'prompt',
    type: 'string',
    required: true,
    descriptionKey: 'Text description of the desired video',
  },
  {
    name: 'duration',
    type: 'integer',
    range: '1 ~ 60',
    descriptionKey: 'Video length in seconds',
  },
  {
    name: 'aspect_ratio',
    type: 'enum',
    enumValues: ['16:9', '9:16', '1:1'],
    defaultValue: '16:9',
    descriptionKey: 'Output aspect ratio',
  },
  {
    name: 'fps',
    type: 'integer',
    range: '8 ~ 60',
    defaultValue: 24,
    descriptionKey: 'Frames per second',
  },
]

function createMinimaxH3Parameters(): SupportedParameter[] {
  return [
    {
      name: 'prompt',
      type: 'string',
      required: true,
      descriptionKey: 'Text description of the desired video',
    },
    {
      name: 'duration',
      type: 'integer',
      defaultValue: 15,
      range: '4 ~ 15',
      descriptionKey: 'Video length in seconds',
    },
    {
      name: 'ratio',
      type: 'enum',
      enumValues: ['16:9', '9:16', '1:1'],
      defaultValue: '16:9',
      descriptionKey: 'Output aspect ratio',
    },
    {
      name: 'resolution',
      type: 'enum',
      enumValues: ['768p'],
      defaultValue: '768p',
      descriptionKey: 'Output resolution',
    },
    {
      name: 'images',
      type: 'array',
      descriptionKey: 'Reference image URLs; up to 9 images total',
    },
    {
      name: 'videos',
      type: 'array',
      descriptionKey: 'Reference video URLs',
    },
    {
      name: 'audios',
      type: 'array',
      descriptionKey: 'Reference audio URLs',
    },
    {
      name: 'materials',
      type: 'array',
      descriptionKey: 'Mixed reference media items (type + url)',
    },
    {
      name: 'aspect_ratio',
      type: 'enum',
      enumValues: ['16:9', '9:16', '1:1'],
      descriptionKey: 'Alias of ratio',
    },
  ]
}

function createSeedanceVideoParameters(
  resolutions: string[]
): SupportedParameter[] {
  return [
    {
      name: 'prompt',
      type: 'string',
      descriptionKey:
        'Text prompt; optional when content supplies instructions',
    },
    {
      name: 'content',
      type: 'array',
      descriptionKey: 'Text and media items with Seedance roles',
    },
    {
      name: 'input_reference',
      type: 'string',
      descriptionKey: 'First-frame image URL or base64 data URL',
    },
    {
      name: 'image',
      type: 'string',
      descriptionKey: 'Alias of input_reference for the first frame',
    },
    {
      name: 'images',
      type: 'array',
      descriptionKey: 'Reference image URLs; up to 9 images total',
    },
    {
      name: 'size',
      type: 'string',
      descriptionKey: 'Compatibility size: 480p, 720p, or WIDTHxHEIGHT',
    },
    {
      name: 'resolution',
      type: 'enum',
      enumValues: resolutions,
      defaultValue: '720p',
      descriptionKey: 'Output resolution',
    },
    {
      name: 'ratio',
      type: 'enum',
      enumValues: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
      defaultValue: '16:9',
      descriptionKey: 'Output aspect ratio',
    },
    {
      name: 'aspect_ratio',
      type: 'enum',
      enumValues: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
      descriptionKey: 'Alias of ratio',
    },
    {
      name: 'duration',
      type: 'integer',
      defaultValue: 8,
      range: '4 ~ 15',
      descriptionKey: 'Video length in seconds',
    },
    {
      name: 'seconds',
      type: 'integer',
      range: '4 ~ 15',
      descriptionKey: 'Alias of duration',
    },
    {
      name: 'generate_audio',
      type: 'boolean',
      descriptionKey: 'Generate synchronized audio',
    },
    {
      name: 'seed',
      type: 'integer',
      descriptionKey: 'Reproducible generation seed (best-effort)',
    },
    {
      name: 'guidance_scale',
      type: 'number',
      range: '> 0',
      descriptionKey: 'Prompt guidance strength; must be greater than 0',
    },
    {
      name: 'watermark',
      type: 'boolean',
      descriptionKey: 'Add a watermark to the output',
    },
    {
      name: 'bitrate_mode',
      type: 'enum',
      enumValues: ['standard', 'high'],
      descriptionKey: 'Output bitrate mode',
    },
    {
      name: 'metadata',
      type: 'object',
      descriptionKey: 'Additional request options merged into the request',
    },
  ]
}

type ApiCategory = 'reasoning' | 'embedding' | 'image' | 'video' | 'chat'

/**
 * Refine the broad PROFILE_BY_NAME bucket into an API-shape category. The
 * `image` bucket from `PROFILE_BY_NAME` lumps still-image and video models
 * together (because their performance profiles overlap); for the API tab we
 * need to distinguish them so the request-parameter table is accurate.
 */
function apiCategoryOf(model: PricingModel): ApiCategory {
  if (model.supported_endpoint_types?.includes('openai-video')) {
    return 'video'
  }
  const profile = PROFILE_BY_NAME(model.model_name)
  if (profile === 'embedding' || profile === 'reasoning') return profile
  if (profile === 'image') {
    return /sora|veo|kling|pika|video|wan-|hunyuanvideo/i.test(model.model_name)
      ? 'video'
      : 'image'
  }
  return 'chat'
}

/**
 * Build the list of request parameters that the model accepts. The list is
 * shaped per-modality so reasoning, embedding, image, video and chat models
 * each show their relevant parameter set.
 */
export function buildSupportedParameters(
  model: PricingModel
): SupportedParameter[] {
  const cat = apiCategoryOf(model)
  if (cat === 'reasoning') return REASONING_PARAMS
  if (cat === 'embedding') return EMBEDDING_PARAMS
  if (cat === 'image') {
    if (GPT_IMAGE_25_MODEL_PATTERN.test(model.model_name)) {
      return GPT_IMAGE_25_PARAMS
    }
    if (GPT_IMAGE_2_MODEL_PATTERN.test(model.model_name)) {
      return GPT_IMAGE_2_PARAMS
    }
    return IMAGE_PARAMS
  }
  if (cat === 'video') {
    const name = model.model_name.toLowerCase()
    if (name.startsWith('minimax-h3')) {
      return createMinimaxH3Parameters()
    }
    if (name === 'seedance-2.0') {
      return createSeedanceVideoParameters(['480p', '720p', '4k', '1080p'])
    }
    if (name === 'seedance-2.5') {
      return createSeedanceVideoParameters(['480p', '720p', '1080p'])
    }
    if (name === 'seedance-2.0-mini' || name === 'seedance-2.0-fast') {
      return createSeedanceVideoParameters(['480p', '720p'])
    }
    return VIDEO_PARAMS
  }
  const vendorParams = VENDOR_CHAT_PARAMS.find((entry) =>
    entry.match.test(model.model_name)
  )
  if (vendorParams) return vendorParams.params
  return COMMON_CHAT_PARAMS
}

export type RateLimit = {
  group: string
  rpm: number
  tpm: number
  rpd: number
}

/** Build per-group RPM / TPM / RPD limits for the model. */
export function buildRateLimits(model: PricingModel): RateLimit[] {
  const groups = (model.enable_groups ?? []).filter((g) => g && g !== 'auto')
  const targets = groups.length > 0 ? groups : ['default']
  const cat = apiCategoryOf(model)
  const baseSeed = hashStringToSeed(`${model.model_name}:rl`)
  const isHeavy = cat === 'image' || cat === 'video'
  const isLight = cat === 'embedding'
  let baseRpm = 500
  let baseTpm = 200_000
  let baseRpd = 10_000
  if (isHeavy) {
    baseRpm = 60
    baseTpm = 0
    baseRpd = 1_000
  } else if (isLight) {
    baseRpm = 5_000
    baseTpm = 1_000_000
    baseRpd = 100_000
  }

  return [...targets]
    .sort((a, b) => a.localeCompare(b))
    .map((group) => {
      const rand = seededRandom(baseSeed ^ hashStringToSeed(group))
      const tier = 0.6 + rand() * 1.4
      return {
        group,
        rpm: Math.round((baseRpm * tier) / 10) * 10,
        tpm: baseTpm === 0 ? 0 : Math.round((baseTpm * tier) / 1_000) * 1_000,
        rpd: Math.round((baseRpd * tier) / 100) * 100,
      }
    })
}

/** Format an integer rate-limit value compactly. */
export function formatRateLimit(value: number): string {
  if (value <= 0) {
    return '—'
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`
  }
  return value.toLocaleString()
}
