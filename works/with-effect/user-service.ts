/**
 * Effect-TS User Service Example
 * 
 * This file demonstrates Effect-TS patterns for building a user service
 * with database access, caching, and error handling.
 * 
 * Note how effects and errors are explicit in type signatures.
 */

import { Effect, Context, Layer, pipe, Option, Schedule, Duration, Console } from "effect"

// ============================================================================
// Domain Types
// ============================================================================

interface User {
  readonly id: string
  readonly email: string
  readonly name: string
  readonly createdAt: Date
}

interface CreateUserInput {
  readonly email: string
  readonly name: string
}

interface UpdateUserInput {
  readonly email?: string
  readonly name?: string
}

// ============================================================================
// Error Types (Explicit in type signatures)
// ============================================================================

/**
 * All errors are tagged for discriminated unions.
 * This enables type-safe error handling with catchTag.
 */

class UserNotFoundError {
  readonly _tag = "UserNotFoundError"
  constructor(readonly userId: string) {}
}

class DatabaseError {
  readonly _tag = "DatabaseError"
  constructor(
    readonly message: string,
    readonly cause?: unknown
  ) {}
}

class ValidationError {
  readonly _tag = "ValidationError"
  constructor(
    readonly message: string,
    readonly field?: string
  ) {}
}

class CacheError {
  readonly _tag = "CacheError"
  constructor(
    readonly message: string,
    readonly cause?: unknown
  ) {}
}

// Union type of all possible errors in the user domain
type UserError = UserNotFoundError | DatabaseError | ValidationError | CacheError

// ============================================================================
// Service Definitions (Dependencies are explicit via Context.Tag)
// ============================================================================

/**
 * Database service interface.
 * 
 * ADVANTAGE: The Requirements type (R) in Effect shows exactly what
 * dependencies a function needs to execute.
 */
class Database extends Context.Tag("Database")<
  Database,
  {
    readonly query: <T>(sql: string, params: unknown[]) => Effect.Effect<T[], DatabaseError>
    readonly execute: (sql: string, params: unknown[]) => Effect.Effect<void, DatabaseError>
  }
>() {}

/**
 * Cache service interface.
 */
class Cache extends Context.Tag("Cache")<
  Cache,
  {
    readonly get: <T>(key: string) => Effect.Effect<Option.Option<T>, CacheError>
    readonly set: <T>(key: string, value: T, ttlSeconds?: number) => Effect.Effect<void, CacheError>
    readonly delete: (key: string) => Effect.Effect<void, CacheError>
  }
>() {}

/**
 * Logger service interface.
 */
class Logger extends Context.Tag("Logger")<
  Logger,
  {
    readonly info: (message: string, meta?: Record<string, unknown>) => Effect.Effect<void>
    readonly error: (message: string, error?: unknown, meta?: Record<string, unknown>) => Effect.Effect<void>
    readonly debug: (message: string, meta?: Record<string, unknown>) => Effect.Effect<void>
  }
>() {}

// ============================================================================
// User Repository - Data Access Layer
// ============================================================================

/**
 * Find a user by ID with caching.
 * 
 * ADVANTAGE: The type signature tells us everything:
 * - Returns: User
 * - May fail with: UserNotFoundError | DatabaseError | CacheError
 * - Requires: Database | Cache | Logger services
 */
const findUserById = (id: string): Effect.Effect<
  User,
  UserNotFoundError | DatabaseError | CacheError,
  Database | Cache | Logger
