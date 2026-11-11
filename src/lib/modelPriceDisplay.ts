// 顾客侧倍率固定写成 1×。金额是该模型的单次价格乘以分组倍率，分组倍率不出现在文案里。

const WEIKEN_IMAGE_HOST = 'panel.weekendapi.site'
const WEIKEN_IMAGE_GROUP_MULTIPLIER = 4

// 威肯生图分组里各模型的单次价格。不同模型可以不同，展示时各自相乘。
const WEIKEN_IMAGE_PER_CALL_PRICE: Record<string, number> = {
  'gpt-image-2': 0.04,
  'gpt-image-2.5-flare': 0.04,
  'gpt-image-2.5-sunburst': 0.04,
  'gpt-image-2.6-flare': 0.04,
  'gpt-image-2.6-sunburst': 0.04,
}

export type CustomerImagePrice = {
  multiplierLabel: string
  hint: string
  yuan: number
}

function formatYuan(value: number) {
  const finer = Math.round(value * 10000) / 10000
  const cents = Math.round(value * 100) / 100
  const text = Math.abs(finer - cents) < 1e-9 ? cents.toFixed(2) : finer.toFixed(4)
  return text.replace(/0+$/, '').replace(/\.$/, '')
}

export function formatCustomerImagePrice(perCallPrice: number, groupMultiplier: number): CustomerImagePrice | null {
  if (!Number.isFinite(perCallPrice) || perCallPrice < 0) return null
  if (!Number.isFinite(groupMultiplier) || groupMultiplier < 0) return null
  const yuan = Math.round(perCallPrice * groupMultiplier * 1e6) / 1e6
  if (!Number.isFinite(yuan)) return null
  return {
    multiplierLabel: '1×',
    hint: `平均一张图约 ${formatYuan(yuan)} 元`,
    yuan,
  }
}

function isWeikenImagePanel(baseUrl: string) {
  const trimmed = baseUrl.trim()
  if (!trimmed) return false
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    return new URL(withProtocol).hostname.toLowerCase() === WEIKEN_IMAGE_HOST
  } catch {
    return false
  }
}

export function customerImagePriceForModel(baseUrl: string, model: string): CustomerImagePrice | null {
  if (!isWeikenImagePanel(baseUrl)) return null
  const perCallPrice = WEIKEN_IMAGE_PER_CALL_PRICE[model.trim().toLowerCase()]
  if (perCallPrice == null) return null
  return formatCustomerImagePrice(perCallPrice, WEIKEN_IMAGE_GROUP_MULTIPLIER)
}

export function customerImagePriceSummary(baseUrl: string, models: string[]): string | null {
  if (!models.length) return null
  const prices = models.map((model) => customerImagePriceForModel(baseUrl, model))
  if (prices.some((price) => !price)) return null
  const hints = new Set(prices.map((price) => price!.hint))
  if (hints.size === 1) return prices[0]!.hint
  return models.map((model, idx) => `${model} ${prices[idx]!.hint}`).join('；')
}
