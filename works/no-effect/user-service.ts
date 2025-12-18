/**
 * Idiomatic TypeScript User Service Example
 * 
 * This file demonstrates traditional TypeScript patterns for building
 * a user service with database access, caching, and error handling.
 * 
 * Note the implicit effects and error handling challenges.
 */

// ============================================================================
// Domain Types
// ============================================================================

interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

interface CreateUserInput {
  email: string;
  name: string;
}

interface UpdateUserInput {
  email?: string;
  name?: string;
}

// ============================================================================
// Error Types (not tracked by type system in function signatures)
// ============================================================================

class UserNotFoundError extends Error {
  constructor(public readonly userId: string) {
    super(`User not found: ${userId}`);
    this.name = "UserNotFoundError";
  }
}

class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "DatabaseError";
  }
}

class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

class CacheError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "CacheError";
  }
}

// ============================================================================
// Infrastructure Interfaces (Dependencies not visible in type signatures)
// ============================================================================

interface Database {
  query<T>(sql: string, params: unknown[]): Promise<T[]>;
  execute(sql: string, params: unknown[]): Promise<void>;
}

interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: unknown, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

// ============================================================================
// User Repository - Data Access Layer
// ============================================================================

class UserRepository {
  constructor(
    private readonly db: Database,
    private readonly cache: Cache,
    private readonly logger: Logger
  ) {}

  /**
   * Find a user by ID with caching.
   * 
   * PROBLEM: Return type doesn't indicate possible errors:
   * - DatabaseError (connection issues, query failures)
   * - CacheError (cache unavailable)
   * - UserNotFoundError (user doesn't exist)
   * 
   * Callers must guess or check implementation to know what can fail.
   */
  async findById(id: string): Promise<User> {
    this.logger.debug("Finding user by ID", { userId: id });

    // Try cache first
    try {
      const cached = await this.cache.get<User>(`user:${id}`);
      if (cached) {
        this.logger.debug("User found in cache", { userId: id });
        return cached;
      }
    } catch (error) {
      // Cache errors are swallowed - is this correct?
      this.logger.error("Cache error while fetching user", error, { userId: id });
      // Continue to database...
    }

    // Query database
    try {
      const results = await this.db.query<User>(
        "SELECT * FROM users WHERE id = ?",
        [id]
      );

      if (results.length === 0) {
        throw new UserNotFoundError(id);
      }

      const user = results[0];

      // Cache the result (errors silently ignored)
      try {
        await this.cache.set(`user:${id}`, user, 300); // 5 minute TTL
      } catch (error) {
        this.logger.error("Failed to cache user", error, { userId: id });
      }

      return user;
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        throw error;
      }
      throw new DatabaseError("Failed to fetch user from database", error);
    }
  }

  /**
   * Find a user by email.
   * 
   * PROBLEM: Same issues as findById - errors not visible in types.
   */
  async findByEmail(email: string): Promise<User | null> {
    this.logger.debug("Finding user by email", { email });

    try {
      const results = await this.db.query<User>(
        "SELECT * FROM users WHERE email = ?",
        [email]
      );

      return results.length > 0 ? results[0] : null;
    } catch (error) {
      throw new DatabaseError("Failed to fetch user by email", error);
    }
  }

  /**
   * Create a new user.
   * 
   * PROBLEM: No indication that this might throw:
   * - ValidationError (duplicate email)
   * - DatabaseError (connection issues)
   */
  async create(input: CreateUserInput): Promise<User> {
    this.logger.info("Creating new user", { email: input.email });

    // Check for duplicate email
    const existing = await this.findByEmail(input.email);
    if (existing) {
      throw new ValidationError("Email already in use", "email");
    }

    const user: User = {
      id: crypto.randomUUID(),
      email: input.email,
      name: input.name,
      createdAt: new Date(),
    };

    try {
      await this.db.execute(
        "INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)",
        [user.id, user.email, user.name, user.createdAt]
      );

      return user;
    } catch (error) {
      throw new DatabaseError("Failed to create user", error);
    }
  }

  /**
   * Update an existing user.
   */
  async update(id: string, input: UpdateUserInput): Promise<User> {
    this.logger.info("Updating user", { userId: id, fields: Object.keys(input) });

    // Verify user exists
    const user = await this.findById(id);

    // Check email uniqueness if changing email
    if (input.email && input.email !== user.email) {
      const existing = await this.findByEmail(input.email);
      if (existing) {
        throw new ValidationError("Email already in use", "email");
      }
    }

    const updated: User = {
      ...user,
      email: input.email ?? user.email,
      name: input.name ?? user.name,
    };

    try {
      await this.db.execute(
        "UPDATE users SET email = ?, name = ? WHERE id = ?",
        [updated.email, updated.name, id]
      );

      // Invalidate cache
      try {
        await this.cache.delete(`user:${id}`);
      } catch (error) {
        this.logger.error("Failed to invalidate user cache", error, { userId: id });
      }

      return updated;
    } catch (error) {
      throw new DatabaseError("Failed to update user", error);
    }
  }

  /**
   * Delete a user.
   */
  async delete(id: string): Promise<void> {
    this.logger.info("Deleting user", { userId: id });

    // Verify user exists
    await this.findById(id);

    try {
      await this.db.execute("DELETE FROM users WHERE id = ?", [id]);

      // Invalidate cache
      try {
        await this.cache.delete(`user:${id}`);
      } catch (error) {
        this.logger.error("Failed to invalidate user cache after delete", error, {
          userId: id,
        });
      }
    } catch (error) {
      throw new DatabaseError("Failed to delete user", error);
    }
  }
}

