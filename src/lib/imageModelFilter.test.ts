import { describe, expect, it } from 'vitest'
import { filterImageModels } from './imageModelFilter'

describe('filterImageModels', () => {
  it('keeps unique image models and drops non-image models', () => {
    expect(filterImageModels(['gpt-4o', 'gpt-image-2', 'dall-e-3', 'text-embedding-3-small', 'gpt-image-2'])).toEqual(['gpt-image-2', 'dall-e-3'])
  })
})
