export function filterImageModels(models: string[]): string[] {
  return [...new Set(models.map((model) => model.trim()).filter((model) => model && /image|dall[-_]?e/i.test(model)))]
}