> =>
  Effect.gen(function* () {
    const logger = yield* Logger
    const cache = yield* Cache
    const db = yield* Database

    yield* logger.debug("Finding user by ID", { userId: id })

    // Try cache first
    const cached = yield* pipe(
      cache.get<User>(`user:${id}`),
      // Recover from cache errors by treating as cache miss
      Effect.catchTag("CacheError", (error) =>
        Effect.gen(function* () {
          yield* logger.error("Cache error while fetching user", error, { userId: id })
          return Option.none<User>()
        })
      )
    )

    if (Option.isSome(cached)) {
      yield* logger.debug("User found in cache", { userId: id })
      return cached.value
    }

    // Query database
    const results = yield* db.query<User>(
      "SELECT * FROM users WHERE id = ?",
      [id]
    )

    if (results.length === 0) {
      return yield* Effect.fail(new UserNotFoundError(id))
    }

    const user = results[0]

    // Cache the result, ignoring cache errors
    yield* pipe(
      cache.set(`user:${id}`, user, 300),
      Effect.catchTag("CacheError", (error) =>
        logger.error("Failed to cache user", error, { userId: id })
      )
    )

    return user
  })

/**
 * Find a user by email.
 */
const findUserByEmail = (email: string): Effect.Effect<
  Option.Option<User>,
  DatabaseError,
  Database | Logger
> =>
  Effect.gen(function* () {
    const logger = yield* Logger
    const db = yield* Database

    yield* logger.debug("Finding user by email", { email })

    const results = yield* db.query<User>(
      "SELECT * FROM users WHERE email = ?",
      [email]
    )

    return results.length > 0 ? Option.some(results[0]) : Option.none()
  })

/**
 * Create a new user.
 * 
 * Type signature clearly shows:
 * - May fail with ValidationError (duplicate email) or DatabaseError
 */
const createUser = (input: CreateUserInput): Effect.Effect<
  User,
  ValidationError | DatabaseError,
  Database | Logger
> =>
  Effect.gen(function* () {
    const logger = yield* Logger
    const db = yield* Database

    yield* logger.info("Creating new user", { email: input.email })

    // Check for duplicate email
    const existing = yield* findUserByEmail(input.email)
    if (Option.isSome(existing)) {
      return yield* Effect.fail(new ValidationError("Email already in use", "email"))
    }

    const user: User = {
      id: crypto.randomUUID(),
      email: input.email,
      name: input.name,
      createdAt: new Date(),
    }

    yield* db.execute(
      "INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)",
      [user.id, user.email, user.name, user.createdAt]
    )

    return user
  })

/**
 * Update an existing user.
 */
const updateUser = (id: string, input: UpdateUserInput): Effect.Effect<
  User,
  UserNotFoundError | ValidationError | DatabaseError | CacheError,
  Database | Cache | Logger
> =>
  Effect.gen(function* () {
    const logger = yield* Logger
    const db = yield* Database
    const cache = yield* Cache

    yield* logger.info("Updating user", { userId: id, fields: Object.keys(input) })

    // Verify user exists
    const user = yield* findUserById(id)

    // Check email uniqueness if changing email
    if (input.email && input.email !== user.email) {
      const existing = yield* findUserByEmail(input.email)
      if (Option.isSome(existing)) {
        return yield* Effect.fail(new ValidationError("Email already in use", "email"))
      }
    }

    const updated: User = {
      ...user,
      email: input.email ?? user.email,
      name: input.name ?? user.name,
    }

    yield* db.execute(
      "UPDATE users SET email = ?, name = ? WHERE id = ?",
      [updated.email, updated.name, id]
    )

    // Invalidate cache
    yield* pipe(
      cache.delete(`user:${id}`),
      Effect.catchTag("CacheError", (error) =>
        logger.error("Failed to invalidate user cache", error, { userId: id })
      )
    )

    return updated
  })

/**
 * Delete a user.
 */
const deleteUser = (id: string): Effect.Effect<
  void,
  UserNotFoundError | DatabaseError | CacheError,
  Database | Cache | Logger
> =>
  Effect.gen(function* () {
    const logger = yield* Logger
    const db = yield* Database
    const cache = yield* Cache

    yield* logger.info("Deleting user", { userId: id })

    // Verify user exists
    yield* findUserById(id)

    yield* db.execute("DELETE FROM users WHERE id = ?", [id])

    // Invalidate cache
    yield* pipe(
      cache.delete(`user:${id}`),
      Effect.catchTag("CacheError", (error) =>
        logger.error("Failed to invalidate user cache after delete", error, { userId: id })
      )
    )
  })

