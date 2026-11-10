'use client'

import React, { Fragment, useState } from 'react'
import Link from 'next/link'

import { Settings } from '../../../../payload/payload-types'
import { useAuth } from '../../../_providers/Auth'

export const LogoutPage: React.FC<{
  settings: Settings
}> = props => {
  const { settings } = props
  const { productsPage } = settings || {}
  const { logout } = useAuth()
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const performLogout = async () => {
    try {
      await logout()
      setSuccess('Logged out successfully.')
    } catch (_) {
      setError('You are already logged out.')
    }
  }

  return (
    <Fragment>
      {!success && !error && <button type="button" onClick={performLogout}>Log out</button>}
      {(error || success) && (
        <div>
          <h1>{error || success}</h1>
          <p>
            {'What would you like to do next?'}
            {typeof productsPage === 'object' && productsPage?.slug && (
              <Fragment>
                {' '}
                <Link href={`/${productsPage.slug}`}>Click here</Link>
                {` to shop.`}
              </Fragment>
            )}
            {` To log back in, `}
            <Link href="/login">click here</Link>
            {'.'}
          </p>
        </div>
      )}
    </Fragment>
  )
}
