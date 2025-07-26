import { Router, cors, json, text } from 'itty-router'

import { authenticate } from './routes/authenticate'
import { fetchMe } from './routes/fetchMe'
import { fetchNonce } from './routes/fetchNonce'
import { fetchProfile } from './routes/fetchProfile'
import { fetchStats } from './routes/fetchStats'
import { registerPublicKeys } from './routes/registerPublicKeys'
import { resolveProfile } from './routes/resolveProfile'
import { searchProfiles } from './routes/searchProfiles'
import { unregisterPublicKeys } from './routes/unregisterPublicKeys'
import { updateProfile } from './routes/updateProfile'
import {
  KnownError,
  jwtAuthMiddleware,
  jwtOrSignatureAuthMiddleware,
  signatureAuthMiddleware,
} from './utils'

// Create CORS handlers.
const { preflight, corsify } = cors({
  allowMethods: ['GET', 'POST'],
  maxAge: 3600,
  exposeHeaders: ['Content-Type'],
})

const router = Router()

// Handle CORS preflight.
router.all('*', preflight)

// Get stats.
router.get('/stats', fetchStats)

// Get nonce for publicKey.
router.get('/nonce/:publicKey', fetchNonce)

// Search profiles.
router.get('/search/:chainId/:namePrefix', searchProfiles)

// Resolve profile.
router.get('/resolve/:chainId/:name', resolveProfile)

// Fetch profile with bech32 address.
router.get('/address/:bech32Address', fetchProfile)

// Fetch profile with address hex.
router.get('/hex/:addressHex', fetchProfile)
// Backwards compatible.
router.get('/bech32/:addressHex', fetchProfile)

// Generate JWT token via wallet auth.
router.post('/auth', signatureAuthMiddleware, authenticate)

// Get the token-authenticated profile, validating the JWT token.
router.get('/me', jwtAuthMiddleware, fetchMe)

// Update profile.
router.post('/', jwtOrSignatureAuthMiddleware, updateProfile)

// Register more public keys.
router.post('/register', jwtOrSignatureAuthMiddleware, registerPublicKeys)

// Unregister existing public keys.
router.post('/unregister', jwtOrSignatureAuthMiddleware, unregisterPublicKeys)

// Fetch profile. Must be last since it matches all routes.
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
