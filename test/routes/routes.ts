import { SELF } from 'cloudflare:test'

import {
  CreateTokensRequest,
  CreateTokensResponse,
  FetchProfileResponse,
  FetchTokensResponse,
  InvalidateTokensRequest,
  NonceResponse,
  RegisterPublicKeysRequest,
  RequestBody,
  ResolveProfileResponse,
  SearchProfilesResponse,
  StatsResponse,
  UnregisterPublicKeysRequest,
  UpdateProfileRequest,
} from '../../src/types'

export const TEST_HOSTNAME = 'pfpk.test'

const url = (
  path: string,
  query?: [string, string][] | Record<string, string>
) =>
  'https://' +
  TEST_HOSTNAME +
  path +
  (query ? `?${new URLSearchParams(query).toString()}` : '')

export const createTokens = async (
  data?: RequestBody<CreateTokensRequest>,
  token?: string
) => {
  const request = new Request(url('/tokens'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: data && JSON.stringify(data),
  })
  const response = await SELF.fetch(request)
  const body = await response.json<any>()
  return {
    response,
    body: body as CreateTokensResponse,
    error: body.error as string | undefined,
  }
}

export const fetchAuthenticated = async (
  token?: string,
  {
    audience,
    role,
    headers,
  }: {
    audience?: string[]
    role?: string[]
    headers?: HeadersInit
  } = {}
) => {
  const request = new Request(
    url('/auth', [
      ...(audience?.map((audience): [string, string] => [
        'audience',
        audience,
      ]) ?? []),
      ...(role?.map((role): [string, string] => ['role', role]) ?? []),
    ]),
    {
      method: 'GET',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    }
  )
  const response = await SELF.fetch(request)
  const body = response.body ? await response.json<any>() : undefined
  return {
    response,
    body,
    error: body?.error as string | undefined,
  }
}

export const fetchMe = async (token: string) => {
  const request = new Request(url('/me'), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  const response = await SELF.fetch(request)
  const body = await response.json<any>()
  return {
    response,
    body: body as FetchProfileResponse,
    error: body.error as string | undefined,
  }
}

export const fetchNonce = async (publicKey: string) => {
  const request = new Request(url(`/nonce/${publicKey}`), {
    method: 'GET',
  })
  const response = await SELF.fetch(request)
  const body = await response.json<any>()
  return {
    response,
    body: body as NonceResponse,
    error: body.error as string | undefined,
  }
}

export const fetchProfileViaPublicKey = async (publicKey: string) => {
  const request = new Request(url(`/${publicKey}`), {
    method: 'GET',
  })
  const response = await SELF.fetch(request)
  const body = await response.json<any>()
  return {
    response,
    body: body as FetchProfileResponse,
    error: body.error as string | undefined,
  }
}

export const fetchProfileViaAddress = async (bech32Address: string) => {
  const request = new Request(url(`/address/${bech32Address}`), {
    method: 'GET',
  })
  const response = await SELF.fetch(request)
  const body = await response.json<any>()
  return {
    response,
    body: body as FetchProfileResponse,
    error: body.error as string | undefined,
  }
}

export const fetchProfileViaAddressHex = async (addressHex: string) => {
  const request = new Request(url(`/hex/${addressHex}`), {
    method: 'GET',
  })
  const response = await SELF.fetch(request)
  const body = await response.json<any>()
  return {
    response,
    body: body as FetchProfileResponse,
    error: body.error as string | undefined,
  }
}

export const fetchStats = async () => {
  const request = new Request(url('/stats'), {
    method: 'GET',
  })
  const response = await SELF.fetch(request)
  const body = await response.json<any>()
  return {
    response,
    body: body as StatsResponse,
    error: body.error as string | undefined,
  }
}

export const fetchTokens = async (token?: string) => {
  const request = new Request(url('/tokens'), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  const response = await SELF.fetch(request)
  const body = await response.json<any>()
  return {
    response,
    body: body as FetchTokensResponse,
    error: body.error as string | undefined,
  }
}

export const invalidateTokens = async (
  data: RequestBody<InvalidateTokensRequest>,
  token?: string
) => {
  const request = new Request(url('/tokens'), {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  })
  const response = await SELF.fetch(request)
  const body = response.body ? await response.json<any>() : undefined
  return {
    response,
    error: body?.error as string | undefined,
  }
}

export const registerPublicKeys = async (
  data: RequestBody<RegisterPublicKeysRequest>,
  token?: string
) => {
  const request = new Request(url('/register'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  })
  const response = await SELF.fetch(request)
  const body = response.body ? await response.json<any>() : undefined
  return {
    response,
    error: body?.error as string | undefined,
  }
}

export const resolveProfile = async (chainId: string, name: string) => {
  const request = new Request(url(`/resolve/${chainId}/${name}`), {
    method: 'GET',
  })
  const response = await SELF.fetch(request)
  const body = await response.json<any>()
  return {
    response,
    body: body as ResolveProfileResponse,
    error: body.error as string | undefined,
  }
}

export const searchProfiles = async (chainId: string, namePrefix: string) => {
  const request = new Request(url(`/search/${chainId}/${namePrefix}`), {
    method: 'GET',
  })
  const response = await SELF.fetch(request)
  const body = await response.json<any>()
  return {
    response,
    body: body as SearchProfilesResponse,
    error: body.error as string | undefined,
  }
}

export const unregisterPublicKeys = async (
  data: RequestBody<UnregisterPublicKeysRequest>,
  token?: string
) => {
  const request = new Request(url('/unregister'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  })
  const response = await SELF.fetch(request)
  const body = response.body ? await response.json<any>() : undefined
  return {
    response,
    error: body?.error as string | undefined,
  }
}

export const updateProfile = async (
  data: RequestBody<UpdateProfileRequest>,
  token?: string,
  _body?: BodyInit
) => {
  const request = new Request(url('/me'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: _body ?? JSON.stringify(data),
  })
  const response = await SELF.fetch(request)
  const body = response.body ? await response.json<any>() : undefined
  return {
    response,
    error: body?.error as string | undefined,
  }
}
