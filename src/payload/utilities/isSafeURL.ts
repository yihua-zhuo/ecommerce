export const isSafeURL = (value: string): boolean => {
  if (!value || /[\u0000-\u0020\u007f\\]/.test(value)) return false

  try {
    const url = new URL(value, 'https://localhost')
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)
  } catch {
    return false
  }
}
