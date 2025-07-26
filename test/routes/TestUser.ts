import {
  OfflineAminoSigner,
  Secp256k1HdWallet,
  makeSignDoc,
} from '@cosmjs/amino'
import { stringToPath as stringToHdPath } from '@cosmjs/crypto'
import { toHex } from '@cosmjs/encoding'

import {
  authenticate,
  fetchMe,
  fetchNonce,
  fetchProfileViaPublicKey,
  registerPublicKey,
  unregisterPublicKey,
  updateProfile,
} from './routes'
import {
  FetchProfileResponse,
  ProfileUpdate,
  RegisterPublicKeyRequest,
  RequestBody,
  UnregisterPublicKeyRequest,
  UpdateProfileRequest,
} from '../../src/types'
import { Chain, mustGetChain } from '../../src/utils'

export type TestUserChain = {
  chain: Chain
  signer: OfflineAminoSigner
  address: string
  publicKey: string
  publicKeyData: Uint8Array
}

export class TestUser {
  /**
   * Signer information for each chain.
   */
  private readonly signers: Record<string, TestUserChain> = {}

  /**
   * JWT token for the user if authenticated.
   */
  private _token: string | undefined = undefined

  constructor(private readonly mnemonic: string) {}

  /**
   * Create a new test user and optionally prepare chains for signing.
   */
  static async create(...prePrepareChainIds: string[]) {
    const mnemonic = (await Secp256k1HdWallet.generate(12)).mnemonic
    const user = new TestUser(mnemonic)
    await user.prepare(...prePrepareChainIds)
    return user
  }

  async prepare(...chainIds: string[]) {
    for (const chainId of chainIds) {
      if (this.signers[chainId]) {
        continue
      }

      const chain = mustGetChain(chainId)
      const signer = await Secp256k1HdWallet.fromMnemonic(this.mnemonic, {
        prefix: chain.bech32_prefix,
        hdPaths: [stringToHdPath(`m/44'/${chain.slip44}'/0'/0/0`)],
      })
      const [{ address, pubkey }] = await signer.getAccounts()
      this.signers[chainId] = {
        chain,
        signer,
        address,
        publicKey: toHex(pubkey),
        publicKeyData: pubkey,
      }
    }
  }

  get token(): string {
    if (!this._token) {
      throw new Error('User not authenticated')
    }
    return this._token
  }

  getChain(chainId: string): TestUserChain {
    const chain = this.signers[chainId]
    if (!chain) {
      throw new Error(`Chain ${chainId} not found`)
    }
    return chain
  }

  getAddress(chainId: string): string {
    return this.getChain(chainId).address
  }

  getPublicKey(chainId: string): string {
    return this.getChain(chainId).publicKey
  }

  getSigner(chainId: string): OfflineAminoSigner {
    return this.getChain(chainId).signer
  }

  /**
   * Authenticate the user and return the JWT token.
   */
  async authenticate(): Promise<string> {
    const { body } = await authenticate(await this.signRequestBody({}))
    this._token = body.token
    return this._token
  }

  /**
   * Fetch the authenticated user's profile.
   */
  async fetchMe(): Promise<FetchProfileResponse> {
    const token = this._token || (await this.authenticate())
    const { body } = await fetchMe(token)
    return body
  }

  /**
   * Fetch the nonce for the user.
   */
  async fetchNonce(
    // Default to first chain.
    chainId = Object.keys(this.signers)[0]
  ): Promise<number> {
    const {
      body: { nonce },
    } = await fetchNonce(this.getPublicKey(chainId))
    return nonce
  }

  /**
   * Fetch the user's profile via public key (does not authenticate).
   */
  async fetchProfile(
    chainId = Object.keys(this.signers)[0]
  ): Promise<FetchProfileResponse> {
    const { body } = await fetchProfileViaPublicKey(this.getPublicKey(chainId))
    return body
  }

  /**
   * Register public keys to the user's profile.
   */
  async registerPublicKey({
    chainIds,
    withToken = true,
  }: {
    /**
     * List of chains to register public keys for.
     */
    chainIds: string[]
    /**
     * Use JWT token authentication, if already authenticated. Defaults to true.
     */
    withToken?: boolean
  }) {
    const profile = await this.fetchProfile()
    const publicKeys: RegisterPublicKeyRequest['publicKeys'] =
      await Promise.all(
        chainIds.map((chainId) =>
          this.signRequestBody(
            {
              allow: profile.uuid,
              chainIds: [chainId],
            },
            {
              chainId,
              nonce: profile.nonce,
            }
          )
        )
      )

    const request: RequestBody<RegisterPublicKeyRequest> =
      await this.signRequestBody({
        publicKeys,
      })
    // Remove auth if using token authentication.
    if (withToken && this._token) {
      delete request.data.auth
    }

    const { body } = await registerPublicKey(
      request,
      withToken ? this._token : undefined
    )
    return body
  }

  /**
   * Unregister public keys from the user's profile.
   */
  async unregisterPublicKey({
    chainIds,
    withToken = true,
  }: {
    /**
     * List of chains to unregister public keys for.
     */
    chainIds: string | string[]
    /**
     * Use JWT token authentication, if already authenticated. Defaults to true.
     */
    withToken?: boolean
  }) {
    const profile = await this.fetchProfile()
    const publicKeys: UnregisterPublicKeyRequest['publicKeys'] = [chainIds]
      .flat()
      .flatMap((chainId) => profile.chains[chainId]?.publicKey ?? [])

    const request: RequestBody<UnregisterPublicKeyRequest> =
      await this.signRequestBody({
        publicKeys,
      })
    // Remove auth if using token authentication.
    if (withToken && this._token) {
      delete request.data.auth
    }

    const { body } = await unregisterPublicKey(
      request,
      withToken ? this._token : undefined
    )
    return body
  }

  /**
   * Update the profile for the user.
   */
  async updateProfile(
    profile: Omit<ProfileUpdate, 'nonce'>,
    {
      withToken = true,
    }: {
      /**
       * Use JWT token authentication, if already authenticated. Defaults to
       * true.
       */
      withToken?: boolean
    } = {}
  ) {
    const request: RequestBody<UpdateProfileRequest> =
      await this.signRequestBody({
        profile,
      })
    // Remove auth if using token authentication.
    if (withToken && this._token) {
      delete request.data.auth
    }

    await updateProfile(request, withToken ? this._token : undefined)
  }

  /**
   * Sign a request body.
   */
  async signRequestBody<Data extends Record<string, unknown>>(
    data: Data,
    {
      chainId,
      nonce,
    }: {
      /**
       * Chain ID to sign the request for. Defaults to first chain.
       */
      chainId?: string
      /**
       * Nonce to use for the request. Defaults to the latest nonce.
       */
      nonce?: number
    } = {}
  ): Promise<RequestBody<Data, true>> {
    chainId ??= Object.keys(this.signers)[0]
    nonce ??= await this.fetchNonce(chainId)

    await this.prepare(chainId)
    const { chain, address, publicKey, signer } = this.getChain(chainId)

    const dataWithAuth = {
      ...data,
      auth: {
        type: 'PFPK',
        nonce,
        chainId,
        chainFeeDenom: chain.fee_denom || '',
        chainBech32Prefix: chain.bech32_prefix,
        publicKeyType: '/cosmos.crypto.secp256k1.PubKey',
        publicKeyHex: publicKey,
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

    const { signature } = (await signer.signAmino(address, signDocAmino))
      .signature

    return {
      data: dataWithAuth,
      signature,
    }
  }
}
