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
  ArrowLeft,
  ArrowUp,
  FileText,
  FileWarning,
  Printer,
  ScrollText,
  ShieldCheck,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { HtmlContent } from '@/components/html-content'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Markdown } from '@/components/ui/markdown'
import { Skeleton } from '@/components/ui/skeleton'
import { isHttpUrl, isLikelyHtml } from '@/lib/content-format'

import type { LegalDocumentResponse } from './types'

type LegalDocumentProps = {
  title: string
  queryKey: string
  fetchDocument: () => Promise<LegalDocumentResponse>
  emptyMessage: string
}

type Heading = {
  id: string
  text: string
  level: number
}

const headingPattern = /<h([23])\b([^>]*)>([\s\S]*?)<\/h\1>/gi

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function extractDate(text: string): string | null {
  const match = text.match(
    /(?:生效|更新|修订)日期[：:]\s*([0-9]{4}\s*[年./-]\s*[0-9]{1,2}\s*[月./-]\s*[0-9]{1,2}\s*日?)/u
  )
  return match ? match[1].replace(/\s+/g, '') : null
}

/** Add stable anchor ids to h2/h3 so a table of contents can link to them. */
function withHeadingIds(html: string): { html: string; headings: Heading[] } {
  const headings: Heading[] = []
  const nextHtml = html.replace(
    headingPattern,
    (full: string, level: string, attrs: string, inner: string) => {
      const existingId = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1]
      if (existingId) {
        headings.push({
          id: existingId,
          text: stripHtml(inner),
          level: Number(level),
        })
        return full
      }
      const id = `legal-section-${headings.length + 1}`
      headings.push({ id, text: stripHtml(inner), level: Number(level) })
      const cleanedAttrs = attrs.replace(/\s+/g, ' ').trim()
      return `<h${level}${cleanedAttrs ? ` ${cleanedAttrs}` : ''} id="${id}">${inner}</h${level}>`
    }
  )
  return { html: nextHtml, headings }
}

function EmptyState(props: {
  title: string
  message: string
  icon: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className='mx-auto flex max-w-2xl flex-col items-center justify-center px-6 py-32 text-center'>
      <div className='bg-muted/40 text-muted-foreground ring-border/60 mb-6 flex size-16 items-center justify-center rounded-2xl ring-1'>
        {props.icon}
      </div>
      <h1 className='text-2xl font-bold tracking-tight'>{props.title}</h1>
      <p className='text-muted-foreground mt-3 max-w-md text-sm leading-relaxed'>
        {props.message}
      </p>
      <div className='mt-8 flex flex-wrap items-center justify-center gap-3'>
        <Button
          variant='outline'
          className='h-10 rounded-lg'
          render={<Link to='/' />}
        >
          <ArrowLeft className='mr-1.5 size-4' />
          {t('Back to Home')}
        </Button>
      </div>
    </div>
  )
}

