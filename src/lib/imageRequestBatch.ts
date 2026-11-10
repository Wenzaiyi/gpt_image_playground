import type { TaskParams, TaskRecord, TaskStatus } from '../types'
import { mapActualParamsByImage, mapRevisedPromptsByImage } from './taskState'

/** 多图拆成单张请求时，同时进行的请求数 */
export const DEFAULT_IMAGE_REQUEST_CONCURRENCY = 4
export const MAX_IMAGE_REQUEST_CONCURRENCY = 16
/** 首次请求之外最多再试 2 次 */
export const IMAGE_REQUEST_MAX_ATTEMPTS = 3
/** 超过这个数量时，开始生成前先让用户确认 */
export const LARGE_IMAGE_COUNT_CONFIRM_AT = 4
export const UPSTREAM_WAIT_TIMEOUT_MESSAGE = '等待超时，上游可能已生成，可重试。'
export const CANCELLED_IMAGE_REQUEST_MESSAGE = '已取消，未开始生成'

export function normalizeImageRequestConcurrency(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_IMAGE_REQUEST_CONCURRENCY
  return Math.min(MAX_IMAGE_REQUEST_CONCURRENCY, Math.max(1, Math.round(value)))
}

export function isUpstreamGatewayStatus(status: number) {
  return status === 502 || status === 504 || status === 524
}

export function isCancelledImageRequest(error: string | undefined) {
  return error === CANCELLED_IMAGE_REQUEST_MESSAGE
}

export function largeImageCountConfirmMessage(count: number) {
  return `将要生成 ${count} 张图片。多图会拆成单张请求并排队，耗时和费用都会增加。确定开始吗？`
}

/** 单张请求是否值得再试：超时、网关 5xx、连接中断；参数和内容审核这类 4xx 不再试 */
export function isRetryableImageRequestError(err: unknown) {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') {
    return /超时|timeout/i.test(err.message)
  }
  const status = typeof err === 'object' && err && 'status' in err ? Number((err as { status?: number }).status) : NaN
  if (Number.isFinite(status) && status > 0) {
    if (status === 408 || status === 429 || isUpstreamGatewayStatus(status) || status === 500 || status === 503) return true
    if (status >= 500) return true
    if (status >= 400) return false
  }
  const message = err instanceof Error ? err.message : String(err)
  if (
    message.startsWith('TLS 握手失败')
    || message.startsWith('无法解析域名')
    || message.startsWith('连接被拒绝')
    || message.startsWith('无法连接代理')
    || message.startsWith('代理服务器')
  ) return false
  if (message.startsWith(UPSTREAM_WAIT_TIMEOUT_MESSAGE) || message.includes(UPSTREAM_WAIT_TIMEOUT_MESSAGE)) return true
  if (/error code:\s*52[24]|\bHTTP\s*52[24]\b|\bHTTP\s*50[0234]\b|\bHTTP\s*429\b|\bHTTP\s*408\b/i.test(message)) return true
  if (/超时|timed out|timeout|failed to fetch|fetch failed|network error|econnreset|connection reset|连接被服务器重置|服务器未返回响应就关闭了连接|读取响应时连接中断|close_notify|unexpected eof/i.test(message)) return true
  if (err instanceof TypeError) return true
  return false
}

export function formatImageRequestProgress(success: number, total: number, failed: number, cancelled = 0) {
  const parts = [`已完成 ${success}/${total}`]
  if (failed > 0) parts.push(`失败 ${failed}`)
  if (cancelled > 0) parts.push(`已取消 ${cancelled}`)
  return parts.join('，')
}

export function summarizeImageRequestProgress(task: {
  params: { n: number }
  outputImages?: string[]
  outputErrors?: Array<{ error: string }>
}) {
  const errors = task.outputErrors ?? []
  const cancelled = errors.filter((item) => isCancelledImageRequest(item.error)).length
  const failed = errors.length - cancelled
  const success = task.outputImages?.length ?? 0
  const total = task.params.n > 0 ? task.params.n : Math.max(success + errors.length, 1)
  return {
    success,
    failed,
    cancelled,
    total,
    text: formatImageRequestProgress(success, total, failed, cancelled),
  }
}

