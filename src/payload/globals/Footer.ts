import type { GlobalConfig } from 'payload/types'

import { admins } from '../access/admins'

import link from '../fields/link'

export const Footer: GlobalConfig = {
  slug: 'footer',
  access: {
    read: () => true,
    update: admins,
  },
  fields: [
    {
      name: 'copyright',
      label: 'Copyright',
      type: 'text',
    },
    {
      name: 'navItems',
      type: 'array',
      maxRows: 6,
      fields: [
        link({
          appearances: false,
        }),
      ],
    },
  ],
}