// ============================================================================
// User Service - Business Logic Layer
// ============================================================================

/**
 * User profile with computed fields.
 */
interface UserProfile {
  readonly user: User
  readonly accountAge: number
  readonly isNewUser: boolean
}

/**
 * Get user profile with computed fields.
 * 
 * ADVANTAGE: Type tells us exactly what can go wrong.
 */
const getUserProfile = (userId: string): Effect.Effect<
  UserProfile,
  UserNotFoundError | DatabaseError | CacheError,
  Database | Cache | Logger
> =>
  Effect.gen(function* () {
    const user = yield* findUserById(userId)

    const accountAgeMs = Date.now() - user.createdAt.getTime()
    const accountAgeDays = Math.floor(accountAgeMs / (1000 * 60 * 60 * 24))

    return {
      user,
      accountAge: accountAgeDays,
      isNewUser: accountAgeDays < 30,
    }
  })

/**
 * Email validation as a pure effect.
 */
const validateEmail = (email: string): Effect.Effect<string, ValidationError> => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
    ? Effect.succeed(email)
    : Effect.fail(new ValidationError("Invalid email format", "email"))
}

/**
 * Name validation as a pure effect.
 */
const validateName = (name: string): Effect.Effect<string, ValidationError> =>
  name.length >= 2
    ? Effect.succeed(name)
    : Effect.fail(new ValidationError("Name must be at least 2 characters", "name"))

/**
 * Register a new user with validation.
 * 
 * The error type is automatically a union of all possible errors.
 */
const registerUser = (input: CreateUserInput): Effect.Effect<
  User,
  ValidationError | DatabaseError,
  Database | Logger
> =>
  Effect.gen(function* () {
    // Validate inputs - errors are automatically accumulated in the type
    yield* validateEmail(input.email)
    yield* validateName(input.name)

    return yield* createUser(input)
  })

/**
 * Change user email with verification.
 */
const changeEmail = (userId: string, newEmail: string): Effect.Effect<
  User,
  UserNotFoundError | ValidationError | DatabaseError | CacheError,
  Database | Cache | Logger
> =>
  Effect.gen(function* () {
    yield* validateEmail(newEmail)
    return yield* updateUser(userId, { email: newEmail })
  })

// ============================================================================
// HTTP Layer - Type-Safe Error Mapping
// ============================================================================

// Mock HTTP types
interface HttpRequest {
  readonly params: Record<string, string>
  readonly body: unknown
}

interface HttpResponse {
  readonly status: number
  readonly body: unknown
}

/**
 * Map domain errors to HTTP responses.
 * 
 * ADVANTAGE: The compiler ensures we handle all error cases
 * when using catchTags with exhaustive patterns.
 */
const mapErrorToResponse = (error: UserError): HttpResponse => {
  switch (error._tag) {
    case "UserNotFoundError":
      return { status: 404, body: { error: "User not found" } }
    case "ValidationError":
      return { status: 400, body: { error: error.message, field: error.field } }
    case "DatabaseError":
      return { status: 503, body: { error: "Service unavailable" } }
    case "CacheError":
      return { status: 503, body: { error: "Service degraded" } }
  }
}

/**
 * GET /users/:id
 * 
 * ADVANTAGE: Error handling is centralized and type-safe.
 */
const getUserHandler = (req: HttpRequest): Effect.Effect<
  HttpResponse,
  never, // All errors are handled, so this can't fail
  Database | Cache | Logger
> =>
  pipe(
    getUserProfile(req.params.id),
    Effect.map((profile) => ({ status: 200, body: profile })),
    Effect.catchAll((error) => Effect.succeed(mapErrorToResponse(error)))
  )

/**
 * POST /users
 */
const createUserHandler = (req: HttpRequest): Effect.Effect<
  HttpResponse,
  never,
  Database | Logger
