import { KnownError } from './error'
import { INITIAL_NONCE } from './nft'
import { PublicKeyBase, makePublicKey } from '../publicKeys'
import {
  DbRowProfile,
  DbRowProfilePublicKey,
  DbRowProfilePublicKeyChainPreference,
  Env,
  PublicKey,
  PublicKeyJson,
  UpdateProfile,
} from '../types'

/**
 * Get the profile for a given name.
 */
export const getProfileFromName = async (
  env: Env,
  name: string
): Promise<DbRowProfile | null> =>
  await env.DB.prepare(
    `
    SELECT *
    FROM profiles
    WHERE name = ?1
    `
  )
    .bind(name)
    .first<DbRowProfile>()

/**
 * Get the profile for a given public key.
 */
export const getProfileFromPublicKeyHex = async (
  env: Env,
  publicKeyHex: string
): Promise<(DbRowProfile & { publicKeyId: number }) | null> =>
  await env.DB.prepare(
    `
    SELECT profiles.*, profile_public_keys.id AS publicKeyId
    FROM profiles
    INNER JOIN profile_public_keys
    ON profiles.id = profile_public_keys.profileId
    WHERE profile_public_keys.publicKeyHex = ?1
    `
  )
    .bind(publicKeyHex)
    .first<DbRowProfile & { publicKeyId: number }>()

/**
 * Get the profile for a given address hex.
 */
export const getProfileFromAddressHex = async (
  env: Env,
  addressHex: string
): Promise<DbRowProfile | null> =>
  await env.DB.prepare(
    `
    SELECT profiles.*, profile_public_keys.id AS publicKeyId
    FROM profiles
    INNER JOIN profile_public_keys
    ON profiles.id = profile_public_keys.profileId
    WHERE profile_public_keys.addressHex = ?1
    `
  )
    .bind(addressHex)
    .first<DbRowProfile & { publicKeyId: number }>()

/**
 * Get the nonce for a given public key. If no profile exists for the public
 * key, return the default nonce.
 */
export const getNonce = async (
  env: Env,
  publicKeyHex: string
): Promise<number> => {
  const profile = await getProfileFromPublicKeyHex(env, publicKeyHex)
  return profile?.nonce || INITIAL_NONCE
}

/**
 * Get the public key hex for a given address hex.
 */
export const getPublicKeyHexForAddressHex = async (
  env: Env,
  addressHex: string
): Promise<string | undefined> => {
  const publicKeyRow = await env.DB.prepare(
    `
    SELECT publicKey
    FROM profile_public_keys
    WHERE addressHex = ?1
    `
  )
    .bind(addressHex)
    .first<DbRowProfilePublicKey>()

  return publicKeyRow?.publicKeyHex
}

/**
 * Get top 5 profiles by name prefix and each profiles' public key for a given
 * chain.
 */
export const getProfilesWithNamePrefix = async (
  env: Env,
  namePrefix: string,
  chainId: string
): Promise<
  (Pick<
    DbRowProfile,
    | 'id'
    | 'uuid'
    | 'name'
    | 'nftChainId'
    | 'nftCollectionAddress'
    | 'nftTokenId'
  > &
    Pick<DbRowProfilePublicKey, 'type' | 'publicKeyHex' | 'addressHex'>)[]
> =>
  (
    await env.DB.prepare(
      `
      SELECT profiles.id, profiles.uuid, profiles.name, profiles.nftChainId, profiles.nftCollectionAddress, profiles.nftTokenId, profile_public_keys.type, profile_public_keys.publicKeyHex, profile_public_keys.addressHex
      FROM profiles
      INNER JOIN profile_public_key_chain_preferences
      ON profiles.id = profile_public_key_chain_preferences.profileId
      INNER JOIN profile_public_keys
      ON profile_public_key_chain_preferences.profilePublicKeyId = profile_public_keys.id
      WHERE profiles.name LIKE ?1
      AND profile_public_key_chain_preferences.chainId = ?2
      ORDER BY name ASC
      LIMIT 5
      `
    )
      .bind(namePrefix + '%', chainId)
      .all<DbRowProfile & DbRowProfilePublicKey>()
  ).results ?? []

/**
 * Get the public key for a profile on a given chain.
 */
