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
import {
  ArrowLeft,
  BookOpen,
  Download,
  ExternalLink,
  FileText,
  Mail,
  ScrollText,
  ShieldCheck,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const ORIGINAL_PROJECT_URL = 'https://github.com/QuantumNous/new-api'
const LICENSE_URL = 'https://www.gnu.org/licenses/agpl-3.0.html'
// Email used for AGPLv3 Section 13 source-code requests. Change it here (and in
// the copy below) if the public contact address differs.
const SOURCE_REQUEST_EMAIL = 'jiaoxingk025@gmail.com'

const STATIC_FILES = [
  {
    label: 'GNU AGPL v3 许可证全文（LICENSE）',
    href: '/license-files/LICENSE.txt',
  },
  {
    label: 'new-api 声明与附加条款（NOTICE）',
    href: '/license-files/NOTICE.txt',
  },
  {
    label: '第三方开源组件许可（THIRD-PARTY-LICENSES.md）',
    href: '/license-files/THIRD-PARTY-LICENSES.md',
  },
]

function SectionCard(props: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <Card className='border-border/60 bg-card/50 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.02)] backdrop-blur-xs'>
      <CardHeader className='flex flex-row items-center gap-3'>
        <div className='bg-primary/10 text-primary ring-primary/15 flex size-9 shrink-0 items-center justify-center rounded-xl ring-1'>
          {props.icon}
        </div>
        <CardTitle className='text-base font-semibold'>{props.title}</CardTitle>
      </CardHeader>
      <CardContent className='text-muted-foreground space-y-3 text-sm leading-relaxed'>
        {props.children}
      </CardContent>
    </Card>
  )
}

