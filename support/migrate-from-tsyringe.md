# Migrating from TSyringe to async-injection

> [!NOTE]
> The files in this directory are not built as part of this project.
> They are provided as a starting point to assist you in migrating off TSyringe.

`async-injection` was designed with TSyringe migrants in mind.  The API surface is intentionally close, and the new methods added in v3 close most of the remaining gaps.

---

## API mapping

| TSyringe | async-injection | Notes |
|---|---|---|
| `container.register(id, {useClass: X})` | `container.register(id, {useClass: X})` | ✅ identical |
| `container.register(id, {useValue: X})` | `container.register(id, {useValue: X})` | ✅ identical |
| `container.register(id, {useFactory: fn})` | `container.register(id, {useFactory: fn})` | ✅ identical |
| `container.registerSingleton(id, X)` | `container.registerSingleton(id, X)` | ✅ identical |
| `container.resolve(token)` ⚠️ | `container.get(id)` | see warning below |
| `container.isRegistered(id)` | `container.has(id)` | ✅ close match |
| `container.createChildContainer()` | `container.createChildContainer()` | ✅ identical |
| `container.clearInstances()` | `container.releaseSingletons()` | releases + removes |
| `@injectable()` | `@Injectable()` | PascalCase |
| `@inject(token)` | `@Inject(id)` | PascalCase |
| `@singleton()` | `@Injectable()` + `.asSingleton()` | no combined decorator |
| `InjectionToken<T>` | `InjectionToken<T>` | ✅ identical |

---

## ⚠️ Critical: `resolve` means something different

In TSyringe, `container.resolve(token)` is **synchronous**.
In `async-injection`, `container.resolve(id)` is **asynchronous** (returns a `Promise<T>`).

If you call `container.resolve(...)` after migrating and treat the result as a plain value, you will silently receive a `Promise` object instead of your service.

**Replace all TSyringe `container.resolve(X)` calls with `container.get(X)`** as the first step of your migration.

---

## Migration steps

**1. Install and configure**

```bash
npm uninstall tsyringe
npm install async-injection reflect-metadata
```

Add to your entry point (once, before anything else):

```typescript
import 'reflect-metadata';
```

**2. Replace `container.resolve()` with `container.get()`**

Search your codebase for `.resolve(` and replace each call:

```typescript
// Before
const svc = container.resolve(MyService);

// After
const svc = container.get(MyService);
```

**3. Update decorator casing**

```typescript
// Before
import { injectable, inject, singleton } from 'tsyringe';
@injectable()
class MyService { constructor(@inject('Logger') private log: Logger) {} }

// After
import { Injectable, Inject } from 'async-injection';
@Injectable()
class MyService { constructor(@Inject('Logger') private log: Logger) {} }
```

**4. Registration — no changes needed for the common cases**

`register`, `registerSingleton`, `createChildContainer`, and `InjectionToken` all work identically.

**5. Handle async dependencies (new capability)**

If any of your services need async initialization (database connections, remote config, etc.), this is now straightforward:

```typescript
container.register(DbPool, {
    useAsyncFactory: async (injector) => {
        const pool = new DbPool(injector.get(DbConfig));
        return pool.connect();
    }
}).asSingleton();

// Settle all async singletons before serving requests
await container.resolveSingletons(true);
```

TSyringe has no equivalent — this capability is unique to `async-injection`.

---

## What TSyringe has that async-injection does not

- **`@scoped(Lifecycle.X)`** — request/container/resolution scopes.  Use child containers (`createChildContainer()`) to achieve similar isolation.
- **`resolveAll` / `@injectAll`** — multi-bindings for a single token.  No direct equivalent today.
- **`container.reset()`** — clears all bindings.  No single-call equivalent; `removeBinding` can be called per id.
