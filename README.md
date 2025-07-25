# pfpk

profile for public key. A [Cloudflare
Worker](https://developers.cloudflare.com/workers) that allows creating profiles
attached to wallets / public keys.

Currently deployed at https://pfpk.daodao.zone

A profile contains a name and NFT image and is associated with one or more
public keys. Chain preferences establish which public key to use for a given
chain.

In order for the profile to be resolvable by name when searching or resolving on
a given chain, and thus produce a public key and address to use on that chain, a
chain preference must be set. This is because different chains use different
default [derivation
paths](https://help.myetherwallet.com/en/articles/5867305-hd-wallets-and-derivation-paths)
for their wallet addresses, and thus different chains can end up with different
public keys / wallet addresses used by one wallet. For example, Juno (and most
Cosmos chains) uses coin type (slip44) 118, whereas Terra uses 330. This leads
to the same wallet (i.e. private key) deriving different public keys (and thus
addresses) for Juno and Terra. While a wallet can manually specify any
derivation path and thus access the address for any valid public key that its
private key controls, it would be confusing for someone to use an address with a
non-default derivation path. Thus, we require setting a chain preference in
order to explicitly opt-in/choose the address resolved on each chain so that
there is never confusion about which address a profile is using.

Both the update profile and register public keys routes automatically create a
new profile if one does not exist for the calling public key; similary, the
fetch profile route returns an empty profile object if the provided public key,
bech32 hash, or address is not associated with any profile. Thus it externally
appears as if all public keys/addresses are associated with an empty profile. An
empty profile contains the initial `nonce` (0), both `name` and `nft` set to
null, and `chains` an empty object.

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

2. Copy `.dev.vars.example` to `.dev.vars`.

3. Create D1 database:

```sh
npx wrangler d1 create pfpk
```

4. Create secrets:

```sh
echo -n "your-secret" | npx wrangler secret put JWT_SECRET
```

5. Update the binding ID in `wrangler.toml`:

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
- `GET /hex/:addressHex`

The returned type is:

```ts
type FetchProfileResponse = {
  uuid: string;
  nonce: number;
  name: string | null;
  nft: {
    chainId: string;
    collectionAddress: string;
    tokenId: string;
    imageUrl: string;
  } | null;
  chains: Record<
    string,
    {
      publicKey: {
        type: string;
        hex: string;
      }
      address: string;
    }
  >;
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

It also returns a map of chain ID to public key and address for that chain based
on the preferred public key. See the explanation at the top for more details.

If `uuid` is null, this means the profile has not yet been created by the
specified public key (i.e. no name, image, or chains have been set). This is the
default response returned for all profiles that do not yet exist. Once a profile
is created, `uuid` is set and will remain constant even if public keys attached
to it change, allowing a profile to be referenced by external services. This is
useful for authorizing and associating data with a specific profile instead of
just a single public key, allowing for authorized persistent data storage and
other usecases.

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
      publicKeyType: string;
      publicKeyHex: string;
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

This route lets the user perform partial updates to their existing profile, or
create a new profile if one does not exist for the current public key. If `name`
or `nft` is `null`, that field is cleared. If either is `undefined` or omitted,
nothing happens to that field. The name must be unique, at least 1 character
long, at most 32 characters long, and only contain alphanumeric characters,
periods, and underscores. The NFT must be owned by any of the profile's public
keys. If the NFT has no image, it will fail.

A set of chain IDs can optionally be provided. If provided, the public key will
be registered for all of these chains. If no chain IDs are provided when
creating a profile for the first time, the public key will be registered for the
chain used to sign the request.

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
          publicKeyType: string;
          publicKeyHex: string;
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
      publicKeyType: string;
      publicKeyHex: string;
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
registration needs to sign all of them. When registering new chains for the
profile public key performing the registration, the internal allowance signature
is not required.

If this route is called with a public key that is not attached to any profile, a
new empty profile is created automatically.

If a new public key being registered is attached to an existing profile, the
public key will be removed from it. If an existing profile has no other public
keys after the new public key is removed, the profile will be deleted.

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
key (and thus which address) to resolve their name to on each chain. This is
called a chain preference.

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
    publicKeys: {
      type: string
      hex: string
    }[]
    auth: {
      type: string;
      nonce: number;
      chainId: string;
      chainFeeDenom: string;
      chainBech32Prefix: string;
      publicKeyType: string;
      publicKeyHex: string;
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
    uuid: string | null;
    publicKey: {
      type: string;
      hex: string;
    };
    address: string;
    name: string | null;
    nft: {
      chainId: string;
      collectionAddress: string;
      tokenId: string;
      imageUrl: string;
    } | null;
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
    uuid: string;
    publicKey: {
      type: string;
      hex: string;
    };
    address: string;
    name: string | null;
    nft: {
      chainId: string;
      collectionAddress: string;
      tokenId: string;
      imageUrl: string;
    } | null;
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

### `GET /stats`

This route returns statistics about the profiles.

The returned type is:

```ts
type StatsResponse = {
  total: number;
};
```

or in the case of an error:

```ts
type StatsResponse = {
  error: string;
};
```
