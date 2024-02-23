# pfpk

pic for public key. A [Cloudflare
Worker](https://developers.cloudflare.com/workers) that allows associating a
name and NFT (image) with a given set of [Cosmos](https://cosmos.network)
wallets / public keys.

Currently deployed at https://pfpk.daodao.zone

A profile contains a name and NFT image and is associated with one or more
public keys. A chain preference must be set for each public key in order for it
to be resolvable by the name.

## Setup

```
npm install -g wrangler
npm install
```

## Development

```
npm run dev
```

### Configuration

1. Copy `wrangler.toml.example` to `wrangler.toml`.

2. Configure secrets:

```sh
echo <VALUE> | npx wrangler secret put INDEXER_API_KEY
```

3. Create D1 database for production:

```sh
npx wrangler d1 create pfpk
```

4. Update the binding ID in `wrangler.toml`:

```toml
[[ d1_databases ]]
binding = "DB"
database_name = "pfpk"
database_id = "<REPLACE DB_ID>"
```

## API

### `GET /:publicKey`

`publicKey` is the hexadecimal representation of a secp256k1 public key used in
the Cosmos.

You can alternatively use the bech32 address or hash to query for the profile:

- `GET /address/:bech32Address`
- `GET /bech32/:bech32Hash`

The returned type is:

```ts
type FetchProfileResponse = {
  nonce: number;
  name: string | null;
  nft: {
    chainId: string;
    collectionAddress: string;
    tokenId: string;
    imageUrl: string;
  } | null;
  chains?: Record<string, string>;
};
```

or in the case of an error:

```ts
type FetchProfileResponse = {
  error: string;
};
```

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

It also returns a map of chain ID to preferred public key for that chain.

### `POST /`

The expected request body type is:

```ts
type UpdateProfileRequest = {
  data: {
    profile: {
      nonce: number;
      name?: string | null;
      nft?: {
        chainId: string;
        collectionAddress: string;
        tokenId: string;
      } | null;
    };
    chainIds?: string[];
    auth: {
      type: string;
      nonce: number;
      chainId: string;
      chainFeeDenom: string;
      chainBech32Prefix: string;
      publicKey: string;
    };
  };
  signature: string;
};
```

The returned type is:

```ts
type UpdateProfileResponse = {
  success: true;
};
```

or in the case of an error:

```ts
type UpdateProfileResponse = {
  error: string;
};
```

This route lets the user perform partial updates to their profile. If `name` or
`nft` is `null`, that field is cleared. If either is `undefined` or omitted,
nothing happens to that field. The name must be unique, at least 1 character
long, at most 32 characters long, and only contain alphanumeric characters,
periods, and underscores. The NFT must be owned by any of the profile's public
keys. If the NFT has no image, it will fail.

When creating a profile for the first time, a set of chain IDs can optionally be
provided. If provided, the public key will be registered for all of these
chains. If no chain IDs are provided, the public key will only be registered for
the chain used to sign the request.

The nonce from the latest GET request must be provided to prevent replay
attacks. It starts at 0, and the GET request will return an empty profile with a
nonce of 0 if nothing has been set.

The signature is derived by calling `OfflineAminoSigner`'s `signAmino` function
with the `signDoc` argument generated using `makeSignDoc` from the
`@cosmjs/amino` package. This can be seen in the signature verification code
located in [src/index.ts](./src/utils/auth.ts#L20) around line 20.

### `POST /register`

The expected request body type is:

```ts
type RegisterPublicKeyRequest = {
  data: {
    publicKeys: {
      data: {
        allow: string;
        chainIds?: string[];
        auth: {
          type: string;
          nonce: number;
          chainId: string;
          chainFeeDenom: string;
          chainBech32Prefix: string;
          publicKey: string;
        };
      };
      signature: string;
    }[];
    auth: {
      type: string;
      nonce: number;
      chainId: string;
      chainFeeDenom: string;
      chainBech32Prefix: string;
      publicKey: string;
    };
  };
  signature: string;
};
```

The returned type is:

```ts
type RegisterPublicKeyResponse = {
  success: true;
};
```

or in the case of an error:

```ts
type RegisterPublicKeyResponse = {
  error: string;
};
```

This route lets the user register public keys for their profile and/or set chain
preferences for their registered public keys. The keys being registered must
sign allowances (using the same nonce) to allow the profile to register them (or
else anyone could claim any public key as their own). Thus, the keys being
registered must set `allow` to the profile's public key that is registering
them. `chainIds` is an optional array of chain IDs to set as preferences for
this public key. If `chainIds` is omitted for a key being registered, it will
just set the chain preference for the chain used to sign the nested request. The
authentication structure is nested, so first the keys being registered need to
sign the data objects, and then the profile public key performing the
registration needs to sign all of them.

All public keys attached to a profile will resolve to the profile when looked up
using the GET request at the top (by address, public key, or bech32 hash).
However, **a profile must explicitly choose a public key to use for name
resolution/searching on each chain**. This is because chains sometimes use
different public key derivation paths from other chains, and thus wallets
aggregate default addresses that are associated with different public keys in
the same wallet. Requiring an explicit opt-in per chain prevents the user from
using an address for a profile that the profile holder does not expect to use.
Although it is still safe to use any of the public keys controlled by the
wallet/unique private key (since a user can manually add a new derivation path
to their wallet), it would lead to unexpected behavior to use the undesired
public key for a chain. Thus, the user needs to explicitly choose which public
key (and thus which address) to resolve their name to on each chain.

The nonce from the latest GET request must be provided to prevent replay
attacks.

The signature is derived by calling `OfflineAminoSigner`'s `signAmino` function
with the `signDoc` argument generated using `makeSignDoc` from the
`@cosmjs/amino` package. This can be seen in the signature verification code
located in [src/index.ts](./src/utils/auth.ts#L20) around line 20.

### `POST /unregister`

The expected request body type is:

```ts
type UnregisterPublicKeyRequest = {
  data: {
    publicKeys: string[]
    auth: {
      type: string;
      nonce: number;
      chainId: string;
      chainFeeDenom: string;
      chainBech32Prefix: string;
      publicKey: string;
    };
  };
  signature: string;
};
```

The returned type is:

```ts
type UnregisterPublicKeyResponse = {
  success: true;
};
```

or in the case of an error:

```ts
type UnregisterPublicKeyResponse = {
  error: string;
};
```

This route lets the user unregister public keys from their profile.

The nonce from the latest GET request must be provided to prevent replay
attacks.

The signature is derived by calling `OfflineAminoSigner`'s `signAmino` function
with the `signDoc` argument generated using `makeSignDoc` from the
`@cosmjs/amino` package. This can be seen in the signature verification code
located in [src/index.ts](./src/utils/auth.ts#L20) around line 20.

### `GET /search/:chainId/:namePrefix`

`chainId` is the chain ID of the chain, such as `juno-1` or `stargaze-1`. It
will transform the public keys associated with names to the bech32 addresses for
the given chain.

`namePrefix` is the prefix of the name to search for. It is case-insensitive.

The returned type is:

```ts
type SearchProfilesResponse = {
  profiles: Array<{
    publicKey: string;
    address: string;
    profile: {
      name: string | null;
      nft: {
        chainId: string;
        collectionAddress: string;
        tokenId: string;
        imageUrl: string;
      } | null;
    };
  }>;
};
```

or in the case of an error:

```ts
type SearchProfilesResponse = {
  error: string;
};
```

This route lets you search for profiles with names that have a given prefix. It
returns the top 5 results.

### `GET /resolve/:chainId/:name`

`chainId` is the chain ID, such as `juno-1` or `stargaze-1`. It will transform
the public keys associated with names to the bech32 address for the given chain.

`name` is the name to resolve. It is case-insensitive.

The returned type is:

```ts
type ResolveProfileResponse = {
  resolved: {
    publicKey: string;
    address: string;
    profile: {
      name: string | null;
      nft: {
        chainId: string;
        collectionAddress: string;
        tokenId: string;
        imageUrl: string;
      } | null;
    };
  } | null;
};
```

or in the case of an error:

```ts
type ResolveProfileResponse = {
  error: string;
};
```

This route lets you resolve a profile from its name.
