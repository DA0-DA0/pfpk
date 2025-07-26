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

10. POST / (updateProfile - jwtOrSignatureAuthMiddleware)

Current Coverage ✅

- Authentication failure handling
- Invalid auth data structure

Additional Tests Needed:

- Profile creation: First-time profile setup
- Name updates: Valid names, uniqueness constraints, invalid formats
- NFT updates: Valid NFTs, ownership verification, image retrieval
- Chain preferences: Adding/removing chain mappings
- Nonce increment: Proper nonce progression
- Name validation: Length limits (1-32 chars), allowed characters
- NFT validation: Stargaze vs CW721 chains, ownership checks
- Partial updates: Individual field updates vs full replacement
- JWT auth path: Token-based updates
- Signature auth path: Wallet signature validation

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

13. CORS Handling

Current Coverage ✅

- Preflight OPTIONS requests
- CORS headers in responses
- Allowed methods validation

Additional Tests Needed:

- Various origins: Different domains, localhost, production
- Credentials handling: WithCredentials requests
- Headers validation: Custom headers, content-type handling
- Method restrictions: Blocked methods (PUT, DELETE, etc.)
- Max-age caching: Preflight cache behavior

14. Error Handling & Edge Cases

Current Coverage ✅

- Structured error responses
- Malformed JSON handling
- HTTP method validation

Additional Tests Needed:

- Database errors: Connection failures, constraint violations
- External API failures: NFT metadata retrieval, chain queries
- Rate limiting: If implemented
- Large payloads: Request size limits
- Concurrent operations: Race conditions, data consistency
- Memory limits: Large profile databases
- Network timeouts: External service dependencies

15. Security & Validation

Missing Coverage:

- Input sanitization: XSS prevention, injection attacks
- Request size limits: DoS prevention
- Authentication replay attacks: Nonce reuse prevention
- JWT security: Token tampering, algorithm confusion
- Public key validation: Malformed keys, wrong curves
- Chain ID validation: Injection via chain parameters
- NFT verification: Ownership spoofing attempts

16. Performance & Scalability

Missing Coverage:

- Database indexing: Query performance with large datasets
- Caching: Response caching behavior
- Connection pooling: Database connection management
- Memory usage: Profile data size limits
- Response times: Performance benchmarks