export const getPreferredProfilePublicKey = async (
  env: Env,
  profileId: number,
  chainId: string
): Promise<PublicKey | null> => {
  const row = await env.DB.prepare(
    `
    SELECT profile_public_keys.type AS type, profile_public_keys.publicKeyHex AS publicKeyHex
    FROM profile_public_keys
    INNER JOIN profile_public_key_chain_preferences
    ON profile_public_keys.id = profile_public_key_chain_preferences.profilePublicKeyId
    WHERE profile_public_key_chain_preferences.profileId = ?1
    AND profile_public_key_chain_preferences.chainId = ?2
    `
  )
    .bind(profileId, chainId)
    .first<Pick<DbRowProfilePublicKey, 'type' | 'publicKeyHex'>>()

  return row && makePublicKey(row.type, row.publicKeyHex)
}

/**
 * Get the public keys for a profile.
 */
export const getProfilePublicKeys = async (
  env: Env,
  profileId: number
): Promise<
  {
    publicKey: PublicKey
    row: DbRowProfilePublicKey
  }[]
> =>
  (
    await env.DB.prepare(
      `
      SELECT *
      FROM profile_public_keys
      WHERE profileId = ?1
      `
    )
      .bind(profileId)
      .all<DbRowProfilePublicKey>()
  ).results.map((row) => ({
    publicKey: makePublicKey(row.type, row.publicKeyHex),
    row,
  }))

/**
 * Get the public key for each chain preference set on a profile.
 */
export const getProfilePublicKeyPerChain = async (
  env: Env,
  profileId: number
): Promise<
  {
    chainId: string
    publicKey: PublicKey
  }[]
> => {
  const rows = (
    await env.DB.prepare(
      `
      SELECT profile_public_key_chain_preferences.chainId AS chainId, profile_public_keys.type as type, profile_public_keys.publicKeyHex AS publicKeyHex
      FROM profile_public_key_chain_preferences
      INNER JOIN profile_public_keys
      ON profile_public_key_chain_preferences.profilePublicKeyId = profile_public_keys.id
      WHERE profile_public_key_chain_preferences.profileId = ?1
      `
    )
      .bind(profileId)
      .all<
        Pick<DbRowProfilePublicKeyChainPreference, 'chainId'> &
          Pick<DbRowProfilePublicKey, 'type' | 'publicKeyHex'>
      >()
  ).results

  return rows.map(({ chainId, type, publicKeyHex }) => ({
    chainId,
    publicKey: makePublicKey(type, publicKeyHex),
  }))
}

/**
 * Save profile.
 */
export const saveProfile = async (
  env: Env,
  publicKey: PublicKey,
  profile: UpdateProfile,
  // Optionally set chain preferences for this public key.
  chainIds?: string[]
): Promise<DbRowProfile> => {
  const existingProfile = await getProfileFromPublicKeyHex(env, publicKey.hex)

  let updatedProfileRow: DbRowProfile | null
  let profilePublicKeyId = existingProfile?.publicKeyId

  // If profile exists, update.
  if (existingProfile) {
    updatedProfileRow = await env.DB.prepare(
      `
      UPDATE profiles
      SET nonce = ?1, name = ?2, nftChainId = ?3, nftCollectionAddress = ?4, nftTokenId = ?5, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?6
      RETURNING *
      `
    )
      .bind(
        profile.nonce,
        profile.name,
        profile.nft?.chainId ?? null,
        profile.nft?.collectionAddress ?? null,
        profile.nft?.tokenId ?? null,
        existingProfile.id
      )
      .first<DbRowProfile>()
  }
  // Otherwise, create.
  else {
    updatedProfileRow = await env.DB.prepare(
      `
      INSERT INTO profiles (uuid, nonce, name, nftChainId, nftCollectionAddress, nftTokenId)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      RETURNING *
      `
    )
      .bind(
        crypto.randomUUID(),
        profile.nonce,
        profile.name,
        profile.nft?.chainId ?? null,
        profile.nft?.collectionAddress ?? null,
        profile.nft?.tokenId ?? null
      )
      .first<DbRowProfile>()
    if (!updatedProfileRow) {
      throw new KnownError(500, 'Failed to save profile.')
    }

    const profilePublicKeyRow = await env.DB.prepare(
      `
      INSERT INTO profile_public_keys (profileId, type, publicKeyHex, addressHex)
      VALUES (?1, ?2, ?3, ?4)
      RETURNING *
      `
    )
      .bind(
        updatedProfileRow.id,
        publicKey.type,
        publicKey.hex,
        publicKey.addressHex
      )
      .first<DbRowProfilePublicKey>()
    if (!profilePublicKeyRow) {
      throw new KnownError(500, 'Failed to save profile public key.')
    }

    profilePublicKeyId = profilePublicKeyRow.id
  }

  if (!updatedProfileRow) {
    throw new Error('Failed to update profile.')
  }

  // Set chain preferences for this public key if specified.
  if (chainIds && profilePublicKeyId !== undefined) {
    await setProfileChainPreferences(
      env,
      updatedProfileRow.id,
      profilePublicKeyId,
      chainIds
    )
  }

  return updatedProfileRow
}

