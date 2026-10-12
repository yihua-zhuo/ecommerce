import type { PayloadHandler } from 'payload/config'

import { checkRole } from '../collections/Users/checkRole'
import { seed as seedScript } from '../seed'

export const seed: PayloadHandler = async (req, res): Promise<void> => {
  const { user, payload } = req

  if (!user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  if (!checkRole(['admin'], user)) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  if (
    !process.env.PAYLOAD_PUBLIC_SERVER_URL ||
    req.headers.origin !== new URL(process.env.PAYLOAD_PUBLIC_SERVER_URL).origin
  ) {
    res.status(403).json({ error: 'Invalid origin' })
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