export interface ImageRequestSlot<T> {
  requestIndex: number
  value?: T
  error?: string
  cancelled?: boolean
}

export async function runImageRequestBatch<T>(options: {
  count: number
  concurrency: number
  maxAttempts?: number
  shouldStop?: () => boolean
  run: (requestIndex: number) => Promise<T>
  isRetryable?: (err: unknown) => boolean
  onSettled?: (slot: ImageRequestSlot<T>) => void | Promise<void>
}): Promise<Array<ImageRequestSlot<T>>> {
  const count = Math.max(0, Math.floor(options.count))
  const slots: Array<ImageRequestSlot<T>> = Array.from({ length: count }, (_, requestIndex) => ({ requestIndex }))
  const concurrency = normalizeImageRequestConcurrency(options.concurrency)
  const maxAttempts = Math.max(1, options.maxAttempts ?? IMAGE_REQUEST_MAX_ATTEMPTS)
  const isRetryable = options.isRetryable ?? isRetryableImageRequestError
  const shouldStop = options.shouldStop ?? (() => false)

  const notify = async (slot: ImageRequestSlot<T>) => {
    try {
      await options.onSettled?.(slot)
    } catch (err) {
      console.error('保存单张结果失败', err)
    }
  }

  let next = 0
  const workers = Array.from({ length: Math.min(concurrency, count) }, async () => {
    while (!shouldStop()) {
      const requestIndex = next
      next += 1
      if (requestIndex >= count) return
      let lastError = '生成失败'
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const value = await options.run(requestIndex)
          slots[requestIndex] = { requestIndex, value }
          await notify(slots[requestIndex])
          lastError = ''
          break
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err)
          if (attempt === maxAttempts - 1 || !isRetryable(err)) break
        }
      }
      if (slots[requestIndex].value === undefined) {
        slots[requestIndex] = { requestIndex, error: lastError }
        await notify(slots[requestIndex])
      }
    }
  })
  await Promise.all(workers)

  for (const slot of slots) {
    if (slot.value !== undefined || slot.error) continue
    slot.cancelled = true
    slot.error = CANCELLED_IMAGE_REQUEST_MESSAGE
    await notify(slot)
  }
  return slots
}

export interface ImageOutputSlot {
  requestIndex: number
  imageId?: string
  error?: string
  transparentOriginalId?: string
  actualParams?: Partial<TaskParams>
  revisedPrompt?: string
  rawImageUrl?: string
}

export function projectImageOutputSlots(slots: Array<ImageOutputSlot | undefined>) {
  const settled = slots.filter((slot): slot is ImageOutputSlot => Boolean(slot && (slot.imageId || slot.error)))
  const successes = settled.filter((slot) => slot.imageId).sort((a, b) => a.requestIndex - b.requestIndex)
  const failures = settled.filter((slot) => !slot.imageId && slot.error).sort((a, b) => a.requestIndex - b.requestIndex)
  const outputImages = successes.map((slot) => slot.imageId!)
  const rawImageUrls = successes.map((slot) => slot.rawImageUrl).filter((url): url is string => Boolean(url))
  const transparentOriginalImages = successes.some((slot) => slot.transparentOriginalId !== undefined)
    ? successes.map((slot) => slot.transparentOriginalId ?? '')
    : undefined
  return {
    outputImages,
    outputImageRequestIndexes: successes.map((slot) => slot.requestIndex),
    outputErrors: failures.length ? failures.map((slot) => ({ requestIndex: slot.requestIndex, error: slot.error! })) : undefined,
    transparentOriginalImages,
    actualParamsByImage: mapActualParamsByImage(outputImages, successes.map((slot) => slot.actualParams)),
    revisedPromptByImage: mapRevisedPromptsByImage(outputImages, successes.map((slot) => slot.revisedPrompt)),
    rawImageUrls: rawImageUrls.length ? rawImageUrls : undefined,
  }
}

