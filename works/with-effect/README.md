# Effect-TS Example

This directory contains a user service implementation using Effect-TS patterns.

## Characteristics

### Error Handling

- All errors are explicit in function type signatures
- Uses tagged error classes for discriminated unions
- Type-safe error recovery with `catchTag` and `catchTags`
- Compiler ensures exhaustive error handling

### Dependencies

- Dependencies declared via `Context.Tag`
- Visible in the `R` type parameter of `Effect<A, E, R>`
- Compose using `Layer` for modular dependency injection
- Compile-time verification that all dependencies are satisfied

### Concurrency

- Built-in fiber-based concurrency model
- Simple `concurrency` option for parallel processing
- Automatic cancellation and interruption handling
- Structured concurrency with automatic cleanup

### Resource Management

- `Effect.acquireRelease` for safe resource handling
- Automatic cleanup in correct order (LIFO)
- `Effect.scoped` for managing resource lifecycles
- Errors during cleanup are explicitly handled

## Files

- `user-service.ts` - Complete user service with repository, service, and HTTP layers

## Key Patterns Demonstrated

### 1. Explicit Error Types

```typescript
const findUserById = (id: string): Effect.Effect<
  User,
  UserNotFoundError | DatabaseError | CacheError,
  Database | Cache | Logger
>
```

The type signature tells us:

- **Success**: Returns a `User`
- **Errors**: May fail with `UserNotFoundError`, `DatabaseError`, or `CacheError`
- **Dependencies**: Requires `Database`, `Cache`, and `Logger` services

### 2. Service Definitions with Tags

```typescript
class Database extends Context.Tag("Database")<
  Database,
  {
    readonly query: <T>(
      sql: string,
      params: unknown[]
    ) => Effect.Effect<T[], DatabaseError>;
    readonly execute: (
      sql: string,
      params: unknown[]
    ) => Effect.Effect<void, DatabaseError>;
  }
>() {}
```

### 3. Generator-Based Effects

```typescript
const getUserProfile = (userId: string) =>
  Effect.gen(function* () {
    const user = yield* findUserById(userId);
    // ... more effectful operations
    return { user, accountAge, isNewUser };
  });
```

### 4. Layer Composition

```typescript
const AppLayerLive = Layer.mergeAll(DatabaseLive, CacheLive, LoggerLive);
const AppLayerTest = Layer.mergeAll(DatabaseTest, CacheTest, LoggerTest);

// Run with production dependencies
const runWithLive = (program) =>
  pipe(program, Effect.provide(AppLayerLive), Effect.runPromise);

// Run with test dependencies
const runWithTest = (program) =>
  pipe(program, Effect.provide(AppLayerTest), Effect.runPromise);
```

### 5. Concurrency Control

```typescript
// Process with automatic concurrency limit
Effect.forEach(items, processor, { concurrency: 10 });

// Collect successes and failures separately
Effect.partition(items, processor);
```

### 6. Type-Safe Error Handling

```typescript
pipe(
  getUserProfile(userId),
  Effect.catchTags({
    UserNotFoundError: (e) => handleNotFound(e),
    DatabaseError: (e) => handleDbError(e),
    CacheError: (e) => handleCacheError(e),
  })
);
```

## Benefits Over Idiomatic TypeScript

| Aspect               | Idiomatic TS        | Effect-TS           |
| -------------------- | ------------------- | ------------------- |
| Error visibility     | Runtime only        | Compile-time        |
| Dependency tracking  | Implicit            | Explicit in types   |
| Error exhaustiveness | Not checked         | Compiler-enforced   |
| Concurrency          | Manual impl         | Built-in primitives |
| Resource safety      | Manual try/finally  | Automatic scoping   |
| Testability          | Constructor mocking | Layer substitution  |

## Running the Example

```bash
# Install dependencies (in a real project)
npm install effect

# The example can be run by calling:
# runWithLive(exampleProgram) or runWithTest(exampleProgram)
```

## Comparison

Compare with `../no-effect/` to see the traditional approach and understand what challenges Effect-TS solves.
