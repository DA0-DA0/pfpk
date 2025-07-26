import { RequestHandler } from 'itty-router'

import { AuthorizedRequest, FetchProfileResponse } from '../types'
import { getFetchedProfileJsonForProfile } from '../utils'

export const fetchMe: RequestHandler<AuthorizedRequest> = async (
  { profile },
  env: Env
): Promise<FetchProfileResponse> =>
  await getFetchedProfileJsonForProfile(env, profile)
