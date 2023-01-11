import { Secp256k1, Secp256k1Signature } from "@cosmjs/crypto";
import { toBech32, fromHex, fromBase64 } from "@cosmjs/encoding";
import CryptoJS from "crypto-js";
import { getOwnedNftImageUrl } from "./chains";
import { ProfileNft, ProfileNftWithImage } from "./types";

// https://github.com/chainapsis/keplr-wallet/blob/088dc701ce14df77a1ee22b7e39c651e50879d9f/packages/crypto/src/key.ts#L56-L63
export const secp256k1PublicKeyToBech32Address = (
  hexPublicKey: string,
  bech32Prefix: string
): string => {
  // https://github.com/cosmos/cosmos-sdk/blob/e09516f4795c637ab12b30bf732ce5d86da78424/crypto/keys/secp256k1/secp256k1.go#L152-L162
  // Cosmos SDK generates address data using RIPEMD160(SHA256(pubkey)).
  const sha256Hash = CryptoJS.SHA256(
    // The `create` function is incorrectly typed to only take a `number[]`
    // type. It can also handle a `Uint8Array` type. Simply converting using
    // `Array.from` does not work because the `WordArray.create` function
    // recognizes that the bytes need to be combined into words when a
    // `Uint8Array` is passed. Conversely, it treats elements in a `number[]`
    // type as individual words (i.e. 4-byte numbers) and does not properly
    // combine them.
    CryptoJS.lib.WordArray.create(fromHex(hexPublicKey) as any)
  );
  const ripemd160Hash = CryptoJS.RIPEMD160(sha256Hash);

  // Output Bech32 formatted address.
  const addressData = fromHex(ripemd160Hash.toString(CryptoJS.enc.Hex));
  return toBech32(bech32Prefix, addressData);
};

export const verifySecp256k1Signature = async (
  hexPublicKey: string,
  message: Uint8Array,
  base64DerSignature: string
): Promise<boolean> => {
  const publicKeyData = fromHex(hexPublicKey);
  const signature = Secp256k1Signature.fromFixedLength(
    fromBase64(base64DerSignature)
  );

  const messageHash = fromHex(
    CryptoJS.SHA256(
      // The `create` function is incorrectly typed to only take a `number[]`
      // type. It can also handle a `Uint8Array` type. Simply converting using
      // `Array.from` does not work because the `WordArray.create` function
      // recognizes that the bytes need to be combined into words when a
      // `Uint8Array` is passed. Conversely, it treats elements in a `number[]`
      // type as individual words (i.e. 4-byte numbers) and does not properly
      // combine them.
      CryptoJS.lib.WordArray.create(message as any)
    ).toString(CryptoJS.enc.Hex)
  );

  return await Secp256k1.verifySignature(signature, messageHash, publicKeyData);
};

// Use NFT.Storage's IPFS gateway.
export const transformIpfsUrlToHttpsIfNecessary = (ipfsUrl: string) =>
  ipfsUrl.startsWith("ipfs://")
    ? ipfsUrl.replace("ipfs://", "https://nftstorage.link/ipfs/")
    : ipfsUrl;

export const EMPTY_PROFILE = {
  nonce: 0,
  name: null,
  nft: null,
};

export const getProfileKey = (publicKey: string) => `profile:${publicKey}`;
export const getNameTakenKey = (name: string) => `nameTaken:${name}`;

export const getOwnedNftWithImage = async (
  publicKey: string,
  nft: ProfileNft
): Promise<ProfileNftWithImage | null> => {
  // Verify selected NFT still belongs to the public key before responding with
  // it. If no image, return no NFT, since we can't display without an image.
  const imageUrl = await getOwnedNftImageUrl(
    nft.chainId,
    publicKey,
    nft.collectionAddress,
    nft.tokenId
  );

  return imageUrl
    ? {
        chainId: nft.chainId,
        collectionAddress: nft.collectionAddress,
        tokenId: nft.tokenId,
        imageUrl,
      }
    : null;
};