export function Licenses() {
  const { t } = useTranslation()

  return (
    <PublicLayout showMainContainer={false}>
      <section className='border-border/60 bg-muted/10 relative overflow-hidden border-b px-6 pt-28 pb-10 md:pt-32'>
        <div
          aria-hidden
          className='pointer-events-none absolute inset-0 -z-10 opacity-20 dark:opacity-10'
          style={{
            background: [
              'radial-gradient(ellipse 55% 60% at 15% 20%, oklch(0.53 0.165 30 / 55%) 0%, transparent 70%)',
              'radial-gradient(ellipse 45% 50% at 85% 10%, oklch(0.52 0.085 235 / 45%) 0%, transparent 70%)',
            ].join(', '),
          }}
        />
        <div className='mx-auto max-w-4xl'>
          <div className='text-muted-foreground mb-4 flex flex-wrap items-center gap-2 text-xs'>
            <Link to='/' className='hover:text-foreground transition-colors'>
              {t('Home')}
            </Link>
            <span className='text-muted-foreground/40'>/</span>
            <span className='text-foreground/80'>{t('Open Source & Licenses')}</span>
          </div>
          <div className='flex items-start gap-4'>
            <div className='bg-primary/10 text-primary ring-primary/20 hidden size-12 shrink-0 items-center justify-center rounded-2xl ring-1 sm:flex'>
              <ScrollText className='size-6' />
            </div>
            <div>
              <div className='mb-1 flex flex-wrap items-center gap-2'>
                <Badge variant='secondary' className='text-[11px] font-normal'>
                  AGPLv3
                </Badge>
                <span className='text-muted-foreground/70 text-xs'>
                  Based on new-api · modified by XingChai AI
                </span>
              </div>
              <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
                {t('Open Source & Licenses')}
              </h1>
              <p className='text-muted-foreground mt-2 text-sm'>
                本服务基于开源项目构建，以下为项目来源、许可证与第三方组件声明。
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className='mx-auto max-w-4xl space-y-5 px-6 py-10 lg:py-14'>
        <SectionCard
          icon={<BookOpen className='size-4' />}
          title='项目来源与修改说明'
        >
          <p>
            本服务（星柴AI）基于开源项目{' '}
            <a
              href={ORIGINAL_PROJECT_URL}
              target='_blank'
              rel='noopener noreferrer'
              className='text-primary hover:underline'
            >
              new-api（QuantumNous/new-api）
            </a>{' '}
            构建，并遵循{' '}
            <a
              href={LICENSE_URL}
              target='_blank'
              rel='noopener noreferrer'
              className='text-primary hover:underline'
            >
              GNU Affero General Public License v3.0（AGPLv3）
            </a>{' '}
            发布。本项目对上游代码进行了修改，包括但不限于：站点品牌与主题定制、模型定价与展示、
            支付渠道集成、页面与功能调整。依据 AGPLv3，本修改版本同样以 AGPLv3 授权。
          </p>
        </SectionCard>

        <SectionCard
          icon={<ShieldCheck className='size-4' />}
          title='作者署名与原始项目链接'
        >
          <p>
            依据 new-api 的 AGPLv3 第 7 条附加条款（详见{' '}
            <a
              href='/license-files/NOTICE.txt'
              target='_blank'
              rel='noopener noreferrer'
              className='text-primary hover:underline'
            >
              NOTICE
            </a>
            ），本修改版本保留以下署名与原项目链接：
          </p>
          <p className='text-foreground/80'>
            Frontend design and development by New API contributors.
          </p>
          <p>
            原始项目地址：
            <a
              href={ORIGINAL_PROJECT_URL}
              target='_blank'
              rel='noopener noreferrer'
              className='text-primary break-all hover:underline'
            >
              {ORIGINAL_PROJECT_URL}
            </a>
          </p>
        </SectionCard>

        <SectionCard
          icon={<Mail className='size-4' />}
          title='获取源代码（AGPLv3 第 13 条）'
        >
          <p>
            依据 AGPLv3 第 13 条，通过网络与本服务交互的用户有权获取与本服务对应版本的完整源代码。
          </p>
          <p>
            如需获取当前部署版本的对应源代码，请发送邮件至{' '}
            <a
              href={`mailto:${SOURCE_REQUEST_EMAIL}?subject=${encodeURIComponent('AGPLv3 源代码获取申请')}`}
              className='text-primary font-medium hover:underline'
            >
              {SOURCE_REQUEST_EMAIL}
            </a>{' '}
            申请，并在邮件中简要说明申请用途。我们将在 7 个工作日内向您提供对应源代码的获取方式
            （源码压缩包或可访问的源码仓库地址）。
          </p>
          <p className='text-muted-foreground/70 text-xs'>
            提示：该联系邮箱仅用于 AGPLv3 源码获取及开源许可相关事宜。
          </p>
        </SectionCard>

        <SectionCard
          icon={<FileText className='size-4' />}
          title='许可证与声明文件'
        >
          <div className='grid gap-2 sm:grid-cols-2'>
            {STATIC_FILES.map((file) => (
              <a
                key={file.href}
                href={file.href}
                target='_blank'
                rel='noopener noreferrer'
                className='border-border/60 bg-muted/20 hover:border-border hover:bg-muted/40 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors'
              >
                <Download className='text-muted-foreground size-4 shrink-0' />
                <span className='min-w-0 flex-1'>{file.label}</span>
                <ExternalLink className='text-muted-foreground/60 size-3.5 shrink-0' />
              </a>
            ))}
          </div>
          <p>
            AGPLv3 全文亦可在{' '}
            <a
              href={LICENSE_URL}
              target='_blank'
              rel='noopener noreferrer'
              className='text-primary hover:underline'
            >
              gnu.org
            </a>{' '}
            获取。本项目包含的第三方开源组件及其许可证，见{' '}
            <a
              href='/license-files/THIRD-PARTY-LICENSES.md'
              target='_blank'
              rel='noopener noreferrer'
              className='text-primary hover:underline'
            >
              THIRD-PARTY-LICENSES.md
            </a>
            。
          </p>
        </SectionCard>

        <SectionCard
          icon={<ScrollText className='size-4' />}
          title='商业授权说明'
        >
          <p>
            AGPLv3 允许商业使用，但附有开源义务。若您希望在不承担 AGPLv3 开源义务的前提下使用
            new-api 上游代码，可直接联系上游项目方获取商业授权，详见 new-api 仓库的 license
            说明。本服务不对上游商业授权事宜作出任何承诺或担保。
          </p>
        </SectionCard>

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
              render={<Link to='/about' />}
            >
              {t('About')}
            </Button>
            <Button
              variant='ghost'
              size='sm'
              className='text-muted-foreground hover:text-foreground h-9 rounded-lg'
              render={<Link to='/user-agreement' />}
            >
              {t('User Agreement')}
            </Button>
          </div>
        </div>
      </div>

      <Footer />
    </PublicLayout>
  )
}
