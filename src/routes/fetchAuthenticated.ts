import { RequestHandler } from 'itty-router'

import { AuthorizedRequest, FetchAuthenticatedResponse } from '../types'
import {
  getProfilePublicKeyPerChain,
  makeJwtAuthMiddleware,
  mustGetChain,
} from '../utils'

export const fetchAuthenticated: RequestHandler<AuthorizedRequest> = async (
  request,
  env: Env
): Promise<FetchAuthenticatedResponse> => {
  // One or more audiences and/or roles can be provided in the query.
  const audience = request.query.audience?.length
    ? [request.query.audience].flat()
    : undefined
  const role = request.query.role?.length
    ? [request.query.role].flat()
    : undefined

  // Run the JWT auth middleware to verify the token. This will either throw an
  // error for an invalid token or set the `request.profile` field.
  await makeJwtAuthMiddleware({ audience, role })(request, env)

  // TODO: consolidate this with logic in profile.ts

  // Get chains.
  const accountPerChain = (
    await getProfilePublicKeyPerChain(env, request.profile.id)
  ).map(
    async ({ chainId, publicKey }) =>
      [
        chainId,
        {
          publicKey: publicKey.json,
          address: await publicKey.getBech32Address(
            mustGetChain(chainId).bech32_prefix
          ),
        },
      ] as const
  )

  const chains = Object.fromEntries(
    (await Promise.allSettled(accountPerChain)).flatMap((loadable) =>
      loadable.status === 'fulfilled' ? [loadable.value] : []
    )
  )

  return {
    uuid: request.profile.uuid,
    chains,
  }
}
