import {
  OfflineAminoSigner,
  Secp256k1HdWallet,
  makeSignDoc,
} from '@cosmjs/amino'
import { stringToPath as stringToHdPath } from '@cosmjs/crypto'
import { fromBech32, toHex } from '@cosmjs/encoding'

import {
  createToken,
  fetchAuthenticated,
  fetchMe,
  fetchNonce,
  fetchProfileViaPublicKey,
  fetchTokens,
  invalidateTokens,
  registerPublicKeys,
  unregisterPublicKeys,
  updateProfile,
} from './routes/routes'
import { CosmosSecp256k1PublicKey } from '../src/publicKeys/CosmosSecp256k1PublicKey'
import {
  CreateTokenRequest,
  CreateTokenResponse,
  FetchProfileResponse,
  FetchTokensResponse,
  InvalidateTokensRequest,
  JwtRole,
  ProfileUpdate,
  RegisterPublicKeysRequest,
  RequestBody,
  UnregisterPublicKeysRequest,
  UpdateProfileRequest,
} from '../src/types'
import { Chain, mustGetChain } from '../src/utils'

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
   * JWT tokens for the user if authenticated.
   */
  private _tokens: Record<JwtRole, string> | undefined = undefined

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

  get tokens(): Record<JwtRole, string> {
    if (!this._tokens) {
      throw new Error('User not authenticated')
    }
    return this._tokens
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

  getAddressHex(chainId: string): string {
    return toHex(fromBech32(this.getAddress(chainId)).data)
  }

  getPublicKey(chainId: string): string {
    return this.getChain(chainId).publicKey
  }

  getSigner(chainId: string): OfflineAminoSigner {
    return this.getChain(chainId).signer
  }

  /**
   * Create a new JWT token for the user via wallet signature auth.
   *
   * @param chainId - Chain ID to authenticate for. Defaults to first chain.
   */
  async authenticate({
    chainId,
    ...request
  }: CreateTokenRequest & {
    chainId?: string
  } = {}): Promise<CreateTokenResponse> {
    const { body } = await createToken(
      await this.signRequestBody(request, {
        chainId,
      })
    )
    this._tokens = body.tokens
    return body
  }

  /**
   * Fetch whether or not the user is authenticated.
   */
  async fetchAuthenticated(): Promise<boolean> {
    const token = (this._tokens || (await this.authenticate()).tokens).verify
    const { response } = await fetchAuthenticated(token)
    return response.status === 204
  }

  /**
   * Fetch the authenticated user's profile.
   */
  async fetchMe(): Promise<FetchProfileResponse> {
    const token = (this._tokens || (await this.authenticate()).tokens).verify
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
   * Fetch the tokens created during authentications.
   */
  async fetchTokens(): Promise<FetchTokensResponse['tokens']> {
    const token = (this._tokens || (await this.authenticate()).tokens).admin
    const {
      body: { tokens },
    } = await fetchTokens(token)
    return tokens
  }

  /**
   * Invalidate tokens for the user.
   */
  async invalidateTokens(
    tokens: string[],
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
    const request: RequestBody<InvalidateTokensRequest> =
      await this.signRequestBody({
        tokens,
      })
    // Remove auth if using token authentication.
    if (withToken && this._tokens) {
      delete request.data.auth
    }

    const { response, error } = await invalidateTokens(
      request,
      withToken ? this._tokens?.admin : undefined
    )
    if (response.status !== 204) {
      throw new Error(
        `Failed to invalidate tokens: ${response.status} ${error}`
      )
    }
  }

  /**
   * Register public keys to the user's profile.
   */
  async registerPublicKeys({
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
    // Use first chain ID already prepared.
    const chainId = Object.keys(this.signers)[0]
    const profile = await this.fetchProfile(chainId)

    const publicKeys: RegisterPublicKeysRequest['publicKeys'] =
      await Promise.all(
        chainIds.map((registeringChainId) =>
          this.signRequestBody(
            {
              allow: profile.uuid
                ? { uuid: profile.uuid }
                : {
                    publicKey: {
                      type: CosmosSecp256k1PublicKey.type,
                      hex: this.getPublicKey(chainId),
                    },
                  },
              chainIds: [registeringChainId],
            },
            {
              chainId: registeringChainId,
              nonce: profile.nonce,
            }
          )
        )
      )

    const request: RequestBody<RegisterPublicKeysRequest> =
      await this.signRequestBody({
        publicKeys,
      })
    // Remove auth if using token authentication.
    if (withToken && this._tokens) {
      delete request.data.auth
    }

    const { response, error } = await registerPublicKeys(
      request,
      withToken ? this._tokens?.admin : undefined
    )
    if (response.status !== 204) {
      throw new Error(
        `Failed to register public keys: ${response.status} ${error}`
      )
    }
  }

  /**
   * Unregister public keys from the user's profile.
   */
  async unregisterPublicKeys({
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
    const publicKeys: UnregisterPublicKeysRequest['publicKeys'] = [chainIds]
      .flat()
      .flatMap((chainId) => profile.chains[chainId]?.publicKey ?? [])

    const request: RequestBody<UnregisterPublicKeysRequest> =
      await this.signRequestBody({
        publicKeys,
      })
    // Remove auth if using token authentication.
    if (withToken && this._tokens) {
      delete request.data.auth
    }

    const { response, error } = await unregisterPublicKeys(
      request,
      withToken ? this._tokens?.admin : undefined
    )
    if (response.status !== 204) {
      throw new Error(
        `Failed to unregister public keys: ${response.status} ${error}`
      )
    }
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
    if (withToken && this._tokens) {
      delete request.data.auth
    }

    const { response, error } = await updateProfile(
      request,
      withToken ? this._tokens?.admin : undefined
    )
    if (response.status !== 204) {
      throw new Error(`Failed to update profile: ${response.status} ${error}`)
    }
  }

  /**
   * Sign a request body.
   */
  async signRequestBody<Data extends Record<string, unknown>>(
    data: Data,
    {
      chainId,
      nonce,
      noSign = false,
    }: {
      /**
       * Chain ID to sign the request for. Defaults to first chain.
       */
      chainId?: string
      /**
       * Nonce to use for the request. Defaults to the latest nonce.
       */
      nonce?: number
      /**
       * Don't sign the request body, just return the data. This is useful for
       * generating the expected request body but using JWT token auth.
       */
      noSign?: boolean
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
        publicKey: {
          type: '/cosmos.crypto.secp256k1.PubKey',
          hex: publicKey,
        },
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

    const signature = noSign
      ? undefined
      : (await signer.signAmino(address, signDocAmino)).signature.signature

    return {
      data: dataWithAuth,
      signature,
    }
  }
}
