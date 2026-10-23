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
import { Link } from '@tanstack/react-router'
import { ArrowLeft, BookOpen, Clock, KeyRound, ListChecks, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const BASE_URL = 'https://ai.xingchai.xyz'
const MODEL = 'MiniMax H3'

const SECTIONS = [
  { id: 'overview', label: '概览', icon: BookOpen },
  { id: 'auth', label: '身份验证', icon: KeyRound },
  { id: 'quickstart', label: '快速开始', icon: Video },
  { id: 'create', label: '创建视频任务', icon: ListChecks },
  { id: 'query', label: '查询任务', icon: Clock },
  { id: 'pricing', label: '计费说明', icon: Clock },
  { id: 'errors', label: '错误处理', icon: BookOpen },
]

function CodeBlock(props: { title?: string; children: string }) {
  return (
    <div className='border-border/60 bg-muted/30 overflow-hidden rounded-xl border'>
      {props.title ? (
        <div className='border-border/50 text-muted-foreground flex items-center justify-between border-b px-4 py-2 text-xs'>
          <span>{props.title}</span>
        </div>
      ) : null}
      <pre className='overflow-x-auto p-4 text-[12.5px] leading-relaxed'>
        <code>{props.children}</code>
      </pre>
    </div>
  )
}

function Section(props: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={props.id} className='scroll-mt-28'>
      <h2 className='mb-3 text-lg font-bold tracking-tight'>{props.title}</h2>
      <div className='text-muted-foreground space-y-3 text-sm leading-relaxed'>
        {props.children}
      </div>
    </section>
  )
}

