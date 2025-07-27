6. GET /search/:chainId/:namePrefix

Current Coverage ✅

- Empty results for non-existent names
- Array response structure

Additional Tests Needed:

- Populated results: Multiple matching profiles
- Pagination: Limit of 5 results (from README)
- Case sensitivity: "Test" vs "test" vs "TEST"
- Partial matching: Prefix behavior validation
- Chain-specific results: Same name, different chains
- Special characters: Names with periods, underscores
- Performance: Large name databases
- Invalid chains: Non-existent chainIds

7. GET /resolve/:chainId/:name

Current Coverage ✅

- 404 for non-existent names
- Proper error response structure

Additional Tests Needed:

- Successful resolution: Exact name matches
- Case insensitivity: Per README specification
- Chain preferences: Correct public key per chain
- Profile completeness: All fields populated correctly
- Invalid chains: Non-existent chainIds
- Name validation: Edge cases, reserved names

11. POST /register (jwtOrSignatureAuthMiddleware)

Current Coverage ✅

- Missing auth data handling

Additional Tests Needed:

- Public key registration: Adding new keys to profile
- Allowance signatures: Nested signature validation
- Chain preferences: Setting preferences for new keys
- Profile migration: Moving keys between profiles
- Profile cleanup: Deleting empty profiles
- Permission validation: Only allowed keys can be registered
- Duplicate registration: Handling already-registered keys
- Multiple keys: Batch registration
- Chain ID validation: Valid chain preferences

12. POST /unregister (jwtOrSignatureAuthMiddleware)

Current Coverage ✅

- Missing auth data handling

Additional Tests Needed:

- Key removal: Successful unregistration
- Profile cleanup: Profile deletion when empty
- Chain preference cleanup: Removing associated preferences
- Permission validation: Only profile owner can unregister
- Non-existent keys: Attempting to remove non-registered keys
- Partial unregistration: Some keys succeed, others fail
- Last key removal: Profile behavior with final key
