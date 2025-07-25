import { Router, cors, json, text } from 'itty-router'

import { authenticate } from './routes/authenticate'
import { fetchAuthenticatedProfile } from './routes/fetchAuthenticatedProfile'
import { fetchProfile } from './routes/fetchProfile'
import { handleNonce } from './routes/nonce'
import { registerPublicKeys } from './routes/registerPublicKeys'
import { resolveProfile } from './routes/resolveProfile'
import { searchProfiles } from './routes/searchProfiles'
import { stats } from './routes/stats'
import { unregisterPublicKeys } from './routes/unregisterPublicKeys'
import { updateProfile } from './routes/updateProfile'
import { Env } from './types'
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
router.get('/stats', stats)

// Get nonce for publicKey.
router.get('/nonce/:publicKey', handleNonce)

// Search profiles.
router.get('/search/:chainId/:namePrefix', searchProfiles)

// Resolve profile.
router.get('/resolve/:chainId/:name', resolveProfile)

// Fetch profile.
router.get('/:publicKey', fetchProfile)

// Fetch profile with bech32 address.
router.get('/address/:bech32Address', fetchProfile)

// Fetch profile with address hex.
router.get('/hex/:addressHex', fetchProfile)
// Backwards compatible.
router.get('/bech32/:addressHex', fetchProfile)

// Generate JWT token via wallet auth.
router.post('/auth', signatureAuthMiddleware, authenticate)

// Get the token-authenticated profile, validating the JWT token.
router.get('/me', jwtAuthMiddleware, fetchAuthenticatedProfile)

// Update profile.
router.post('/', jwtOrSignatureAuthMiddleware, updateProfile)

// Register more public keys.
router.post('/register', jwtOrSignatureAuthMiddleware, registerPublicKeys)

// Unregister existing public keys.
router.post('/unregister', jwtOrSignatureAuthMiddleware, unregisterPublicKeys)

// 404
router.all('*', () => text('404', { status: 404 }))

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return router
      .fetch(request, env)
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