function DocumentView(props: {
  title: string
  rawContent: string
  contentIsHtml: boolean
}) {
  const { t } = useTranslation()
  const [activeId, setActiveId] = useState<string>('')
  const [showBackToTop, setShowBackToTop] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  const prepared = useMemo(() => {
    if (props.contentIsHtml) {
      return withHeadingIds(props.rawContent)
    }
    const headings = props.rawContent
      .split('\n')
      .map((line) => line.match(/^(#{2,3})\s+(.+)$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m, index) => ({
        id: `legal-section-${index + 1}`,
        text: m[2].replace(/[*_`]/g, '').trim(),
        level: m[1].length,
      }))
    return { html: props.rawContent, headings }
  }, [props.contentIsHtml, props.rawContent])

  const plainText = useMemo(
    () => stripHtml(props.rawContent),
    [props.rawContent]
  )
  const dateText = useMemo(() => extractDate(plainText), [plainText])
  const headings = prepared.headings

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 480)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (headings.length === 0) {
      return
    }
    const container = contentRef.current
    if (!container) {
      return
    }
    const elements = headings
      .map((heading) => container.querySelector(`#${CSS.escape(heading.id)}`))
      .filter((el): el is Element => !!el)
    if (elements.length === 0) {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) {
          setActiveId(visible[0].target.id)
        }
      },
      { rootMargin: '-96px 0px -60% 0px', threshold: [0, 1] }
    )
    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [headings])

  const scrollTo = (id: string) => {
    const el = contentRef.current?.querySelector(`#${CSS.escape(id)}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveId(id)
    }
  }

  const proseClasses =
    'prose-neutral dark:prose-invert max-w-none prose-headings:scroll-mt-28 prose-h2:mt-10 prose-h2:mb-3 prose-h2:text-xl prose-h2:font-semibold prose-h3:mt-8 prose-h3:mb-2 prose-h3:text-base prose-h3:font-semibold prose-p:leading-7 prose-li:leading-7 prose-a:text-primary'

  return (
    <PublicLayout showMainContainer={false}>
      {/* ------------------------------------------------------------ hero */}
      <section className='border-border/60 bg-muted/10 relative overflow-hidden border-b px-6 pt-28 pb-10 md:pt-32'>
        <div
          aria-hidden
          className='pointer-events-none absolute inset-0 -z-10 opacity-20 dark:opacity-10'
          style={{
            background: [
              'radial-gradient(ellipse 55% 60% at 15% 20%, oklch(0.72 0.18 250 / 70%) 0%, transparent 70%)',
              'radial-gradient(ellipse 45% 50% at 85% 10%, oklch(0.68 0.14 300 / 50%) 0%, transparent 70%)',
            ].join(', '),
          }}
        />
        <div className='mx-auto max-w-6xl'>
          <div className='text-muted-foreground mb-4 flex flex-wrap items-center gap-2 text-xs'>
            <Link to='/' className='hover:text-foreground transition-colors'>
              {t('Home')}
            </Link>
            <span className='text-muted-foreground/40'>/</span>
            <span className='text-foreground/80'>{props.title}</span>
          </div>
          <div className='flex flex-col gap-5 md:flex-row md:items-end md:justify-between'>
            <div className='flex items-start gap-4'>
              <div className='bg-primary/10 text-primary ring-primary/20 hidden size-12 shrink-0 items-center justify-center rounded-2xl ring-1 sm:flex'>
                <ScrollText className='size-6' />
              </div>
              <div>
                <div className='mb-1 flex flex-wrap items-center gap-2'>
                  <Badge variant='secondary' className='text-[11px] font-normal'>
                    {t('Legal Documents')}
                  </Badge>
                  {dateText && (
                    <span className='text-muted-foreground/70 text-xs'>
                      {t('Effective date')}: {dateText}
                    </span>
                  )}
                </div>
                <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
                  {props.title}
                </h1>
              </div>
            </div>
            <div className='flex items-center gap-2 print:hidden'>
              <Button
                variant='outline'
                size='sm'
                className='h-9 rounded-lg'
                onClick={() => window.print()}
              >
                <Printer className='mr-1.5 size-3.5' />
                {t('Print')}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ body */}
      <div className='mx-auto grid max-w-6xl gap-10 px-6 py-10 lg:grid-cols-[230px_minmax(0,1fr)] lg:py-14'>
        {headings.length > 0 && (
          <aside className='hidden lg:block print:hidden'>
            <div className='border-border/60 bg-card/40 sticky top-24 rounded-2xl border p-4 backdrop-blur-xs'>
              <div className='text-muted-foreground/70 mb-3 flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] uppercase'>
                <FileText className='size-3.5' />
                {t('On this page')}
              </div>
              <nav className='space-y-1'>
                {headings.map((heading) => (
                  <button
                    key={heading.id}
                    type='button'
                    onClick={() => scrollTo(heading.id)}
                    className={`block w-full rounded-md px-2 py-1.5 text-left text-[13px] leading-snug transition-colors ${
                      heading.level === 3 ? 'pl-5' : ''
                    } ${
                      activeId === heading.id
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    }`}
                  >
                    {heading.text}
                  </button>
                ))}
              </nav>
            </div>
          </aside>
        )}

        <div className='min-w-0' ref={contentRef}>
          <Card className='border-border/60 bg-card/50 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.02)] backdrop-blur-xs print:border-0 print:bg-transparent print:shadow-none'>
            <CardContent className='px-6 py-8 sm:px-9 sm:py-10'>
              {props.contentIsHtml ? (
                <HtmlContent
                  content={prepared.html}
                  className={proseClasses}
                />
              ) : (
                <Markdown className={proseClasses}>
                  {props.rawContent}
                </Markdown>
              )}
            </CardContent>
          </Card>

          <div className='mt-6 flex flex-wrap items-center justify-between gap-3 print:hidden'>
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
                render={<Link to='/user-agreement' />}
              >
                {t('User Agreement')}
              </Button>
              <Button
                variant='ghost'
                size='sm'
                className='text-muted-foreground hover:text-foreground h-9 rounded-lg'
                render={<Link to='/privacy-policy' />}
              >
                {t('Privacy Policy')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {showBackToTop && (
        <button
          type='button'
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className='border-border/60 bg-background/90 text-muted-foreground hover:text-foreground fixed right-6 bottom-6 z-40 flex size-10 items-center justify-center rounded-full border shadow-lg backdrop-blur transition-colors print:hidden'
          aria-label={t('Back to top')}
        >
          <ArrowUp className='size-4' />
        </button>
      )}

      <Footer />
    </PublicLayout>
  )
}

export function LegalDocument({
  title,
  queryKey,
  fetchDocument,
  emptyMessage,
}: LegalDocumentProps) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn: fetchDocument,
    staleTime: 10 * 60 * 1000,
  })

  const rawContent = data?.data?.trim() ?? ''
  const hasContent = rawContent.length > 0
  const isUrl = hasContent && isHttpUrl(rawContent)
  const contentIsHtml = hasContent && isLikelyHtml(rawContent)
  const success = data?.success ?? false

  if (isLoading) {
    return (
      <PublicLayout showMainContainer={false}>
        <div className='mx-auto flex max-w-5xl flex-col gap-4 px-6 py-32'>
          <Skeleton className='h-9 w-[40%]' />
          <Skeleton className='h-4 w-full' />
          <Skeleton className='h-4 w-[92%]' />
          <Skeleton className='h-4 w-[85%]' />
          <Skeleton className='h-4 w-[60%]' />
        </div>
      </PublicLayout>
    )
  }

  if (isUrl) {
    return (
      <PublicLayout showMainContainer={false}>
        <div className='mx-auto flex max-w-2xl flex-col items-center px-6 py-32 text-center'>
          <div className='bg-muted/40 text-muted-foreground ring-border/60 mb-6 flex size-16 items-center justify-center rounded-2xl ring-1'>
            <ShieldCheck className='size-7' />
          </div>
          <h1 className='text-2xl font-bold tracking-tight'>{title}</h1>
          <p className='text-muted-foreground mt-3 max-w-md text-sm leading-relaxed'>
            {t(
              'The administrator configured an external link for this document.'
            )}
          </p>
          <Button
            className='mt-8 h-10 rounded-lg'
            render={
              <a href={rawContent} target='_blank' rel='noopener noreferrer' />
            }
          >
            {t('View document')}
          </Button>
        </div>
        <Footer />
      </PublicLayout>
    )
  }

  if (!success || !hasContent) {
    return (
      <PublicLayout showMainContainer={false}>
        <EmptyState
          title={title}
          message={data?.message || emptyMessage}
          icon={<FileWarning className='size-8' />}
        />
        <Footer />
      </PublicLayout>
    )
  }

  return (
    <DocumentView
      title={title}
      rawContent={rawContent}
      contentIsHtml={contentIsHtml}
    />
  )
}
