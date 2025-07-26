import { OfflineAminoSigner, makeSignDoc } from '@cosmjs/amino'
import { toHex } from '@cosmjs/encoding'

import { RequestBody } from '../../src/types'
import { mustGetChain } from '../../src/utils'

export const signOffChainAuth = async <
  Data extends Record<string, unknown> = Record<string, any>,
>({
  nonce,
  chainId,
  address,
  data,
  offlineSignerAmino,
}: {
  nonce: number
  chainId: string
  address: string
  data: Data
  offlineSignerAmino: OfflineAminoSigner
}): Promise<RequestBody<Data>> => {
  const chain = mustGetChain(chainId)

  const [{ pubkey }] = await offlineSignerAmino.getAccounts()
  const hexPublicKey = toHex(pubkey)

  const dataWithAuth = {
    ...data,
    auth: {
      type: 'PFPK',
      nonce,
      chainId,
      chainFeeDenom: chain.feeDenom || '',
      chainBech32Prefix: chain.bech32_prefix,
      publicKeyType: '/cosmos.crypto.secp256k1.PubKey',
      publicKeyHex: hexPublicKey,
      timestamp: Date.now(),
    },
  }

  // Generate data to sign.
  const signDocAmino = makeSignDoc(
    [
      {
        type: dataWithAuth.auth.type,
        value: {
          signer: address,
          data: JSON.stringify(dataWithAuth, undefined, 2),
        },
      },
    ],
    {
      gas: '0',
      amount: [
        {
          denom: dataWithAuth.auth.chainFeeDenom,
          amount: '0',
        },
      ],
    },
    chain.chain_id,
    '',
    0,
    0
  )

  const signature = (await offlineSignerAmino.signAmino(address, signDocAmino))
    .signature.signature

  return {
    data: dataWithAuth,
    signature,
  }
}
