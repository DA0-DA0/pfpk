import { RequestHandler } from 'itty-router'

import { NonceResponse } from '../types'
import { KnownError, getNonce } from '../utils'

export const fetchNonce: RequestHandler = async (
  request,
  env: Env
): Promise<NonceResponse> => {
  const type = request.query?.type
  if (!type || typeof type !== 'string') {
    throw new KnownError(400, 'Missing or invalid type in query params.')
  }

  const hex = request.params?.publicKey
  if (!hex) {
    throw new KnownError(400, 'Missing publicKey.')
  }

  const nonce = await getNonce(env, {
    type,
    hex,
  })

  return { nonce }
}
