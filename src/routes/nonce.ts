import { Request as IttyRequest } from 'itty-router'

import { Env, Profile } from '../types'
import { getProfileKey, respond, respondError } from '../utils'

export const handleNonce = async (
  request: IttyRequest,
  env: Env
): Promise<Response> => {
  const publicKey = request.params?.publicKey
  if (!publicKey) {
    return respondError(400, 'Missing publicKey.')
  }

  const profile = publicKey
    ? await env.PROFILES.get<Profile>(getProfileKey(publicKey), "json")
    : undefined;
  
  return respond(200, { nonce: profile?.nonce || 0 })
}
