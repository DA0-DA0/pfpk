import { Request as IttyRequest } from 'itty-router'

import { Env } from '../types'
import { getNonce, respond, respondError } from '../utils'

export const handleNonce = async (
  request: IttyRequest,
  env: Env
): Promise<Response> => {
  const publicKey = request.params?.publicKey
  if (!publicKey) {
    return respondError(400, 'Missing publicKey.')
  }

  const nonce = await getNonce(env, publicKey)

  return respond(200, { nonce })
}
