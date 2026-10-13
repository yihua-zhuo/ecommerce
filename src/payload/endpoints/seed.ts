import type { PayloadHandler } from 'payload/config'

import { admins } from '../access/admins'
import { seed as seedScript } from '../seed'

export const seed: PayloadHandler = async (req, res): Promise<void> => {
  const { user, payload } = req

  if (!user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  if (!admins({ req })) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  let trustedOrigin: string
  try {
    trustedOrigin = new URL(process.env.PAYLOAD_PUBLIC_SERVER_URL || '').origin
  } catch {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  if (trustedOrigin === 'null' || req.headers.origin !== trustedOrigin) {
    res.status(403).json({ error: 'Forbidden' })
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
