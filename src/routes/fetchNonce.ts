import { RequestHandler } from 'itty-router'

import { NonceResponse } from '../types'
import { KnownError, getNonce } from '../utils'

export const fetchNonce: RequestHandler = async (
  request,
  env: Env
): Promise<NonceResponse> => {
  const publicKey = request.params?.publicKey
  if (!publicKey) {
    throw new KnownError(400, 'Missing publicKey.')
  }

  const nonce = await getNonce(env, publicKey)

  return { nonce }
}
