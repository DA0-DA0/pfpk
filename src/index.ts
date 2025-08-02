import { Router, cors, json, text } from 'itty-router'

import { createTokens } from './routes/createTokens'
import { fetchAuthenticated } from './routes/fetchAuthenticated'
import { fetchMe } from './routes/fetchMe'
import { fetchNonce } from './routes/fetchNonce'
import { fetchProfile } from './routes/fetchProfile'
import { fetchStats } from './routes/fetchStats'
import { fetchTokens } from './routes/fetchTokens'
import { invalidateTokens } from './routes/invalidateTokens'
import { registerPublicKeys } from './routes/registerPublicKeys'
import { resolveProfile } from './routes/resolveProfile'
import { searchProfiles } from './routes/searchProfiles'
import { unregisterPublicKeys } from './routes/unregisterPublicKeys'
import { updateProfile } from './routes/updateProfile'
import {
  KnownError,
  makeJwtAuthMiddleware,
  makeJwtOrSignatureAuthMiddleware,
} from './utils'

// Create CORS handlers.
const { preflight, corsify } = cors({
  allowMethods: ['GET', 'POST', 'DELETE'],
  maxAge: 3600,
  exposeHeaders: ['Content-Type'],
})

const router = Router()

// Handle CORS preflight.
router.all('*', preflight)

// Miscellaneous stuff
router
  // Get stats.
  .get('/stats', fetchStats)
  // Get nonce for publicKey.
  .get('/nonce/:publicKey', fetchNonce)

// Profile stuff
router
  // Get the profile via JWT token.
  .get('/me', makeJwtAuthMiddleware({ audience: 'current' }), fetchMe)
  // Update profile.
  .post(
    '/me',
    makeJwtOrSignatureAuthMiddleware({ audience: 'current', role: ['admin'] }),
    updateProfile
  )
  // Register more public keys.
  .post(
    '/register',
    makeJwtOrSignatureAuthMiddleware({ audience: 'current', role: ['admin'] }),
    registerPublicKeys
  )
  // Unregister existing public keys.
  .post(
    '/unregister',
    makeJwtOrSignatureAuthMiddleware({ audience: 'current', role: ['admin'] }),
    unregisterPublicKeys
  )
  // Resolve profile.
  .get('/resolve/:chainId/:name', resolveProfile)
  // Search profiles.
  .get('/search/:chainId/:namePrefix', searchProfiles)
  // Fetch profile with bech32 address.
  .get('/address/:bech32Address', fetchProfile)
  // Fetch profile with address hex.
  .get('/hex/:addressHex', fetchProfile)
  // Backwards compatible.
  .get('/bech32/:addressHex', fetchProfile)
  // Fetch profile via UUID.
  .get('/uuid/:uuid', fetchProfile)

// Token stuff
router
  // Create JWT token(s) via JWT auth or wallet auth.
  .post(
    '/tokens',
    makeJwtOrSignatureAuthMiddleware({ audience: 'current', role: ['admin'] }),
    createTokens
  )
  // Fetch tokens for profile (only JWT auth since GET cannot have a body).
  .get(
    '/tokens',
    makeJwtAuthMiddleware({ audience: 'current', role: ['admin'] }),
    fetchTokens
  )
  // Invalidate tokens.
  .delete(
    '/tokens',
    makeJwtOrSignatureAuthMiddleware({ audience: 'current', role: ['admin'] }),
    invalidateTokens
  )
  // Return successfully if authenticated via JWT token. JWT auth middleware is
  // used manually in the route handler, since audience and role requirements
  // may be provided in the query.
  .get('/auth', fetchAuthenticated)

//! MUST BE LAST SINCE IT MATCHES ALL ROUTES
// Fetch profile with public key hex.
router.get('/:publicKey', fetchProfile)

// 404
router.all('*', () => text('Not found', { status: 404 }))

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    return router
      .fetch(request, env, ctx)
      .then(json)
      .catch((err) => {
        if (err instanceof KnownError) {
          return json(err.responseJson, { status: err.statusCode })
        }

        console.error('Unknown error', err)

        return json(
          {
            error:
              'Unknown error occurred: ' +
              (err instanceof Error ? err.message : `${err}`),
          },
          { status: 500 }
        )
      })
      .then(corsify)
  },
}
