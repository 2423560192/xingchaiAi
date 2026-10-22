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
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  BookOpen,
  CreditCard,
  ImageIcon,
  KeyRound,
  Layers,
  PlugZap,
  Rocket,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Video,
  Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { HtmlContent } from '@/components/html-content'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Markdown } from '@/components/ui/markdown'
import { Skeleton } from '@/components/ui/skeleton'
import { useStatus } from '@/hooks/use-status'
import { isHttpUrl, isLikelyHtml } from '@/lib/content-format'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { getAboutContent } from './api'

type Solution = {
  icon: React.ReactNode
  title: string
  description: string
}

const solutionIcons = [
  <Layers key='layers' className='text-blue-600 dark:text-blue-400' />,
  <PlugZap key='plug' className='text-violet-600 dark:text-violet-400' />,
  <CreditCard key='card' className='text-emerald-600 dark:text-emerald-400' />,
  <ShieldCheck key='shield' className='text-cyan-600 dark:text-cyan-400' />,
  <ImageIcon key='image' className='text-fuchsia-600 dark:text-fuchsia-400' />,
  <Zap key='zap' className='text-amber-600 dark:text-amber-400' />,
]

const solutionIconBackgrounds = [
  'from-blue-500/15 to-blue-600/5 ring-blue-500/20',
  'from-violet-500/15 to-violet-600/5 ring-violet-500/20',
  'from-emerald-500/15 to-emerald-600/5 ring-emerald-500/20',
  'from-cyan-500/15 to-cyan-600/5 ring-cyan-500/20',
  'from-fuchsia-500/15 to-fuchsia-600/5 ring-fuchsia-500/20',
  'from-amber-500/15 to-amber-600/5 ring-amber-500/20',
]

const models = [
  ['GLM', '文本 / 推理'],
  ['Kimi', '长上下文'],
  ['Qwen', '通用对话'],
  ['DeepSeek', '深度推理'],
  ['MiniMax', '多模态'],
  ['Codex', '代码生成'],
  ['Seedance 2.0', '视频生成'],
  ['Image 2.5', '图像生成'],
] as const

function SectionHeading(props: { eyebrow?: string; title: string; desc?: string }) {
  return (
    <div className='mx-auto mb-10 max-w-2xl text-center'>
      {props.eyebrow && (
        <div className='text-primary/80 mb-2 text-[11px] font-semibold tracking-[0.2em] uppercase'>
          {props.eyebrow}
        </div>
      )}
      <h2 className='text-2xl font-bold tracking-tight sm:text-3xl'>
        {props.title}
      </h2>
      {props.desc && (
        <p className='text-muted-foreground/80 mt-3 text-sm leading-relaxed sm:text-[15px]'>
          {props.desc}
        </p>
      )}
    </div>
  )
}

