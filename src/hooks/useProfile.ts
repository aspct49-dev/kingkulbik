import { useCallback, useEffect, useState } from 'react'
import type { ProfileView } from '../../shared/profiles'

type ProfileState = { status: 'loading' | 'ready' | 'error'; view: ProfileView | null }

/** Your profile, originals history and redemptions (re-read with `refresh`) */
export function useProfile(signedIn: boolean) {
  const [state, setState] = useState<ProfileState>({ status: 'loading', view: null })

  const refresh = useCallback(() => {
    fetch('/api/profile', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { view: ProfileView | null }) => setState({ status: 'ready', view: body.view }))
      .catch(() => setState((s) => ({ status: 'error', view: s.view })))
  }, [])

  useEffect(() => {
    if (signedIn) refresh()
    else setState({ status: 'ready', view: null })
  }, [signedIn, refresh])

  return { ...state, refresh }
}