/**
 * Increment profile nonce.
 */
export const incrementProfileNonce = async (
  env: Env,
  profileId: number
): Promise<void> => {
  await env.DB.prepare(
    `
    UPDATE profiles
    SET nonce = nonce + 1, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ?1
    `
  )
    .bind(profileId)
    .run()
}

/**
 * Add public key to profile and/or optionally update the profile's preferences
 * for the given chains to this public key.
 */
export const addProfilePublicKey = async (
  env: Env,
  profileId: number,
  publicKey: PublicKey,
  chainIds?: string[]
) => {
  // Get profile this public key is currently attached to.
  const currentProfile = await getProfileFromPublicKeyHex(env, publicKey.hex)

  // If attached to a different profile already, remove it.
  if (currentProfile && currentProfile.id !== profileId) {
    // Remove the public key from its current profile.
    await removeProfilePublicKeys(env, currentProfile.id, [publicKey])
  }

  const profilePublicKeyRow =
    // If not attached to the current profile, attach it.
    !currentProfile || currentProfile.id !== profileId
      ? await env.DB.prepare(
          `
          INSERT INTO profile_public_keys (profileId, type, publicKeyHex, addressHex)
          VALUES (?1, ?2, ?3, ?4)
          ON CONFLICT DO NOTHING
          RETURNING id
          `
        )
          .bind(profileId, publicKey.type, publicKey.hex, publicKey.addressHex)
          .first<Pick<DbRowProfilePublicKey, 'id'>>()
      : // Otherwise just find the existing public key.
        await env.DB.prepare(
          `
          SELECT id
          FROM profile_public_keys
          WHERE type = ?1 AND publicKeyHex = ?2
          `
        )
          .bind(publicKey.type, publicKey.hex)
          .first<Pick<DbRowProfilePublicKey, 'id'>>()
  if (!profilePublicKeyRow) {
    throw new KnownError(500, 'Failed to save or retrieve profile public key.')
  }

  // Set chain preferences for this public key if specified.
  if (chainIds) {
    await setProfileChainPreferences(
      env,
      profileId,
      profilePublicKeyRow.id,
      chainIds
    )
  }
}

/**
 * Set chain preferences for a given public key.
 */
const setProfileChainPreferences = async (
  env: Env,
  profileId: number,
  publicKeyRowId: number,
  chainIds: string[]
): Promise<void> => {
  // Insert or update chain preferences.
  await env.DB.batch(
    chainIds.map((chainId) =>
      env.DB.prepare(
        `
        INSERT INTO profile_public_key_chain_preferences (profileId, chainId, profilePublicKeyId)
        VALUES (?1, ?2, ?3)
        ON CONFLICT (profileId, chainId)
        DO UPDATE SET profilePublicKeyId = ?3, updatedAt = CURRENT_TIMESTAMP
        `
      ).bind(profileId, chainId, publicKeyRowId)
    )
  )
}

/**
 * Remove public keys from profile. If all public keys are removed, delete the
 * entire profile.
 */
export const removeProfilePublicKeys = async (
  env: Env,
  profileId: number,
  publicKeys: PublicKeyJson[]
) => {
  // Get all public keys attached to the profile.
  const publicKeyRows = await getProfilePublicKeys(env, profileId)

  // If removing all public keys, delete the entire profile, since no public
  // keys will have access to it anymore and thus we need to free up the name.
  if (
    publicKeyRows.every(({ publicKey }) =>
      publicKeys.some((key) => PublicKeyBase.publicKeysEqual(publicKey, key))
    )
  ) {
    // Delete cascades to public keys and chain preferences.
    await env.DB.prepare(
      `
      DELETE FROM profiles
      WHERE id = ?1
      `
    )
      .bind(profileId)
      .run()
    return
  }

  // Otherwise remove just these public keys.
  const publicKeyRowsToDelete = publicKeys.flatMap(
    (key) =>
      publicKeyRows.find(({ publicKey }) =>
        PublicKeyBase.publicKeysEqual(publicKey, key)
      ) || []
  )
  await env.DB.batch(
    publicKeyRowsToDelete.map(({ row: { id } }) =>
      // Delete cascades to chain preferences.
      env.DB.prepare(
        `
        DELETE FROM profile_public_keys
        WHERE id = ?1
        `
      ).bind(id)
    )
  )
}