export function Docs() {
  const { t } = useTranslation()
  return (
    <PublicLayout showMainContainer={false}>
      <section className='border-border/60 bg-muted/10 relative overflow-hidden border-b px-6 pt-28 pb-10 md:pt-32'>
        <div
          aria-hidden
          className='pointer-events-none absolute inset-0 -z-10 opacity-20 dark:opacity-10'
          style={{
            background: [
              'radial-gradient(ellipse 55% 60% at 15% 20%, oklch(0.54 0.225 285 / 55%) 0%, transparent 70%)',
              'radial-gradient(ellipse 45% 50% at 85% 10%, oklch(0.72 0.13 220 / 45%) 0%, transparent 70%)',
            ].join(', '),
          }}
        />
        <div className='mx-auto max-w-4xl'>
          <div className='text-muted-foreground mb-4 flex flex-wrap items-center gap-2 text-xs'>
            <Link to='/' className='hover:text-foreground transition-colors'>
              {t('Home')}
            </Link>
            <span className='text-muted-foreground/40'>/</span>
            <span className='text-foreground/80'>{t('Docs')}</span>
          </div>
          <div className='flex items-start gap-4'>
            <div className='bg-primary/10 text-primary ring-primary/20 hidden size-12 shrink-0 items-center justify-center rounded-2xl ring-1 sm:flex'>
              <BookOpen className='size-6' />
            </div>
            <div>
              <div className='mb-1 flex flex-wrap items-center gap-2'>
                <Badge variant='secondary' className='text-[11px] font-normal'>
                  OpenAI 兼容
                </Badge>
                <span className='text-muted-foreground/70 text-xs'>
                  {MODEL} · 视频生成
                </span>
              </div>
              <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
                {t('API Docs')}
              </h1>
              <p className='text-muted-foreground mt-2 text-sm'>
                星柴AI 视频生成 API：OpenAI 兼容协议，按秒计费，支持 MiniMax H3 与 Wan 3.0 视频生成（文生视频、图生视频与多模态参考）。
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className='mx-auto flex max-w-6xl gap-10 px-6 py-10 lg:py-14'>
        <aside className='hidden w-48 shrink-0 lg:block'>
          <nav className='sticky top-28 space-y-1 text-sm'>
            {SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className='text-muted-foreground hover:bg-muted/50 hover:text-foreground flex items-center gap-2 rounded-lg px-3 py-2 transition-colors'
              >
                <section.icon className='size-3.5 opacity-70' />
                {section.label}
              </a>
            ))}
          </nav>
        </aside>

        <div className='min-w-0 flex-1 space-y-10'>
          <Section id='overview' title='概览'>
            <p>
              基础地址：<code className='bg-muted/60 rounded px-1.5 py-0.5 text-[12.5px]'>{BASE_URL}</code>
              ，所有接口均使用 OpenAI 兼容的 JSON 格式。
            </p>
            <p>
              当前可用模型：
              <code className='bg-muted/60 rounded px-1.5 py-0.5 text-[12.5px]'>{MODEL}</code>
              （MiniMax H3 视频生成）与
              <code className='bg-muted/60 rounded px-1.5 py-0.5 text-[12.5px]'>Wan 3.0</code>
              （Wan 3.0 视频生成，480p / 720p / 1080p）。可通过
              <code className='bg-muted/60 rounded px-1.5 py-0.5 text-[12.5px]'>GET /v1/models</code>
              获取账号实际可用的模型列表。
            </p>
            <p>
              分组说明：<code>MiniMax H3</code> 属于 <code>Codex</code> 分组，
              <code>Wan 3.0</code> 属于 <code>Wan</code> 分组。创建 API Key 时请在「令牌」页面选择对应分组，
              否则该令牌无法调用对应模型。
            </p>
          </Section>

          <Section id='auth' title='身份验证'>
            <p>
              所有请求都需要在 <code>Authorization</code> 请求头中携带 API Key：
            </p>
            <CodeBlock>Authorization: Bearer sk-xxxxxxxxxxxxxxxx</CodeBlock>
            <p>
              API Key 在控制台「令牌」页面创建，可按模型、分组、IP、额度等维度精细授权。缺少或无效的 Key 返回
              <code> 401</code>；Key 有效但无权限（额度不足、分组/模型不可用、IP 不在白名单）返回
              <code> 403</code>。
            </p>
          </Section>

          <Section id='quickstart' title='快速开始'>
            <p>创建任务 → 轮询任务状态 → 读取结果链接，三步完成一次视频生成。</p>
            <CodeBlock title='cURL'>
              {`curl -X POST ${BASE_URL}/v1/videos \\
  -H "Authorization: Bearer $NEW_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${MODEL}",
    "prompt": "a calm ocean wave at sunrise, cinematic",
    "duration": 5,
    "ratio": "16:9",
    "resolution": "768p"
  }'`}
            </CodeBlock>
            <CodeBlock title='Python'>
              {`import time
import requests

BASE_URL = "${BASE_URL}"
headers = {"Authorization": "Bearer YOUR_API_KEY"}

resp = requests.post(
    f"{BASE_URL}/v1/videos",
    headers=headers,
    json={
        "model": "${MODEL}",
        "prompt": "a calm ocean wave at sunrise, cinematic",
        "duration": 5,
        "ratio": "16:9",
        "resolution": "768p",
    },
    timeout=60,
)
task = resp.json()
print(task)

while True:
    info = requests.get(
        f"{BASE_URL}/v1/videos/{task['id']}",
        headers=headers,
        timeout=60,
    ).json()
    print(info["status"], info.get("progress"))
    if info["status"] in ("completed", "failed"):
        print(info.get("result_urls"))
        break
    time.sleep(10)`}
            </CodeBlock>
            <p>
              使用 Wan 3.0 时，把 <code>model</code> 换成
              <code>Wan 3.0</code>，并传 <code>resolution</code>（480p / 720p / 1080p，默认 720p）、
              <code>duration</code>（5 ~ 30 秒）。
            </p>
          </Section>

          <Section id='create' title='创建视频任务'>
            <p>
              <code>POST /v1/videos</code>：提交生成任务，立即返回任务 id（异步）。
            </p>
            <div className='border-border/60 overflow-x-auto rounded-xl border'>
              <table className='w-full text-left text-[13px]'>
                <thead className='bg-muted/40 text-foreground/80'>
                  <tr>
                    <th className='px-3 py-2 font-medium'>参数</th>
                    <th className='px-3 py-2 font-medium'>类型</th>
                    <th className='px-3 py-2 font-medium'>默认值 / 范围</th>
                    <th className='px-3 py-2 font-medium'>说明</th>
                  </tr>
                </thead>
                <tbody className='divide-border/50 divide-y'>
                  <tr>
                    <td className='px-3 py-2'><code>model</code>（必填）</td>
                    <td className='px-3 py-2'>string</td>
                    <td className='px-3 py-2'>—</td>
                    <td className='px-3 py-2'>固定为 {MODEL}</td>
                  </tr>
                  <tr>
                    <td className='px-3 py-2'><code>prompt</code>（必填）</td>
                    <td className='px-3 py-2'>string</td>
                    <td className='px-3 py-2'>—</td>
                    <td className='px-3 py-2'>视频描述，中英文均可</td>
                  </tr>
                  <tr>
                    <td className='px-3 py-2'><code>duration</code></td>
                    <td className='px-3 py-2'>integer</td>
                    <td className='px-3 py-2'>默认 15，4 ~ 15</td>
                    <td className='px-3 py-2'>视频时长（秒），同时决定计费</td>
                  </tr>
                  <tr>
                    <td className='px-3 py-2'><code>ratio</code></td>
                    <td className='px-3 py-2'>enum</td>
                    <td className='px-3 py-2'>默认 16:9，可选 16:9 / 9:16 / 1:1</td>
                    <td className='px-3 py-2'>输出宽高比（别名 <code>aspect_ratio</code>）</td>
                  </tr>
                  <tr>
                    <td className='px-3 py-2'><code>resolution</code></td>
                    <td className='px-3 py-2'>enum</td>
                    <td className='px-3 py-2'>默认 768p</td>
                    <td className='px-3 py-2'>输出分辨率</td>
                  </tr>
                  <tr>
                    <td className='px-3 py-2'><code>images</code></td>
                    <td className='px-3 py-2'>array</td>
                    <td className='px-3 py-2'>—</td>
                    <td className='px-3 py-2'>参考/首尾帧图片 URL，最多 9 张</td>
                  </tr>
                  <tr>
                    <td className='px-3 py-2'><code>videos</code></td>
                    <td className='px-3 py-2'>array</td>
                    <td className='px-3 py-2'>—</td>
                    <td className='px-3 py-2'>参考视频 URL</td>
                  </tr>
                  <tr>
                    <td className='px-3 py-2'><code>audios</code></td>
                    <td className='px-3 py-2'>array</td>
                    <td className='px-3 py-2'>—</td>
                    <td className='px-3 py-2'>参考音频 URL</td>
                  </tr>
                  <tr>
                    <td className='px-3 py-2'><code>materials</code></td>
                    <td className='px-3 py-2'>array</td>
                    <td className='px-3 py-2'>—</td>
                    <td className='px-3 py-2'>混合素材 <code>{'{type, url, name?}'}</code></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className='pt-2'>
              <strong>Wan 3.0 参数：</strong>
            </p>
            <div className='border-border/60 overflow-x-auto rounded-xl border'>
              <table className='w-full text-left text-[13px]'>
                <thead className='bg-muted/40 text-foreground/80'>
                  <tr>
                    <th className='px-3 py-2 font-medium'>参数</th>
                    <th className='px-3 py-2 font-medium'>类型</th>
                    <th className='px-3 py-2 font-medium'>默认值 / 范围</th>
                    <th className='px-3 py-2 font-medium'>说明</th>
                  </tr>
                </thead>
                <tbody className='divide-border/50 divide-y'>
                  <tr><td className='px-3 py-2'><code>model</code>（必填）</td><td className='px-3 py-2'>string</td><td className='px-3 py-2'>—</td><td className='px-3 py-2'>固定为 Wan 3.0</td></tr>
                  <tr><td className='px-3 py-2'><code>prompt</code>（必填）</td><td className='px-3 py-2'>string</td><td className='px-3 py-2'>—</td><td className='px-3 py-2'>视频描述</td></tr>
                  <tr><td className='px-3 py-2'><code>duration</code></td><td className='px-3 py-2'>integer</td><td className='px-3 py-2'>默认 5，5 ~ 30</td><td className='px-3 py-2'>视频时长（秒），同时决定计费</td></tr>
                  <tr><td className='px-3 py-2'><code>resolution</code></td><td className='px-3 py-2'>enum</td><td className='px-3 py-2'>默认 720p，可选 480p / 720p / 1080p</td><td className='px-3 py-2'>输出分辨率，影响每秒单价</td></tr>
                  <tr><td className='px-3 py-2'><code>images</code></td><td className='px-3 py-2'>array</td><td className='px-3 py-2'>—</td><td className='px-3 py-2'>参考图片 URL，最多 10 张</td></tr>
                  <tr><td className='px-3 py-2'><code>audios</code></td><td className='px-3 py-2'>array</td><td className='px-3 py-2'>—</td><td className='px-3 py-2'>参考音频 URL，最多 5 个</td></tr>
                  <tr><td className='px-3 py-2'><code>ratio</code></td><td className='px-3 py-2'>enum</td><td className='px-3 py-2'>可选 16:9 / 9:16 / 1:1</td><td className='px-3 py-2'>输出宽高比</td></tr>
                  <tr><td className='px-3 py-2'><code>face</code></td><td className='px-3 py-2'>object</td><td className='px-3 py-2'>—</td><td className='px-3 py-2'>可选人脸处理参数</td></tr>
                </tbody>
              </table>
            </div>
            <p>返回示例：</p>
            <CodeBlock>
              {`{
  "id": "task_xxx",
  "object": "video",
  "model": "${MODEL}",
  "status": "queued",
  "progress": 0,
  "created_at": 1792723071
}`}
            </CodeBlock>
          </Section>

          <Section id='query' title='查询任务与结果'>
            <p>
              <code>GET /v1/videos/{'{task_id}'}</code>：轮询任务状态。当 <code>status</code> 为
              <code> completed</code> 时，<code>result_urls</code> 为结果视频地址；为
              <code> failed</code> 时失败原因在 <code>error.message</code>。
            </p>
            <CodeBlock>
              {`{
  "id": "task_xxx",
  "object": "video",
  "model": "${MODEL}",
  "status": "completed",
  "progress": 100,
  "result_urls": ["https://ai.xingchai.xyz/v1/videos/task_xxx/content"]
}`}
            </CodeBlock>
            <p>
              <strong>任务状态：</strong>
              <code>queued</code> 已受理排队 · <code>in_progress</code> 生成中 ·
              <code>completed</code> 成功 · <code>failed</code> 失败（自动退款）·
              <code>unknown</code> 继续轮询。
            </p>
            <p>
              建议每 10~30 秒轮询一次；视频生成通常需要 2~15 分钟。结果链接为临时地址（约 24 小时有效），
              请及时下载保存。也可通过 <code>GET /v1/videos/{'{task_id}'}/content</code> 直接拉取视频内容。
            </p>
          </Section>

          <Section id='pricing' title='计费说明'>
            <p>
              按<strong>视频时长（秒）</strong>计费，单价 <strong>¥0.065 / 秒</strong>。
              提交任务时按请求的 <code>duration</code> 预扣费用，任务失败自动退款。
            </p>
            <div className='border-border/60 overflow-x-auto rounded-xl border'>
              <table className='w-full text-left text-[13px]'>
                <thead className='bg-muted/40 text-foreground/80'>
                  <tr>
                    <th className='px-3 py-2 font-medium'>duration</th>
                    <th className='px-3 py-2 font-medium'>预计费用</th>
                  </tr>
                </thead>
                <tbody className='divide-border/50 divide-y'>
                  {[4, 5, 8, 10, 15].map((duration) => (
                    <tr key={duration}>
                      <td className='px-3 py-2'>{duration} 秒</td>
                      <td className='px-3 py-2'>¥{(duration * 0.065).toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className='pt-4'>
              <strong>Wan 3.0</strong> 按分辨率 + 时长计费（每秒单价）：
            </p>
            <div className='border-border/60 overflow-x-auto rounded-xl border'>
              <table className='w-full text-left text-[13px]'>
                <thead className='bg-muted/40 text-foreground/80'>
                  <tr>
                    <th className='px-3 py-2 font-medium'>resolution</th>
                    <th className='px-3 py-2 font-medium'>单价</th>
                  </tr>
                </thead>
                <tbody className='divide-border/50 divide-y'>
                  <tr><td className='px-3 py-2'>480p</td><td className='px-3 py-2'>¥0.325 / 秒</td></tr>
                  <tr><td className='px-3 py-2'>720p</td><td className='px-3 py-2'>¥0.65 / 秒</td></tr>
                  <tr><td className='px-3 py-2'>1080p</td><td className='px-3 py-2'>¥1.30 / 秒</td></tr>
                </tbody>
              </table>
            </div>
            <p>
              费用 = 秒数 × 对应分辨率单价。例如 720p 10 秒 = ¥6.50，1080p 5 秒 = ¥6.50。
            </p>
          </Section>

          <Section id='errors' title='错误处理'>
            <p>
              请按 HTTP 状态码处理，不要依赖错误文案；错误体为 OpenAI 兼容格式：
            </p>
            <CodeBlock>
              {`{
  "error": {
    "code": "",
    "message": "Invalid token (request id: xxx)",
    "type": "new_api_error"
  }
}`}
            </CodeBlock>
            <div className='border-border/60 overflow-x-auto rounded-xl border'>
              <table className='w-full text-left text-[13px]'>
                <thead className='bg-muted/40 text-foreground/80'>
                  <tr>
                    <th className='px-3 py-2 font-medium'>状态码</th>
                    <th className='px-3 py-2 font-medium'>说明</th>
                  </tr>
                </thead>
                <tbody className='divide-border/50 divide-y'>
                  <tr><td className='px-3 py-2'>400</td><td className='px-3 py-2'>参数缺失/不合法（如 duration 超出模型范围：MiniMax H3 为 4~15，Wan 3.0 为 5~30）</td></tr>
                  <tr><td className='px-3 py-2'>401</td><td className='px-3 py-2'>缺少 API Key 或 Key 无效</td></tr>
                  <tr><td className='px-3 py-2'>403</td><td className='px-3 py-2'>余额不足、无权使用该模型/分组、IP 不在白名单</td></tr>
                  <tr><td className='px-3 py-2'>429</td><td className='px-3 py-2'>请求过于频繁，请退避重试</td></tr>
                  <tr><td className='px-3 py-2'>5xx</td><td className='px-3 py-2'>服务端或上游异常，稍后重试</td></tr>
                </tbody>
              </table>
            </div>
            <p className='text-muted-foreground/70 text-xs'>
              注意：创建视频请使用 <code>POST /v1/videos</code>，请勿使用旧路径
              <code> /v1/video/generations</code>。
            </p>
          </Section>

          <div className='flex flex-wrap items-center justify-between gap-3 pt-2'>
            <Button
              variant='ghost'
              size='sm'
              className='text-muted-foreground hover:text-foreground h-9 rounded-lg'
              render={<Link to='/' />}
            >
              <ArrowLeft className='mr-1.5 size-3.5' />
              {t('Back to Home')}
            </Button>
            <div className='flex items-center gap-1'>
              <Button
                variant='ghost'
                size='sm'
                className='text-muted-foreground hover:text-foreground h-9 rounded-lg'
                render={<Link to='/pricing' />}
              >
                {t('Model Plaza')}
              </Button>
              <Button
                variant='ghost'
                size='sm'
                className='text-muted-foreground hover:text-foreground h-9 rounded-lg'
                render={<Link to='/about' />}
              >
                {t('About')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </PublicLayout>
  )
}