// ============================================================================
// User Service - Business Logic Layer
// ============================================================================

class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  /**
   * Get user profile with computed fields.
   * 
   * PROBLEM: What errors can this throw?
   * - UserNotFoundError?
   * - DatabaseError?
   * - Something else?
   * 
   * The type system provides no guidance.
   */
  async getUserProfile(userId: string): Promise<{
    user: User;
    accountAge: number;
    isNewUser: boolean;
  }> {
    const user = await this.userRepository.findById(userId);

    const accountAgeMs = Date.now() - user.createdAt.getTime();
    const accountAgeDays = Math.floor(accountAgeMs / (1000 * 60 * 60 * 24));

    return {
      user,
      accountAge: accountAgeDays,
      isNewUser: accountAgeDays < 30,
    };
  }

  /**
   * Register a new user with validation.
   */
  async registerUser(input: CreateUserInput): Promise<User> {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(input.email)) {
      throw new ValidationError("Invalid email format", "email");
    }

    // Validate name
    if (input.name.length < 2) {
      throw new ValidationError("Name must be at least 2 characters", "name");
    }

    return this.userRepository.create(input);
  }

  /**
   * Change user email with verification.
   */
  async changeEmail(userId: string, newEmail: string): Promise<User> {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      throw new ValidationError("Invalid email format", "email");
    }

    return this.userRepository.update(userId, { email: newEmail });
  }
}

// ============================================================================
// HTTP Controller - API Layer
// ============================================================================

// Mock types for HTTP framework
interface Request {
  params: Record<string, string>;
  body: unknown;
}

interface Response {
  status(code: number): Response;
  json(data: unknown): void;
}

