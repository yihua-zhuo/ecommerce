import type { PayloadHandler } from 'payload/config'

import { checkRole } from '../collections/Users/checkRole'
import { seed as seedScript } from '../seed'

export const seed: PayloadHandler = async (req, res): Promise<void> => {
  const { user, payload } = req

  if (process.env.NODE_ENV === 'production' || !checkRole(['admin'], user)) {
    res.status(403).json({ error: 'Unauthorized' })
    return
  }

  try {
    await seedScript(payload)
    res.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    payload.logger.error(message)
    res.json({ error: message })
  }
}