> =>
  pipe(
    registerUser(req.body as CreateUserInput),
    Effect.map((user) => ({ status: 201, body: user })),
    Effect.catchAll((error) => Effect.succeed(mapErrorToResponse(error)))
  )

/**
 * PATCH /users/:id/email
 */
const updateEmailHandler = (req: HttpRequest): Effect.Effect<
  HttpResponse,
  never,
  Database | Cache | Logger
> =>
  pipe(
    changeEmail(req.params.id, (req.body as { email: string }).email),
    Effect.map((user) => ({ status: 200, body: user })),
    Effect.catchAll((error) => Effect.succeed(mapErrorToResponse(error)))
  )

// ============================================================================
// Batch Processing - Elegant Concurrency
// ============================================================================

/**
 * Process multiple users concurrently.
 * 
 * ADVANTAGES:
 * 1. Built-in concurrency control
 * 2. Structured error handling
 * 3. Automatic resource management
 * 4. Cancellation support
 */
const processUserBatch = (userIds: readonly string[]): Effect.Effect<
  {
    readonly successful: readonly { userId: string; profile: UserProfile }[]
    readonly failed: readonly { userId: string; error: string }[]
  },
  never,
  Database | Cache | Logger
> =>
  pipe(
    Effect.partition(
      userIds,
      (userId) => pipe(
        getUserProfile(userId),
        Effect.map((profile) => ({ userId, profile }))
      )
    ),
    Effect.map(([failures, successes]) => ({
      successful: successes,
      failed: failures.map((error) => ({
        userId: "unknown",
        error: error._tag
      }))
    }))
  )

/**
 * Process with concurrency limit.
 * 
 * ADVANTAGE: Concurrency is a simple option, not complex manual code.
 */
const processWithConcurrencyLimit = <T, R, E, A>(
  items: readonly T[],
  processor: (item: T) => Effect.Effect<A, E, R>,
  concurrencyLimit: number
): Effect.Effect<readonly A[], E, R> =>
  Effect.forEach(items, processor, { concurrency: concurrencyLimit })

/**
 * Process with retry logic.
 * 
 * ADVANTAGE: Retry policies are declarative and composable.
 */
const processWithRetry = (userId: string): Effect.Effect<
  UserProfile,
  UserNotFoundError | DatabaseError | CacheError,
  Database | Cache | Logger
> =>
  pipe(
    getUserProfile(userId),
    Effect.retry(
      Schedule.exponential(Duration.millis(100)).pipe(
        Schedule.compose(Schedule.recurs(3))
      )
    )
  )

// ============================================================================
// Layer Definitions - Composable Dependency Injection
// ============================================================================

/**
 * Mock Database implementation for testing/example.
 */
const DatabaseLive = Layer.succeed(Database, {
  query: <T>(_sql: string, _params: unknown[]) =>
    Effect.succeed([] as T[]),
  execute: (_sql: string, _params: unknown[]) =>
    Effect.succeed(undefined),
})

/**
 * Mock Cache implementation.
 */
const CacheLive = Layer.succeed(Cache, {
  get: <T>(_key: string) =>
    Effect.succeed(Option.none<T>()),
  set: <T>(_key: string, _value: T, _ttlSeconds?: number) =>
    Effect.succeed(undefined),
  delete: (_key: string) =>
    Effect.succeed(undefined),
})

/**
 * Console-based Logger implementation.
 */
const LoggerLive = Layer.succeed(Logger, {
  info: (message, meta) =>
    Console.log(`[INFO] ${message}`, meta ?? {}),
  error: (message, error, meta) =>
    Console.error(`[ERROR] ${message}`, error ?? "unknown", meta ?? {}),
  debug: (message, meta) =>
    Console.debug(`[DEBUG] ${message}`, meta ?? {}),
})

/**
 * Test implementations that don't perform real I/O.
 */