export function About() {
  const { t } = useTranslation()
  const { status } = useStatus()
  const { auth } = useAuthStore()
  const isAuthenticated = !!auth.user
  const { data, isLoading } = useQuery({
    queryKey: ['about-content'],
    queryFn: async () => requireServerSuccess(await getAboutContent()),
  })

  const rawContent = data?.data?.trim() ?? ''
  const hasContent = rawContent.length > 0
  const isUrl = hasContent && isHttpUrl(rawContent)
  const contentIsHtml = hasContent && isLikelyHtml(rawContent)
  const docsUrl =
    (status?.docs_link as string | undefined) || 'https://docs.newapi.pro'

  if (isLoading) {
    return (
      <PublicLayout showMainContainer={false}>
        <div className='mx-auto flex max-w-5xl flex-col gap-4 px-6 py-32'>
          <Skeleton className='h-10 w-[45%]' />
          <Skeleton className='h-4 w-full' />
          <Skeleton className='h-4 w-[90%]' />
          <Skeleton className='h-4 w-[80%]' />
        </div>
      </PublicLayout>
    )
  }

  if (isUrl) {
    return (
      <PublicLayout showMainContainer={false}>
        <iframe
          src={rawContent}
          className='h-[calc(100vh-3.5rem)] w-full border-0'
          title={t('About')}
          sandbox='allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts'
        />
      </PublicLayout>
    )
  }

  const renderDocsButton = () => {
    if (docsUrl.startsWith('http')) {
      return (
        <Button
          variant='outline'
          className='border-border/50 hover:border-border hover:bg-muted/50 h-11 rounded-lg px-5 text-sm font-medium'
          render={<a href={docsUrl} target='_blank' rel='noopener noreferrer' />}
        >
          <BookOpen className='mr-1.5 size-4' />
          {t('Docs')}
        </Button>
      )
    }
    return (
      <Button
        variant='outline'
        className='border-border/50 hover:border-border hover:bg-muted/50 h-11 rounded-lg px-5 text-sm font-medium'
        render={<Link to={docsUrl} />}
      >
        <BookOpen className='mr-1.5 size-4' />
        {t('Docs')}
      </Button>
    )
  }

  const solutions: Solution[] = [
    {
      icon: solutionIcons[0],
      title: t('One Unified API'),
      description: t(
        'One compatible endpoint for dozens of models, switch models without changing code.'
      ),
    },
    {
      icon: solutionIcons[1],
      title: t('OpenAI Compatible'),
      description: t(
        'Drop-in replacement for the official SDK and mainstream AI clients.'
      ),
    },
    {
      icon: solutionIcons[2],
      title: t('Pay As You Go'),
      description: t(
        'Transparent usage-based billing, recharge in seconds, no monthly commitment.'
      ),
    },
    {
      icon: solutionIcons[3],
      title: t('Secure & Reliable'),
      description: t(
        'Isolated keys, permission control and auditable records; stable routing with retries.'
      ),
    },
    {
      icon: solutionIcons[4],
      title: t('Image & Video'),
      description: t(
        'Image generation and video generation models are available through the same API.'
      ),
    },
    {
      icon: solutionIcons[5],
      title: t('Fast Onboarding'),
      description: t(
        'Register, create a key and start calling models in less than five minutes.'
      ),
    },
  ]

  const steps = [
    {
      icon: <UserPlus className='size-5' />,
      title: t('Create an account'),
      description: t('Register and sign in to the console in seconds.'),
    },
    {
      icon: <KeyRound className='size-5' />,
      title: t('Create an API key'),
      description: t(
        'Generate a key and configure the base URL in your client.'
      ),
    },
    {
      icon: <Rocket className='size-5' />,
      title: t('Start building'),
      description: t(
        'Call any supported model through the OpenAI-compatible endpoint.'
      ),
    },
  ]

  return (
    <PublicLayout showMainContainer={false}>
      {/* ---------------------------------------------------------------- hero */}
      <section className='relative overflow-hidden px-6 pt-28 pb-16 md:pt-32 md:pb-20'>
        <div
          aria-hidden
          className='pointer-events-none absolute inset-0 -z-10 opacity-25 dark:opacity-[0.12]'
          style={{
            background: [
              'radial-gradient(ellipse 60% 50% at 20% 20%, oklch(0.72 0.18 250 / 80%) 0%, transparent 70%)',
              'radial-gradient(ellipse 50% 40% at 80% 15%, oklch(0.65 0.15 200 / 60%) 0%, transparent 70%)',
              'radial-gradient(ellipse 40% 35% at 40% 80%, oklch(0.70 0.12 280 / 40%) 0%, transparent 70%)',
            ].join(', '),
          }}
        />
        <div
          aria-hidden
          className='absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_30%,black_20%,transparent_100%)] bg-[size:4rem_4rem] opacity-[0.08]'
        />

        <div className='mx-auto max-w-5xl text-center'>
          <div className='border-primary/20 bg-primary/5 text-primary mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium'>
            <Sparkles className='size-3.5' />
            {t('About Us')}
          </div>
          <h1 className='text-[clamp(2rem,4.4vw,3.1rem)] leading-[1.15] font-bold tracking-tight'>
            <span className='bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent'>
              星柴AI
            </span>
          </h1>
          <p className='text-muted-foreground/85 mx-auto mt-5 max-w-2xl text-base leading-relaxed'>
            {t(
              'A unified AI model API platform: one endpoint, transparent pay-as-you-go billing, and production-grade reliability for your applications.'
            )}
          </p>
          <div className='mt-8 flex flex-wrap items-center justify-center gap-3'>
            {isAuthenticated ? (
              <Button
                className='group h-11 rounded-lg px-5 text-sm font-medium'
                render={<Link to='/dashboard' />}
              >
                {t('Go to Dashboard')}
                <ArrowRight className='ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
              </Button>
            ) : (
              <Button
                className='group h-11 rounded-lg px-5 text-sm font-medium'
                render={<Link to='/sign-up' />}
              >
                {t('Get Started')}
                <ArrowRight className='ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
              </Button>
            )}
            <Button
              variant='outline'
              className='border-border/50 hover:border-border hover:bg-muted/50 h-11 rounded-lg px-5 text-sm font-medium'
              render={<Link to='/pricing' />}
            >
              {t('View Pricing')}
            </Button>
            {renderDocsButton()}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ features */}
      <section className='px-6 pb-16 md:pb-20'>
        <div className='mx-auto max-w-6xl'>
          <SectionHeading
            eyebrow={t('Why choose us')}
            title={t('Everything you need in one gateway')}
            desc={t(
              'Focus on building your product; we take care of model access, billing and stability.'
            )}
          />
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            {solutions.map((item, index) => (
              <Card
                key={item.title}
                className='group border-border/60 bg-card/50 hover:border-border hover:bg-card/80 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.02)] backdrop-blur-xs transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md'
              >
                <CardHeader className='space-y-3 pb-2'>
                  <div
                    className={`flex size-10 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ${solutionIconBackgrounds[index]} transition-transform duration-300 group-hover:scale-105`}
                  >
                    {item.icon}
                  </div>
                  <CardTitle className='text-base font-semibold'>
                    {item.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className='text-muted-foreground text-sm leading-relaxed'>
                    {item.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- models */}
      <section className='px-6 pb-16 md:pb-20'>
        <div className='mx-auto max-w-6xl'>
          <SectionHeading
            eyebrow={t('Models')}
            title={t('Frontier models, ready to use')}
            desc={t(
              'Text, image and video generation models are continuously added to the gateway.'
            )}
          />
          <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
            {models.map(([name, category]) => (
              <div
                key={name}
                className='border-border/60 bg-muted/20 hover:border-border hover:bg-muted/40 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors'
              >
                <span className='text-sm font-semibold'>{name}</span>
                <Badge variant='secondary' className='text-[11px] font-normal'>
                  {category}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- steps */}
      <section className='px-6 pb-16 md:pb-20'>
        <div className='mx-auto max-w-6xl'>
          <SectionHeading
            eyebrow={t('Quick start')}
            title={t('Get started in three steps')}
          />
          <div className='grid gap-4 md:grid-cols-3'>
            {steps.map((step, index) => (
              <div
                key={step.title}
                className='border-border/60 bg-card/40 relative rounded-2xl border p-6'
              >
                <div className='bg-primary/10 text-primary mb-4 flex size-10 items-center justify-center rounded-xl'>
                  {step.icon}
                </div>
                <div className='text-muted-foreground/60 absolute top-6 right-6 text-3xl font-bold'>
                  0{index + 1}
                </div>
                <h3 className='text-base font-semibold'>{step.title}</h3>
                <p className='text-muted-foreground mt-2 text-sm leading-relaxed'>
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- admin about content */}
      {hasContent && (
        <section className='px-6 pb-16 md:pb-20'>
          <div className='mx-auto max-w-4xl'>
            <Card className='border-border/60 bg-card/50 rounded-2xl backdrop-blur-xs'>
              <CardHeader>
                <CardTitle className='text-xl font-semibold'>
                  {t('About the platform')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {contentIsHtml ? (
                  <HtmlContent
                    content={rawContent}
                    className='prose-neutral dark:prose-invert max-w-none'
                  />
                ) : (
                  <Markdown className='prose-neutral dark:prose-invert max-w-none'>
                    {rawContent}
                  </Markdown>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* ----------------------------------------------------------------- cta */}
      <section className='px-6 pb-20'>
        <div className='bg-primary/5 ring-primary/10 mx-auto max-w-4xl overflow-hidden rounded-3xl px-6 py-12 text-center ring-1'>
          <h2 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            {t('Ready to build with AI?')}
          </h2>
          <p className='text-muted-foreground mx-auto mt-3 max-w-xl text-sm leading-relaxed'>
            {t(
              'Create an account, grab an API key and start calling frontier models today.'
            )}
          </p>
          <div className='mt-7 flex flex-wrap items-center justify-center gap-3'>
            <Button
              className='h-11 rounded-lg px-6 text-sm font-medium'
              render={<Link to='/sign-up' />}
            >
              {t('Create account')}
              <ArrowRight className='ml-1.5 size-4' />
            </Button>
            <Button
              variant='outline'
              className='border-border/50 bg-background/60 hover:bg-muted/50 h-11 rounded-lg px-6 text-sm font-medium'
              render={<Link to='/pricing' />}
            >
              {t('View Pricing')}
            </Button>
          </div>
          <p className='text-muted-foreground/60 mt-6 text-xs'>
            {t(
              'Questions or need a custom plan? Please contact the platform administrator.'
            )}
          </p>
        </div>
      </section>

      <Footer />
    </PublicLayout>
  )
}
