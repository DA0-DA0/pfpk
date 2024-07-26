import { ApolloClient, InMemoryCache, gql } from '@apollo/client'

import { GetOwnedNftImageUrlFunction } from '../types'
import {
  Cw721,
  KnownError,
  NotOwnerError,
  hexPublicKeyToBech32Address,
} from '../utils'

const STARGAZE_GQL_URI = 'https://graphql.mainnet.stargaze-apis.com/graphql'
const STARGAZE_CHAIN_ID = 'stargaze-1'

const stargazeIndexerClient = new ApolloClient({
  uri: STARGAZE_GQL_URI,
  cache: new InMemoryCache(),
})

const STARGAZE_GQL_TOKEN_QUERY = gql`
  query tokenQuery($collectionAddr: String!, $tokenId: String!) {
    token(collectionAddr: $collectionAddr, tokenId: $tokenId) {
      tokenId
      collection {
        contractAddress
      }
      media {
        url
        visualAssets {
          lg {
            url
          }
        }
      }
      owner {
        address
      }
    }
  }
`

export const getOwnedNftImageUrl: GetOwnedNftImageUrlFunction = async (
  _,
  publicKey,
  collectionAddress,
  tokenId
) => {
  let stargazeAddress
  try {
    stargazeAddress = hexPublicKeyToBech32Address(STARGAZE_CHAIN_ID, publicKey)
  } catch (err) {
    console.error('PK to Address', err)
    throw new KnownError(400, 'Invalid public key', err)
  }

  const { error, data } = await stargazeIndexerClient.query({
    query: STARGAZE_GQL_TOKEN_QUERY,
    variables: {
      collectionAddr: collectionAddress,
      tokenId,
    },
  })

  if (error) {
    console.error('Failed to load data from Stargaze indexer', error)
    throw error
  }

  if (!data) {
    console.error('Failed to load data from Stargaze indexer')
    throw new KnownError(500, 'Failed to load token from Stargaze indexer')
  }

  const owner = data.token?.owner?.address
  if (!owner) {
    throw new KnownError(500, 'Failed to load owner from Stargaze indexer')
  }

  // If public key does not own the NFT, check if it was staked in a DAO by this
  // wallet.
  if (owner !== stargazeAddress) {
    const { staker } = await Cw721.getImageAndOwner(
      STARGAZE_CHAIN_ID,
      collectionAddress,
      tokenId
    )

    if (staker !== stargazeAddress) {
      throw new NotOwnerError()
    }
  }

  const imageUrl =
    data.token?.media?.visualAssets?.lg?.url || data.token?.media?.url
  if (imageUrl) {
    return imageUrl
  }
}
