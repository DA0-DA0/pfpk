import { makePublicKey } from '../publicKeys'
import { DbRowProfile, FetchedProfile } from '../types'
import {
  getOwnedNftWithImage,
  getProfilePublicKeyPerChain,
  mustGetChain,
} from '../utils'

/**
 * Get the fetched profile JSON for a given profile row.
 */
export const getFetchedProfileJsonForProfile = async (
  env: Env,
  profileRow: DbRowProfile
): Promise<FetchedProfile> => {
  const fetchedProfile: FetchedProfile = {
    uuid: profileRow.uuid,
    name: profileRow.name?.trim() || null,
    nft: null,
    chains: {},
  }

  // TODO: figure out what to do with chains that aren't in the registry. this
  // causes registered chains not to be returned in the profile and then the
  // frontend won't let the user edit their profile.

  // Get chains.
  const accountPerChain = (
    await getProfilePublicKeyPerChain(env, profileRow.id)
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

  fetchedProfile.chains = Object.fromEntries(
    (await Promise.allSettled(accountPerChain)).flatMap((loadable) =>
      loadable.status === 'fulfilled' ? [loadable.value] : []
    )
  )

  // Verify selected NFT still belongs to the public key before responding
  // with it. On error, just ignore and return no NFT.
  if (
    profileRow.nftChainId &&
    profileRow.nftCollectionAddress &&
    profileRow.nftTokenId
  ) {
    try {
      // Get profile's public key for the NFT's chain, and then verify that
      // the NFT is owned by it.
      const publicKey = fetchedProfile.chains[profileRow.nftChainId]?.publicKey
      if (publicKey) {
        fetchedProfile.nft = await getOwnedNftWithImage(
          env,
          makePublicKey(publicKey.type, publicKey.hex),
          {
            chainId: profileRow.nftChainId,
            collectionAddress: profileRow.nftCollectionAddress,
            tokenId: profileRow.nftTokenId,
          }
        )
      }
    } catch (err) {
      console.error('Failed to get NFT image', err)
    }
  }

  return fetchedProfile
}
