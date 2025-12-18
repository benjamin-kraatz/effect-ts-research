# Idiomatic TypeScript Example

This directory contains a user service implementation using traditional idiomatic TypeScript patterns.

## Characteristics

### Error Handling

- Uses JavaScript exceptions (`throw new Error()`)
- Error types are NOT visible in function signatures
- Callers must guess or read implementation to know what can fail
- Error handling requires repetitive try-catch blocks

### Dependencies

- Manual constructor-based dependency injection
- Dependencies are not visible in function types
- Testing requires manual mocking during instantiation
- No compile-time verification of dependency satisfaction

### Concurrency

- Uses `Promise.all()` and `Promise.allSettled()`
- Manual implementation of concurrency limits
- No built-in cancellation support
- Resource cleanup requires careful try-finally nesting

### Resource Management

- Manual try-finally blocks for cleanup
- Silent failures during cleanup are common
- Nested resources require deeply nested try-finally

## Files

- `user-service.ts` - Complete user service with repository, service, and controller layers

## Issues Highlighted

1. **Hidden Errors**: Functions like `findById()` return `Promise<User>` but can throw:

   - `UserNotFoundError`
   - `DatabaseError`
   - `CacheError`

   The type system provides no indication of these possibilities.

2. **Repetitive Error Handling**: Each HTTP handler must manually catch and map errors.

3. **Implicit Dependencies**: The `UserRepository` requires `Database`, `Cache`, and `Logger`, but this is only visible by reading the constructor.

4. **Complex Concurrency**: Batch processing with concurrency limits requires manual implementation.

## Comparison

Compare with `../with-effect/` to see how Effect-TS addresses these issues through:

- Explicit error types in function signatures
- Type-level dependency tracking
- Built-in concurrency primitives
- Composable resource management
