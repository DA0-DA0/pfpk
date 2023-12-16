// Use NFT.Storage's IPFS gateway.
export const transformIpfsUrlToHttpsIfNecessary = (ipfsUrl: string) =>
  ipfsUrl.startsWith("ipfs://")
    ? ipfsUrl.replace("ipfs://", "https://nftstorage.link/ipfs/")
    : ipfsUrl;
