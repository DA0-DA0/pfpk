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
