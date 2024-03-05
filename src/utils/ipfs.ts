// Use DAO DAO's IPFS gateway.
export const transformIpfsUrlToHttpsIfNecessary = (ipfsUrl: string) =>
  ipfsUrl.startsWith('ipfs://')
    ? ipfsUrl.replace('ipfs://', 'https://ipfs.daodao.zone/ipfs/')
    : ipfsUrl
