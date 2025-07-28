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
import { JwtRole } from './types'
import {
  KnownError,
  makeJwtAuthMiddleware,
  makeJwtOrSignatureAuthMiddleware,
  signatureAuthMiddleware,
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
  // Update profile.
  .post('/me', makeJwtOrSignatureAuthMiddleware(JwtRole.Admin), updateProfile)
  // Register more public keys.
  .post(
    '/register',
    makeJwtOrSignatureAuthMiddleware(JwtRole.Admin),
    registerPublicKeys
  )
  // Unregister existing public keys.
  .post(
    '/unregister',
    makeJwtOrSignatureAuthMiddleware(JwtRole.Admin),
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

// Token stuff
router
  // Create JWT token(s) via wallet auth.
  .post('/tokens', signatureAuthMiddleware, createTokens)
  // Fetch tokens for profile (only JWT auth since GET cannot have a body).
  .get('/tokens', makeJwtAuthMiddleware(JwtRole.Admin), fetchTokens)
  // Invalidate tokens.
  .delete(
    '/tokens',
    makeJwtOrSignatureAuthMiddleware(JwtRole.Admin),
    invalidateTokens
  )
  // Return successfully if authenticated via JWT token.
  .get(
    '/auth',
    makeJwtAuthMiddleware(JwtRole.Verify, JwtRole.Admin),
    fetchAuthenticated
  )
  // Get the token-authenticated profile, validating the JWT token.
  .get('/me', makeJwtAuthMiddleware(JwtRole.Verify, JwtRole.Admin), fetchMe)

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
