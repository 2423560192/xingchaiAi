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
import { CheckCircle2, ExternalLink, Loader2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { getCasdoorPaymentStatus } from '../../api'
import { formatCurrency } from '../../lib'
import type { CasdoorPaymentData } from '../../types'

const POLL_INTERVAL_MS = 3000

interface CasdoorPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  payment: CasdoorPaymentData | null
  onSuccess: () => void
}

export function CasdoorPaymentDialog({
  open,
  onOpenChange,
  payment,
  onSuccess,
}: CasdoorPaymentDialogProps) {
  const [status, setStatus] = useState<'pending' | 'success' | 'failed'>(
    'pending'
  )
  const [checking, setChecking] = useState(false)
  const settledRef = useRef(false)

  useEffect(() => {
    if (open) {
      setStatus('pending')
      settledRef.current = false
    }
  }, [open, payment?.trade_no])

  const checkStatus = useCallback(async () => {
    if (!payment?.trade_no || settledRef.current) {
      return
    }
    setChecking(true)
    try {
      const res = await getCasdoorPaymentStatus(payment.trade_no)
      const next = res?.data?.status
      if (next === 'success') {
        settledRef.current = true
        setStatus('success')
        toast.success('支付成功，额度已到账')
        onSuccess()
        setTimeout(() => onOpenChange(false), 1500)
      } else if (next === 'failed') {
        settledRef.current = true
        setStatus('failed')
      }
    } catch {
      // 网络抖动时静默重试，下一次轮询会继续查询
    } finally {
      setChecking(false)
    }
  }, [payment?.trade_no, onSuccess, onOpenChange])

  useEffect(() => {
    if (!open || !payment?.trade_no) {
      return
    }
    const timer = setInterval(() => {
      void checkStatus()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [open, payment?.trade_no, checkStatus])

  const isWechat = payment?.payment_method === 'wechat'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{isWechat ? '微信扫码支付' : '支付宝支付'}</DialogTitle>
          <DialogDescription>
            {isWechat
              ? '请使用微信扫描下方二维码完成支付'
              : '点击下方按钮前往支付宝完成支付'}
          </DialogDescription>
        </DialogHeader>

        {status === 'success' ? (
          <div className='flex flex-col items-center gap-3 py-6'>
            <CheckCircle2 className='h-12 w-12 text-emerald-500' />
            <div className='text-lg font-semibold'>支付成功</div>
            <div className='text-muted-foreground text-sm'>
              额度已到账，窗口即将自动关闭
            </div>
          </div>
        ) : (
          <div className='space-y-4 py-2'>
            <div className='flex items-center justify-between rounded-lg border p-3'>
              <span className='text-muted-foreground text-sm'>应付金额</span>
              <span className='text-xl font-semibold'>
                {formatCurrency(payment?.money ?? 0)}
              </span>
            </div>

            {payment?.pay_type === 'qrcode' ? (
              <div className='flex flex-col items-center gap-3'>
                <div className='rounded-xl bg-white p-3'>
                  <QRCodeSVG value={payment.pay_url} size={200} level='M' />
                </div>
                <div className='text-muted-foreground flex items-center gap-2 text-xs'>
                  {checking ? (
                    <Loader2 className='h-3 w-3 animate-spin' />
                  ) : null}
                  支付完成后自动到账，请勿关闭本窗口
                </div>
              </div>
            ) : (
              <Button
                className='w-full'
                onClick={() => {
                  if (payment?.pay_url) {
                    window.open(
                      payment.pay_url,
                      '_blank',
                      'noopener,noreferrer'
                    )
                  }
                }}
              >
                前往支付宝付款
                <ExternalLink className='ml-2 h-4 w-4' />
              </Button>
            )}

            {status === 'failed' ? (
              <div className='text-sm text-red-500'>
                支付已取消或超时，请重新发起充值
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter className='grid grid-cols-2 gap-2 sm:flex'>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={status === 'success'}
          >
            取消
          </Button>
          <Button
            onClick={() => {
              void checkStatus()
            }}
            disabled={status === 'success' || checking}
          >
            {checking ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : null}
            我已完成支付
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
