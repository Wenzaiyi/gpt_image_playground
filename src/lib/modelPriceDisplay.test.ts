import { describe, expect, it } from 'vitest'
import { customerImagePriceForModel, customerImagePriceSummary, formatCustomerImagePrice } from './modelPriceDisplay'

const WEIKEN = 'https://panel.weekendapi.site/v1'

describe('formatCustomerImagePrice', () => {
  it('shows 1× and the per-call price times the group multiplier', () => {
    expect(formatCustomerImagePrice(0.04, 4)).toEqual({
      multiplierLabel: '1×',
      hint: '平均一张图约 0.16 元',
      yuan: 0.16,
    })
  })

  it('uses that model’s own price instead of a shared figure', () => {
    expect(formatCustomerImagePrice(0.08, 4)?.hint).toBe('平均一张图约 0.32 元')
    expect(formatCustomerImagePrice(0.05, 2)?.hint).toBe('平均一张图约 0.1 元')
  })

  it('never puts the group multiplier in the customer text', () => {
    const display = formatCustomerImagePrice(0.04, 4)
    expect(display?.multiplierLabel).toBe('1×')
    expect(`${display?.multiplierLabel} ${display?.hint}`).not.toMatch(/4\s*[x×]/i)
  })

  it('returns nothing when the inputs are missing', () => {
    expect(formatCustomerImagePrice(Number.NaN, 4)).toBeNull()
    expect(formatCustomerImagePrice(0.04, Number.POSITIVE_INFINITY)).toBeNull()
    expect(formatCustomerImagePrice(-1, 4)).toBeNull()
  })
})

describe('customerImagePriceForModel', () => {
  it('prices each Weiken image model from its own per-call price', () => {
    expect(customerImagePriceForModel(WEIKEN, 'gpt-image-2.5-sunburst')?.hint).toBe('平均一张图约 0.16 元')
    expect(customerImagePriceForModel(WEIKEN, 'gpt-image-2.6-flare')?.multiplierLabel).toBe('1×')
    expect(customerImagePriceForModel(`${WEIKEN}/`, ' GPT-Image-2.6-Sunburst ')?.yuan).toBe(0.16)
  })

  it('skips models and hosts that do not have a price', () => {
    expect(customerImagePriceForModel(WEIKEN, 'dall-e-3')).toBeNull()
    expect(customerImagePriceForModel('https://api.openai.com/v1', 'gpt-image-2')).toBeNull()
    expect(customerImagePriceForModel('', 'gpt-image-2')).toBeNull()
  })

  it('summarizes only when every listed model has a price', () => {
    expect(customerImagePriceSummary(WEIKEN, ['gpt-image-2', 'gpt-image-2.5-flare'])).toBe('平均一张图约 0.16 元')
    expect(customerImagePriceSummary(WEIKEN, ['gpt-image-2', 'dall-e-3'])).toBeNull()
    expect(customerImagePriceSummary('https://api.openai.com/v1', ['gpt-image-2'])).toBeNull()
  })
})
