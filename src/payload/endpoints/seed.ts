import type { PayloadHandler } from 'payload/config'

import { checkRole } from '../collections/Users/checkRole'
import { seed as seedScript } from '../seed'

export const seed: PayloadHandler = async (req, res): Promise<void> => {
  const { user, payload } = req

  if (!user || !checkRole(['admin'], user)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  if (req.method !== 'POST' || req.get('origin') !== process.env.PAYLOAD_PUBLIC_SERVER_URL ||
      req.get('x-seed-intent') !== 'seed') {
    res.status(403).json({ error: 'Explicit same-origin seed request required' })
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
