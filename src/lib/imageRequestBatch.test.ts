import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS } from '../types'
import { getApiErrorMessage } from './imageApiShared'
import {
  CANCELLED_IMAGE_REQUEST_MESSAGE,
  IMAGE_REQUEST_MAX_ATTEMPTS,
  UPSTREAM_WAIT_TIMEOUT_MESSAGE,
  buildOutputSlots,
  formatImageRequestProgress,
  isRetryableImageRequestError,
  projectImageOutputSlots,
  runImageRequestBatch,
} from './imageRequestBatch'

function statusError(status: number, message: string) {
  const err = new Error(message)
  ;(err as Error & { status: number }).status = status
  return err
}

describe('runImageRequestBatch', () => {
  it('limits how many single-image requests run at once and starts the next when one finishes', async () => {
    let active = 0
    let maxActive = 0
    const release: Array<() => void> = []
    const pending = runImageRequestBatch({
      count: 5,
      concurrency: 2,
      maxAttempts: 1,
      run: async (requestIndex) => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise<void>((resolve) => {
          release.push(() => {
            active -= 1
            resolve()
          })
        })
        return requestIndex
      },
    })

    await vi.waitFor(() => expect(release.length).toBe(2))
    expect(maxActive).toBe(2)
    release[0]()
    await vi.waitFor(() => expect(release.length).toBe(3))
    expect(maxActive).toBe(2)
    release[1]()
    release[2]()
    await vi.waitFor(() => expect(release.length).toBe(5))
    expect(maxActive).toBe(2)
    release[3]()
    release[4]()
    const slots = await pending
    expect(slots.map((slot) => slot.value)).toEqual([0, 1, 2, 3, 4])
    expect(maxActive).toBe(2)
  })

  it('retries a timeout or gateway error and keeps the successful image when another slot fails', async () => {
    const attempts = new Map<number, number>()
    const settled: Array<number> = []
    const slots = await runImageRequestBatch({
      count: 3,
      concurrency: 1,
      run: async (requestIndex) => {
        const attempt = (attempts.get(requestIndex) ?? 0) + 1
        attempts.set(requestIndex, attempt)
        if (requestIndex === 0 && attempt < 3) throw statusError(524, 'error code: 524')
        if (requestIndex === 1) throw statusError(400, 'n must be between 1 and 4')
        if (requestIndex === 2 && attempt === 1) throw new TypeError('Failed to fetch')
        return `image-${requestIndex}`
      },
      onSettled: async (slot) => {
        settled.push(slot.requestIndex)
      },
    })

    expect(attempts.get(0)).toBe(3)
    expect(attempts.get(1)).toBe(1)
    expect(attempts.get(2)).toBe(2)
    expect(IMAGE_REQUEST_MAX_ATTEMPTS).toBe(3)
    expect(slots.map((slot) => slot.value ?? slot.error)).toEqual([
      'image-0',
      'n must be between 1 and 4',
      'image-2',
    ])
    expect(settled).toEqual([0, 1, 2])
    expect(projectImageOutputSlots(slots.map((slot) => (
      slot.value
        ? { requestIndex: slot.requestIndex, imageId: slot.value }
        : { requestIndex: slot.requestIndex, error: slot.error }
    ))).outputImages).toEqual(['image-0', 'image-2'])
  })

  it('does not start queued requests after cancellation and leaves finished ones in place', async () => {
    let started = 0
    const release: Array<() => void> = []
    let stop = false
    const pending = runImageRequestBatch({
      count: 4,
      concurrency: 1,
      maxAttempts: 1,
      shouldStop: () => stop,
      run: async (requestIndex) => {
        started += 1
        await new Promise<void>((resolve) => release.push(resolve))
        return requestIndex
      },
    })
    await vi.waitFor(() => expect(release).toHaveLength(1))
    stop = true
    release[0]()
    const slots = await pending
    expect(started).toBe(1)
    expect(slots[0]).toMatchObject({ value: 0 })
    expect(slots.slice(1).every((slot) => slot.cancelled && slot.error === CANCELLED_IMAGE_REQUEST_MESSAGE)).toBe(true)
  })
})

describe('image request error classification', () => {
  it('retries gateway timeouts and dropped connections, not parameter or certificate errors', () => {
    expect(isRetryableImageRequestError(statusError(524, 'error code: 524'))).toBe(true)
    expect(isRetryableImageRequestError(statusError(502, 'bad gateway'))).toBe(true)
    expect(isRetryableImageRequestError(statusError(504, 'gateway timeout'))).toBe(true)
    expect(isRetryableImageRequestError(statusError(500, 'HTTP 500'))).toBe(true)
    expect(isRetryableImageRequestError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isRetryableImageRequestError(new DOMException('请求超时：超过 120 秒仍未完成', 'AbortError'))).toBe(true)
    expect(isRetryableImageRequestError(new Error(UPSTREAM_WAIT_TIMEOUT_MESSAGE))).toBe(true)
    expect(isRetryableImageRequestError(statusError(400, 'n must be between 1 and 4'))).toBe(false)
    expect(isRetryableImageRequestError(new Error('TLS 握手失败，请检查服务器证书。'))).toBe(false)
    expect(isRetryableImageRequestError(new Error('无法解析域名，请检查 API 地址是否正确。'))).toBe(false)
    expect(isRetryableImageRequestError(new DOMException('The operation was aborted', 'AbortError'))).toBe(false)
  })

  it('turns HTTP 524, 504 and 502 into a retryable Chinese timeout', async () => {
    for (const status of [502, 504, 524]) {
      const response = new Response('error code: 524', { status, headers: { 'Content-Type': 'text/plain' } })
      await expect(getApiErrorMessage(response)).resolves.toBe(UPSTREAM_WAIT_TIMEOUT_MESSAGE)
    }
  })

  it('formats progress with the settled success count and the failure count', () => {
    expect(formatImageRequestProgress(12, 20, 1)).toBe('已完成 12/20，失败 1')
    expect(formatImageRequestProgress(4, 20, 0, 8)).toBe('已完成 4/20，已取消 8')
  })
})

describe('buildOutputSlots', () => {
  it('keeps successful images in request order when a later image finishes first', () => {
    const task = {
      status: 'running' as const,
      params: { ...DEFAULT_PARAMS, n: 3 },
      outputImages: ['image-2'],
      outputImageRequestIndexes: [2],
      outputErrors: [{ requestIndex: 0, error: '等待超时' }],
    }
    expect(buildOutputSlots(task).map((slot) => slot.imageId || slot.error || (slot.pending ? 'pending' : ''))).toEqual([
      '等待超时',
      'pending',
      'image-2',
    ])
  })

  it('still lines up legacy tasks that only stored successes and error indexes', () => {
    expect(buildOutputSlots({
      status: 'done',
      params: { ...DEFAULT_PARAMS, n: 3 },
      outputImages: ['image-0', 'image-2'],
      outputErrors: [{ requestIndex: 1, error: '失败' }],
    }).map((slot) => slot.imageId || slot.error)).toEqual(['image-0', '失败', 'image-2'])
  })
})