export function readImageOutputSlots(task: Pick<TaskRecord, 'params' | 'outputImages' | 'outputErrors' | 'outputImageRequestIndexes' | 'transparentOriginalImages' | 'actualParamsByImage' | 'revisedPromptByImage'>): Array<ImageOutputSlot | undefined> {
  const slots: Array<ImageOutputSlot | undefined> = []
  const indexes = task.outputImageRequestIndexes
  if (indexes && indexes.length === task.outputImages.length) {
    indexes.forEach((requestIndex, index) => {
      const imageId = task.outputImages[index]
      slots[requestIndex] = {
        requestIndex,
        imageId,
        transparentOriginalId: task.transparentOriginalImages?.[index],
        actualParams: task.actualParamsByImage?.[imageId],
        revisedPrompt: task.revisedPromptByImage?.[imageId],
      }
    })
  } else {
    const errorIndexes = new Set((task.outputErrors ?? []).map((item) => item.requestIndex))
    let imageIndex = 0
    const count = Math.max(task.params.n, task.outputImages.length + (task.outputErrors?.length ?? 0))
    for (let requestIndex = 0; requestIndex < count; requestIndex++) {
      if (errorIndexes.has(requestIndex)) continue
      const imageId = task.outputImages[imageIndex]
      if (!imageId) break
      slots[requestIndex] = {
        requestIndex,
        imageId,
        transparentOriginalId: task.transparentOriginalImages?.[imageIndex],
        actualParams: task.actualParamsByImage?.[imageId],
        revisedPrompt: task.revisedPromptByImage?.[imageId],
      }
      imageIndex += 1
    }
  }
  for (const item of task.outputErrors ?? []) {
    if (slots[item.requestIndex]?.imageId) continue
    slots[item.requestIndex] = { requestIndex: item.requestIndex, error: item.error }
  }
  return slots
}

export interface OutputSlotView {
  requestIndex: number
  outputImageIndex: number
  imageId: string
  error: string
  pending: boolean
}

export function buildOutputSlots(task: {
  status: TaskStatus
  params: { n: number }
  outputImages: string[]
  outputErrors?: Array<{ requestIndex: number; error: string }>
  outputImageRequestIndexes?: number[]
}): OutputSlotView[] {
  const errors = new Map((task.outputErrors ?? []).map((item) => [item.requestIndex, item.error]))
  const indexes = task.outputImageRequestIndexes
  const indexed = Boolean(indexes && indexes.length === task.outputImages.length && (indexes.length > 0 || errors.size > 0))
  if (indexed && indexes) {
    const imageByRequest = new Map(indexes.map((requestIndex, index) => [requestIndex, { imageId: task.outputImages[index], outputImageIndex: index }]))
    const settled = [...imageByRequest.keys(), ...errors.keys()]
    const last = settled.length ? Math.max(...settled) : -1
    const length = task.status === 'running'
      ? Math.max(task.params.n, last + 1)
      : last + 1
    return Array.from({ length: Math.max(0, length) }, (_, requestIndex) => {
      const image = imageByRequest.get(requestIndex)
      const error = image ? '' : errors.get(requestIndex) ?? ''
      if (image) {
        return { requestIndex, outputImageIndex: image.outputImageIndex, imageId: image.imageId, error: '', pending: false }
      }
      if (error) return { requestIndex, outputImageIndex: -1, imageId: '', error, pending: false }
      return { requestIndex, outputImageIndex: -1, imageId: '', error: '', pending: task.status === 'running' }
    }).filter((slot) => task.status === 'running' || slot.imageId || slot.error)
  }

  if (!errors.size) {
    return task.outputImages.map((imageId, outputImageIndex) => ({
      requestIndex: outputImageIndex,
      outputImageIndex,
      imageId,
      error: '',
      pending: false,
    }))
  }

  const requestedCount = Math.max(task.params.n, task.outputImages.length + errors.size)
  let outputImageIndex = 0
  return Array.from({ length: requestedCount }, (_, requestIndex) => {
    const error = errors.get(requestIndex)
    if (error) return { requestIndex, outputImageIndex: -1, imageId: '', error, pending: false }
    const imageId = task.outputImages[outputImageIndex] ?? ''
    const slot = { requestIndex, outputImageIndex, imageId, error: '', pending: false }
    if (imageId) outputImageIndex += 1
    return slot
  })
}
