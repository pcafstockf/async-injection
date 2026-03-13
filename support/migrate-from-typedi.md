# Migrating from TypeDI to async-injection

> **NOTE**  
> The files in this directory are not built as part of this project.  
> They are provided as illustrative starting points for common integration patterns.

TypeDI and `async-injection` share similar goals but differ in philosophy: TypeDI leans on a global static `Container` and auto-registration via `@Service()`, while `async-injection` keeps the container explicit and injectable. The migration is straightforward — and you gain first-class async injection along the way.

---

## API mapping

| TypeDI | async-injection | Notes |
|---|---|---|
| `Container.get(id)` | `container.get(id)` | instance vs. static |
| `Container.has(id)` | `container.has(id)` | ✅ identical (instance) |
| `Container.set(id, value)` | `container.bindConstant(id, value)` | or `register({useValue})` |
| `Container.remove(id)` | `container.removeBinding(id)` | or `unbind(id)` |
| `Container.reset()` | — | no single-call equivalent |
| `Container.of(scopeId)` | `new Container(parent)` | see scopes section |
| `new Token<T>(name)` | `new InjectionToken<T>(name)` | near-identical |
| `@Service()` | `@Injectable()` | no auto-registration |
| `@Inject()` | `@Inject(id)` | explicit id required |

---

## Key differences

**No global static container.** TypeDI's `Container` is a global singleton; `async-injection`'s `Container` is always an explicit instance you create and pass around. This is intentional — it makes dependencies explicit, supports multiple containers, and is essential for testing.

**No auto-registration.** TypeDI's `@Service()` registers the class into the global container at decoration time. In `async-injection`, `@Injectable()` only marks the class as injectable; you must explicitly call `container.bindClass(...)`. This keeps your composition root as the single place where bindings are defined.

---

## Migration steps

**1. Install and configure**

```bash
npm uninstall typedi
npm install async-injection reflect-metadata
```

Add to your entry point (once, before anything else):

```typescript
import 'reflect-metadata';
```

**2. Create an explicit container**

Replace all references to the global `Container` with an instance:

```typescript
// Before (TypeDI)
import { Container } from 'typedi';
Container.get(MyService);

// After
import { Container } from 'async-injection';
const container = new Container();
container.get(MyService);
```

**3. Replace `@Service()` with `@Injectable()` + explicit binding**

```typescript
// Before
import { Service } from 'typedi';
@Service()
class MyService { ... }

// After
import { Injectable } from 'async-injection';
@Injectable()
class MyService { ... }

// In your composition root:
container.bindClass(MyService).asSingleton();
```

**4. Replace `@Inject()` with `@Inject(id)`**

TypeDI's `@Inject()` can infer the type from the parameter. `async-injection` requires an explicit id when the type cannot be reflected (interfaces, primitives, or ambiguous tokens):

```typescript
// Before
@Service()
class OrderHandler {
    constructor(@Inject() private logger: Logger) {}
}

// After
@Injectable()
class OrderHandler {
    constructor(private logger: Logger) {}  // class type inferred automatically
}
```

For interface tokens, use `InjectionToken`:

```typescript
// Before
const LoggerToken = new Token<Logger>('Logger');

// After
import { InjectionToken } from 'async-injection';
const LoggerToken = new InjectionToken<Logger>('Logger');
```

**5. Replace `Container.set` with `bindConstant` or `register`**

```typescript
// Before
Container.set('AppUrl', 'https://example.com');

// After
container.bindConstant('AppUrl', 'https://example.com');
// or equivalently:
container.register('AppUrl', { useValue: 'https://example.com' });
```

---

## Scopes

TypeDI uses `Container.of(scopeId)` to retrieve (or create) a named scoped container.
`async-injection` achieves the same with an explicit child container:

```typescript
// TypeDI
const requestContainer = Container.of(requestId);

// async-injection
const requestContainer = container.createChildContainer();
// or: new Container(container)
```

The child container inherits all parent bindings and can override any of them locally.
Release the child container (and its singletons) when the scope ends:

```typescript
requestContainer.releaseSingletons();
```

---

## Handle async dependencies (new capability)

TypeDI has no async injection. If you have services that need async initialization, `async-injection` makes this straightforward:

```typescript
container.bindAsyncFactory(DbPool, async (injector) => {
    const pool = new DbPool(injector.get(DbConfig));
    return pool.connect();   // returns Promise<DbPool>
}).asSingleton();

// Settle all async singletons before serving requests
await container.resolveSingletons(true);
const pool = container.get(DbPool);  // fully initialized
```

---

## What TypeDI has that async-injection does not

- **`Container.reset()`** — clears all bindings at once. Use `removeBinding(id)` per id, or discard the container instance entirely.
- **`@InjectMany()` / multi-services** — binding multiple values to a single token. No direct equivalent today.
- **Auto-registration via `@Service()`** — deliberately absent; the composition root pattern is preferred.
