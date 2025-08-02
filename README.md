# pfpk

profile for public key. A [Cloudflare
Worker](https://developers.cloudflare.com/workers) that allows creating profiles
attached to wallets / public keys.

Currently deployed at https://pfpk.daodao.zone

## Development

### Set up

1. Install dependencies:

```sh
npm install
```

2. Copy `wrangler.toml.example` to `wrangler.toml`.

3. Copy `.dev.vars.example` to `.dev.vars` and fill in the secrets.

4. Create secrets:

```sh
echo -n "your-secret" | npx wrangler secret put JWT_SECRET
```

5. Create the D1 database and update `database_id` binding in `wrangler.toml`.

```sh
npx wrangler d1 create pfpk
```

### Run locally

```sh
npm run dev
```

### Run tests

```sh
npm run test
```

### Deploy to Cloudflare

```sh
npm run deploy
```

### Run migrations

```sh
npm run db:migrate
```

## Architecture

### Profile

A profile can contain a name and NFT image, is associated with one or more
public keys, and can manage authentication tokens.

All authenticated routes automatically create a new profile if one does not
exist for the public key signing the request. Also, profile retrieval routes
return an empty profile object if the provided public key or address is not
associated with any profile, thus appearing as if a profile exists for every
key.

The empty profile is the following:

```json
{
  "uuid": "",
  "name": null,
  "nft": null,
  "chains": {}
}
```

### Chain preferences

Chain preferences establish which public key to use for a given chain and is
necessary for address resolution and generation.

In order for a profile to be resolvable by name for a given chain, and generate
the associated public key and address relevant on that chain, a chain preference
must be set. This is because different chains use different default [derivation
paths](https://help.myetherwallet.com/en/articles/5867305-hd-wallets-and-derivation-paths)
for their wallet addresses, and thus different chains can end up with different
public keys / wallet addresses used by a single wallet private key.

For example, Juno (and most Cosmos chains) uses coin type (aka slip44) 118,
whereas Terra uses 330. This leads to the same wallet (i.e. private key)
deriving different public keys (and thus addresses) for Juno and Terra. While a
wallet can manually specify any derivation path and thus has access to the
address for all public keys that its private key can make, it would be confusing
for someone to use an address with a non-default derivation path, and require
technical knowledge to recover any funds sent there. Thus, we require setting a
chain preference in order to explicitly choose the address resolved on each
chain, ensuring there is never confusion about which address a profile is using.

### Authentication

There are two types of authentication:

- Key signature authentication
- JWT token authentication

A JWT token can optionally be created with any `audience` and `role`, defining
the purpose and scope of the token. Services that depend on this auth service
should require a specific audience and role for tokens they accept.

> [!NOTE]
> Most routes that support JWT token authentication require the token to have
> `audience` set to the hostname (probably `pfpk.daodao.zone`) and `role` set
> to `admin`. This will be referred to as the "admin token" in the rest of this
> spec.

Most routes that require authentication accept both forms, with a few
exceptions:

- `GET /me` only accepts JWT token authentication, because it's specifically
  used to verify if the provided token is valid. `audience` must be the
  hostname like normal, but `role` can be anything.
- `GET /auth` only accepts JWT token authentication, because it's specifically
  used to verify if the provided token is valid. It's similar to `GET /me`, but
  it allows you to set one or more audiences, scopes, and/or roles (via query
  params) to validate the token against, and it doesn't load the profile NFT (so
  it's faster). This should be used by external services to validate whether
  tokens have the audiences, scopes, and/or roles they expect.
- `GET /tokens` only accepts JWT token authentication, because GET requests
  cannot have a body, and it will likely only be used after tokens are created.
- `POST /tokens` accepts either authentication method, except when creating a
  token for this service (audience = hostname) since admin tokens can be used to
  create more tokens. More on that in the [Security](#security) section below.

### Security

JWT tokens are never stored in the database—only metadata about them, to assist
when listing tokens and invalidating them.

All tokens expire after 2 weeks and can be manually invalidated any time before
then. When creating a token for this service (audience = hostname), key
signature auth is **_required_**. This is because the admin token for this
service (which is the only type of token it uses) can be used to create more
tokens but should not be able to make more of itself—in the case that it's
compromised, the attacker should not be able to endlessly create more admin
tokens. Thus users are required to re-authenticate with their key (wallet) every
2 weeks, adding an additional security layer common in web2 login flows.

External services that use this service as their authentication layer should at
least require a specific audience (e.g. their hostname). Scopes and roles are
optional and can serve to support any additional access control needed.

# API

Request and response bodies are encoded via JSON.

Error responses have a status code >= 400 and a JSON response body:

```ts
{
  "error": string
}
```

## Authentication

There are two types of authentication: key signatures and JWT tokens.

> [!NOTE]
> Due to the nature of the key signature authentication method, all request
> bodies are wrapped in a `data` object. To maintain a consistent interface,
> **requests authenticated via JWT tokens also wrap their request bodies in a
> `data` object** (but no need for the `auth` nor `signature` field).

### Key signature authentication

Key signature authentication requires a specific wrapper around the request
body. The expected request body type is:

```ts
{
  data: {
    // REQUEST BODY FIELDS HERE
    ...
    // SIGNING INFO HERE
    auth: {
      type: string
      nonce: number
      chainId: string
      chainFeeDenom: string
      chainBech32Prefix: string
      publicKey: {
        type: string
        hex: string
      }
    }
  }
  // SIGNATURE OF THE ENTIRE STRINGIFIED `data` OBJECT
  signature: string
}
```

To prevent replay attacks, the `nonce` increments every time the key signature
authentication method is used and the signature is successfully verified,
regardless of whether the request ends up succeeding or failing. When using key
signature authentication, always query the `nonce` first via the `GET
/nonce/:publicKey` route (it's also in the profile object).

The signature is derived in accordance with [ADR 036: Arbitrary Message
Signature
Specification](https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-036-arbitrary-signature.md)
by calling `OfflineAminoSigner`'s `signAmino` function with the `signDoc`
argument generated using `makeSignDoc` from the `@cosmjs/amino` package. This
can be found in the `verifySignature` function in
[src/utils/auth.ts](./src/utils/auth.ts#L327).

### JWT token authentication

JWT token authentication is done by providing a bearer token in the
`Authorization` header. The expected request header is:

```
Authorization: Bearer JWT_TOKEN_HERE
```

Tokens are created in the `POST /tokens` route, are never stored in the
database, and expire after 2 weeks.

Like mentioned before, the admin token is required by most authenticated routes.

## Profile routes

### `GET /:publicKey`

No authentication is required for this route.

`publicKey` is the hexadecimal representation of a secp256k1 public key,
commonly used in the Cosmos ecosystem.

You can alternatively use the bech32 address, bech32 hash, or profile UUID (once
created) to query for the profile:

- `GET /address/:bech32Address`
- `GET /hex/:addressHex`
- `GET /uuid/:uuid`

This route checks that the given public key is attached to a profile, verifies
that the NFT is still owned by the profile, and verifies that the NFT has an
image URL set. If the profile no longer owns the NFT, or there is no image URL
set, no NFT is returned.

The retrieval of the image URL depends on the chain:

- For Stargaze, it is fetched from the Stargaze API.
- For all other chains, a cw721 NFT is expected. It queries the `nft_info`
  method on the smart contract of the NFT's `collectionAddress`. If `extension`
  is present, it checks for `image`, `image_uri`, and `image_url`, in that
  order. If any is present, it uses that one. If not, it tries to fetch the data
  located at the URL provided by the `token_uri` field. If this response is
  JSON, it assumes the data conforms to the [ERC721 Metadata JSON
  Schema](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-721.md#specification)
  standard, and uses the `image` field from that response. If the response is
  not JSON, it just uses `token_uri` directly and hopes it is an image. Some
  NFTs use that field for the image, and not all servers set the correct
  mimetype headers (such as IPFS URLs that don't care about the contents of the
  data).

It also returns a map of chain ID to public key and address for that chain based
on the preferred public key. See the explanation at the top of this README for
more details.

If the returned `uuid` is an empty string, this means the profile has not yet
been created by the specified public key (i.e. no name, image, or chains have
been set). This is the default response returned for all profiles that do not
yet exist. Once a profile is created, `uuid` is set and will remain constant
even if public keys attached to it change, allowing a profile to be referenced
by external services. This is useful for authorizing and associating data with a
specific profile instead of just a single public key, allowing for authorized
persistent data storage and other usecases.

#### Response

```ts
{
  uuid: string
  nonce: number
  name: string | null
  nft: {
    chainId: string
    collectionAddress: string
    tokenId: string
    imageUrl: string
  } | null
  chains: {
    [chainId: string]: {
      publicKey: {
        type: string
        hex: string
      }
      address: string
    }
  }
}
```

### `GET /nonce/:publicKey`

No authentication is required for this route.

This route returns the nonce for the given public key, which is necessary for
key signature authentication. It increments every time the key signature
authentication method is used and the signature is successfully verified,
regardless of whether the request ends up succeeding or failing, so this should
be queried first every time the key signature authentication method is used.

#### Response

```ts
{
  nonce: number
}
```

### `GET /me`

This route only supports JWT token authentication, but it does not require the
admin token—just the audience set to the hostname of this service.

It returns the profile associated with the JWT token if it's valid and its
audience includes the hostname of this service.

#### Response

```ts
{
  uuid: string
  chains: {
    [chainId: string]: {
      publicKey: {
        type: string
        hex: string
      }
      address: string
    }
  }
}
```

### `POST /me`

This route supports both key signature and admin token authentication.

It performs partial updates to a user's existing profile, or creates a new
profile if one does not exist for the signing public key. If `name` or `nft` is
`null`, that field is cleared. If either is `undefined` or omitted, nothing
happens to that field. The name must be unique, at least 1 character long, at
most 32 characters long, and only contain alphanumeric characters, periods, and
underscores. The NFT must be owned by the address corresponding with the public
key assigned to the chain the NFT is on. If the NFT has no image, it will fail.

A set of chain IDs can optionally be provided. If provided, the public key will
be registered for all of these chains. If no chain IDs are provided when
creating a profile for the first time, the public key will be registered for the
chain used to sign the request.

#### Request

```ts
{
  data: {
    profile: {
      name?: string | null
      nft?: {
        chainId: string
        collectionAddress: string
        tokenId: string
      } | null
    }
    chainIds?: string[]

    // ONLY IF USING KEY SIGNATURE AUTH
    auth?: {...}
  }
  // ONLY IF USING KEY SIGNATURE AUTH
  signature?: string
}
```

#### Response

A `204 No Content` status code is returned on success.

### `POST /register`

This route supports both key signature and admin token authentication.

It registers public keys for a user's profile and/or sets chain preferences for
their registered public keys. The keys being registered must sign allowances to
allow the profile to register them (or else anyone could claim any public key as
their own). Thus, the keys being registered must set `allow` to the profile's
UUID or any public key attached to the profile.

`chainIds` is an optional array of chain IDs to set as preferences for this
public key. If `chainIds` is omitted for a key being registered, it will just
set the chain preference for the chain used to sign the nested request. The
authentication structure is nested, so first the keys being registered need to
sign the data objects, and then the profile performing the registration needs to
sign all of them (or use admin token authentication). When registering new
chains for public keys already attached to the profile, the signature is not
necessary and can be omitted (but make sure the `auth` field is still present,
as that's the source of all the public key information).

If this route is called with a public key that is not attached to any profile, a
new empty profile is created automatically.

If a new public key being registered is attached to an existing profile, the
public key will be removed from that profile before being added to the new one.
If the existing profile has no public keys after the public key is transferred
away, the profile will be deleted.

All public keys attached to a profile will resolve to the profile when looked up
using the profile retrieval routes. However, **a profile must explicitly choose
a public key to use for name resolution/searching on each chain**. This is
because chains sometimes use different public key derivation paths from other
chains, and thus wallets aggregate default addresses that are associated with
different public keys in the same wallet. Requiring an explicit opt-in per chain
prevents someone from using an address for a profile that the profile holder
does not expect to use. Although it is still safe to use any of the public keys
controlled by the wallet/unique private key (since a user can manually add a new
derivation path to their wallet), it would lead to unexpected behavior to use
the undesired public key for a chain. Thus, the user needs to explicitly choose
which public key (and thus which address) to resolve their name to on each
chain. This is called a chain preference.

#### Request

```ts
{
  data: {
    publicKeys: {
      data: {
        allow:
          | {
              uuid: string
            }
          | {
              publicKey: {
                type: string
                hex: string
              }
            }
        chainIds?: string[]
        auth: {
          type: string
          nonce: number
          chainId: string
          chainFeeDenom: string
          chainBech32Prefix: string
          publicKey: {
            type: string
            hex: string
          }
        }
      }
      // ONLY IF THE PUBLIC KEY BEING REGISTERED IS NOT ALREADY ATTACHED TO THE PROFILE
      signature?: string
    }[]

    // ONLY IF USING KEY SIGNATURE AUTH FOR THE ENTIRE REQUEST
    auth?: {...}
  }
  // ONLY IF USING KEY SIGNATURE AUTH FOR THE ENTIRE REQUEST
  signature?: string
}
```

#### Response

A `204 No Content` status code is returned on success.

### `POST /unregister`

This route supports both key signature and admin token authentication.

It lets the user unregister public keys from their profile. If removing the last
public key from a profile, the profile will be deleted.

#### Request

```ts
{
  data: {
    publicKeys: {
      type: string
      hex: string
    }[]

    // ONLY IF USING KEY SIGNATURE AUTH
    auth: {...}
  }
  // ONLY IF USING KEY SIGNATURE AUTH
  signature?: string
}
```

#### Response

A `204 No Content` status code is returned on success.

### `GET /resolve/:chainId/:name`

No authentication is required for this route.

This route resolves a profile's name to its public key and address for a given
chain, if it has a public key attached to that chain via a chain preference.

The `name` to resolve is case-insensitive.

#### Response

```ts
{
  resolved: null | {
    uuid: string
    publicKey: {
      type: string
      hex: string
    }
    address: string
    name: string | null
    nft: {
      chainId: string
      collectionAddress: string
      tokenId: string
      imageUrl: string
    } | null
  }
}
```

### `GET /search/:chainId/:namePrefix`

No authentication is required for this route.

This route searches for profiles with names that have a given prefix and
resolves their public keys and addresses for a given chain, if they have a
public key attached to that chain via a chain preference. It returns the top 10
results.

`namePrefix` is the case-insensitive prefix of the name to search for. It must
be at least 1 character long and at most 32 characters long.

#### Response

```ts
{
  profiles: {
    uuid: string | null
    publicKey: {
      type: string
      hex: string
    }
    address: string
    name: string | null
    nft: {
      chainId: string
      collectionAddress: string
      tokenId: string
      imageUrl: string
    } | null
  }[]
}
```

## Token management routes

### `POST /tokens`

This route supports both key signature and admin token authentication.

It creates one or more JWT tokens for the profile. If no tokens are provided, a
single token will be created with no name, audience, nor role.

> [!NOTE]
> If any of the tokens' `audience` contains the hostname of this service, key
> signature auth is **_required_**.
>
> This serves to prevent the admin token from creating more admin tokens,
> reducing the impact of a compromised admin token, and forcing users to
> re-authenticate with their key (wallet) every 2 weeks.

#### Request

```ts
{
  data: {
    tokens?: {
      name?: string
      audience?: string[]
      scopes?: string[]
      role?: string
    }[]

    // ONLY IF USING KEY SIGNATURE AUTH
    auth?: {...}
  }
  // ONLY IF USING KEY SIGNATURE AUTH
  signature?: string
}
```

#### Response

A `204 No Content` status code is returned on success.

### `GET /tokens`

This route only supports admin token authentication.

It fetches all tokens for the profile, if any exist. The actual token is not
stored so it cannot be returned—just the metadata. This is useful for auditing
and invalidating tokens, for which you'll need the `id` field.

#### Response

```ts
{
  tokens: {
    id: string
    name: string | null
    audience: string[] | null
    scopes: string[] | null
    role: string | null
    issuedAt: number
    expiresAt: number
  }[]
}
```

### `DELETE /tokens`

This route supports both key signature and admin token authentication.

It invalidates tokens for the profile. `tokens` is an array of specific token
IDs to invalidate. If no tokens are provided, all will be invalidated.

#### Request

```ts
{
  data: {
    tokens?: string[]

    // ONLY IF USING KEY SIGNATURE AUTH
    auth?: {...}
  }
  // ONLY IF USING KEY SIGNATURE AUTH
  signature?: string
}
```

#### Response

A `204 No Content` status code is returned on success.

### `GET /auth`

This route only supports JWT token authentication.

It checks whether or not a token is valid, optionally letting you set one or
more audiences, scopes, and/or roles (via query params) to validate the token
against. This should be used by external services to validate whether tokens
have the permissions they expect.

#### Request

GET has no request body, but query params can be provided to validate the token
against. Each one can be set zero, one, or more times, though they behave
differently when multiple are provided:

- `audience`: If provided, the token must have **at least one** of the provided
  audiences.
- `scope`: If provided, the token must have **all** of the provided scopes.
- `role`: If provided, the token must have **at least one** of the provided
  roles.

To pass multiple values for a single param, pass it multiple times:

```
GET /auth?audience=JUST_AN_AUDIENCE
GET /auth?audience=ALLOWED_AUDIENCE&audience=OR_THIS_AUDIENCE

GET /auth?scope=ONE_SCOPE
GET /auth?scope=THIS_SCOPE&scope=AND_THIS_SCOPE&scope=DEFINITELY_THIS_SCOPE_TOO

GET /auth?role=JUST_THIS_ROLE
GET /auth?role=MAYBE_THIS_ROLE&role=OR_POSSIBLY_THIS_ROLE
```

And of course they can be combined:

```
GET /auth?audience=ALLOWED&audience=OR_THIS&scope=ALL_OF&scope=THESE&scope=SCOPES&role=MAYBE_THIS_ROLE&role=OR_POSSIBLY_THIS_ROLE
```

#### Response

```ts
{
  uuid: string
  chains: {
    [chainId: string]: {
      publicKey: {
        type: string
        hex: string
      }
      address: string
    }
  }
}
```

## Miscellaneous routes

### `GET /stats`

This route returns statistics about the profiles.

#### Response

```ts
{
  total: number
}
```
