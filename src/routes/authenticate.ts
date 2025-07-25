import { RequestHandler } from 'itty-router'

import { AuthenticateResponse, AuthorizedRequest } from '../types'
import { createJwt } from '../utils'

export const authenticate: RequestHandler<AuthorizedRequest> = async (
  { profile },
  env: Env
): Promise<AuthenticateResponse> => {
  const token = await createJwt(env, {
    uuid: profile.uuid,
    expiresIn: 60 * 60 * 24 * 14, // 2 weeks
  })

  return {
    token,
  }
}