class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * GET /users/:id
   * 
   * PROBLEM: Error handling is verbose and repetitive.
   * Each endpoint must catch and map errors manually.
   */
  async getUser(req: Request, res: Response): Promise<void> {
    try {
      const profile = await this.userService.getUserProfile(req.params.id);
      res.status(200).json(profile);
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        res.status(404).json({ error: "User not found" });
      } else if (error instanceof DatabaseError) {
        res.status(503).json({ error: "Service unavailable" });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  }

  /**
   * POST /users
   */
  async createUser(req: Request, res: Response): Promise<void> {
    try {
      const input = req.body as CreateUserInput;
      const user = await this.userService.registerUser(input);
      res.status(201).json(user);
    } catch (error) {
      if (error instanceof ValidationError) {
        res.status(400).json({
          error: error.message,
          field: error.field,
        });
      } else if (error instanceof DatabaseError) {
        res.status(503).json({ error: "Service unavailable" });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  }

  /**
   * PATCH /users/:id/email
   */
  async updateEmail(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body as { email: string };
      const user = await this.userService.changeEmail(req.params.id, email);
      res.status(200).json(user);
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        res.status(404).json({ error: "User not found" });
      } else if (error instanceof ValidationError) {
        res.status(400).json({
          error: error.message,
          field: error.field,
        });
      } else if (error instanceof DatabaseError) {
        res.status(503).json({ error: "Service unavailable" });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  }
}

// ============================================================================
// Batch Processing Example - Concurrency Challenges
// ============================================================================

/**
 * Process multiple users concurrently.
 * 
 * PROBLEMS:
 * 1. Error handling is complex - what if some succeed and some fail?
 * 2. No built-in concurrency limits
 * 3. Resource exhaustion possible with large batches
 * 4. No structured cleanup if interrupted
 */
async function processUserBatch(
  userService: UserService,
  userIds: string[]
): Promise<{
  successful: Array<{ userId: string; profile: Awaited<ReturnType<UserService["getUserProfile"]>> }>;
  failed: Array<{ userId: string; error: string }>;
}> {
  const results = await Promise.allSettled(
    userIds.map(async (userId) => {
      const profile = await userService.getUserProfile(userId);
      return { userId, profile };
    })
  );

  const successful: Array<{ userId: string; profile: Awaited<ReturnType<UserService["getUserProfile"]>> }> = [];
  const failed: Array<{ userId: string; error: string }> = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      successful.push(result.value);
    } else {
      failed.push({
        userId: userIds[i],
        error: result.reason instanceof Error ? result.reason.message : "Unknown error",
      });
    }
  }

  return { successful, failed };
}

/**
 * Process with concurrency limit (manual implementation).
 * 
 * This is complex and error-prone to implement correctly.
 */
async function processWithConcurrencyLimit<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrencyLimit: number
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const promise = processor(item).then((result) => {
      results.push(result);
    });

    executing.push(promise);

    if (executing.length >= concurrencyLimit) {
      await Promise.race(executing);
      // Remove completed promises (simplified - real implementation needs tracking)
    }
  }

  await Promise.all(executing);
  return results;
}

// ============================================================================
// Application Wiring - Manual Dependency Injection
// ============================================================================

/**
 * Create application with all dependencies wired together.
 * 
 * PROBLEMS:
 * 1. Dependencies are wired manually - easy to make mistakes
 * 2. No compile-time verification that all dependencies are satisfied
 * 3. Testing requires manual mocking at construction time
 * 4. No clear dependency graph visualization
 */
function createApplication(config: {
  databaseUrl: string;
  cacheUrl: string;
  logLevel: string;
}): {
  userController: UserController;
  userService: UserService;
} {
  // Create infrastructure (implementations not shown)
  const logger: Logger = {
    info: (msg, meta) => console.log(`[INFO] ${msg}`, meta),
    error: (msg, err, meta) => console.error(`[ERROR] ${msg}`, err, meta),
    debug: (msg, meta) => console.debug(`[DEBUG] ${msg}`, meta),
  };

  // Mock implementations for example
  const database: Database = {
    query: async () => [],
    execute: async () => {},
  };

  const cache: Cache = {
    get: async () => null,
    set: async () => {},
    delete: async () => {},
  };

  // Wire dependencies
  const userRepository = new UserRepository(database, cache, logger);
  const userService = new UserService(userRepository);
  const userController = new UserController(userService);

  return { userController, userService };
}

// ============================================================================
// Export for comparison
// ============================================================================

export {
  User,
  CreateUserInput,
  UpdateUserInput,
  UserNotFoundError,
  DatabaseError,
  ValidationError,
  CacheError,
  UserRepository,
  UserService,
  UserController,
  processUserBatch,
  createApplication,
};