const DatabaseTest = Layer.succeed(Database, {
  query: <T>(_sql: string, _params: unknown[]) =>
    Effect.succeed([{ id: "test", email: "test@test.com", name: "Test", createdAt: new Date() }] as T[]),
  execute: (_sql: string, _params: unknown[]) =>
    Effect.succeed(undefined),
})

const CacheTest = Layer.succeed(Cache, {
  get: <T>(_key: string) =>
    Effect.succeed(Option.none<T>()),
  set: <T>(_key: string, _value: T, _ttlSeconds?: number) =>
    Effect.succeed(undefined),
  delete: (_key: string) =>
    Effect.succeed(undefined),
})

const LoggerTest = Layer.succeed(Logger, {
  info: (_message, _meta) => Effect.succeed(undefined),
  error: (_message, _error, _meta) => Effect.succeed(undefined),
  debug: (_message, _meta) => Effect.succeed(undefined),
})

/**
 * Compose all layers for production.
 * 
 * ADVANTAGE: Dependencies are resolved at compile time.
 * The type system ensures all required services are provided.
 */
const AppLayerLive = Layer.mergeAll(DatabaseLive, CacheLive, LoggerLive)

/**
 * Compose all layers for testing.
 */
const AppLayerTest = Layer.mergeAll(DatabaseTest, CacheTest, LoggerTest)

// ============================================================================
// Application Entry Point
// ============================================================================

/**
 * Run a program with all dependencies provided.
 * 
 * ADVANTAGE: Type system verifies all dependencies are satisfied
 * at compile time, not runtime.
 */
const runWithLive = <A, E>(
  program: Effect.Effect<A, E, Database | Cache | Logger>
): Promise<A> =>
  pipe(
    program,
    Effect.provide(AppLayerLive),
    Effect.runPromise
  )

const runWithTest = <A, E>(
  program: Effect.Effect<A, E, Database | Cache | Logger>
): Promise<A> =>
  pipe(
    program,
    Effect.provide(AppLayerTest),
    Effect.runPromise
  )

// ============================================================================
// Example Usage
// ============================================================================

const exampleProgram = Effect.gen(function* () {
  yield* Console.log("Starting user operations...")
  
  // Create a user
  const user = yield* pipe(
    registerUser({ email: "john@example.com", name: "John Doe" }),
    Effect.catchTag("ValidationError", (e) => 
      Effect.succeed({ id: "fallback", email: "", name: e.message, createdAt: new Date() })
    )
  )
  
  yield* Console.log(`Created user: ${user.name}`)
  
  // Get user profile
  const profile = yield* pipe(
    getUserProfile(user.id),
    Effect.catchAll(() => 
      Effect.succeed({ user, accountAge: 0, isNewUser: true })
    )
  )
  
  yield* Console.log(`Profile - Account age: ${profile.accountAge} days`)
  
  return profile
})

// To run: runWithLive(exampleProgram)

// ============================================================================
// Exports
// ============================================================================

export {
  // Types
  User,
  CreateUserInput,
  UpdateUserInput,
  UserProfile,
  UserError,
  
  // Errors
  UserNotFoundError,
  DatabaseError,
  ValidationError,
  CacheError,
  
  // Services
  Database,
  Cache,
  Logger,
  
  // Repository functions
  findUserById,
  findUserByEmail,
  createUser,
  updateUser,
  deleteUser,
  
  // Service functions
  getUserProfile,
  registerUser,
  changeEmail,
  
  // HTTP handlers
  getUserHandler,
  createUserHandler,
  updateEmailHandler,
  
  // Batch processing
  processUserBatch,
  processWithConcurrencyLimit,
  processWithRetry,
  
  // Layers
  DatabaseLive,
  CacheLive,
  LoggerLive,
  DatabaseTest,
  CacheTest,
  LoggerTest,
  AppLayerLive,
  AppLayerTest,
  
  // Runners
  runWithLive,
  runWithTest,
  
  // Example
  exampleProgram,
}

