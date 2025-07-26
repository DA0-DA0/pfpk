import { SELF } from 'cloudflare:test'

import {
  AuthenticateResponse,
  FetchProfileResponse,
  NonceResponse,
  RegisterPublicKeyRequest,
  RegisterPublicKeyResponse,
  RequestBody,
  ResolveProfileResponse,
  SearchProfilesResponse,
  StatsResponse,
  UnregisterPublicKeyRequest,
  UnregisterPublicKeyResponse,
  UpdateProfileRequest,
  UpdateProfileResponse,
} from '../../src/types'

const BASE_URL = 'https://pfpk.test'
const url = (path: string) => BASE_URL + path

export const authenticate = async (data?: RequestBody<{}, true>) => {
  const request = new Request(url('/auth'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: data && JSON.stringify(data),
  })
  const response = await SELF.fetch(request)
  const body = await response.json<any>()
  return {
    response,
    body: body as AuthenticateResponse,
    error: body.error as string | undefined,
  }
}

export const fetchAuthenticated = async (
  token?: string,
  headers?: HeadersInit
) => {
  const request = new Request(url('/authenticated'), {
    method: 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  })
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

export const registerPublicKey = async (
  data: RequestBody<RegisterPublicKeyRequest>,
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
  const body = await response.json<any>()
  return {
    response,
    body: body as RegisterPublicKeyResponse,
    error: body.error as string | undefined,
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

export const searchProfile = async (chainId: string, namePrefix: string) => {
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

export const unregisterPublicKey = async (
  data: RequestBody<UnregisterPublicKeyRequest>,
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
  const body = await response.json<any>()
  return {
    response,
    body: body as UnregisterPublicKeyResponse,
    error: body.error as string | undefined,
  }
}

export const updateProfile = async (
  data: RequestBody<UpdateProfileRequest>,
  token?: string
) => {
  const request = new Request(url('/'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  })
  const response = await SELF.fetch(request)
  const body = await response.json<any>()
  return {
    response,
    body: body as UpdateProfileResponse,
    error: body.error as string | undefined,
  }
}
