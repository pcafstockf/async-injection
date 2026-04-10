# Async-Injection

[![CI](https://github.com/pcafstockf/async-injection/workflows/CI/badge.svg)](https://github.com/pcafstockf/async-injection/actions)
[![npm version](https://img.shields.io/npm/v/async-injection)](https://www.npmjs.com/package/async-injection)
[![codecov](https://codecov.io/gh/pcafstockf/async-injection/graph/badge.svg)](https://codecov.io/gh/pcafstockf/async-injection)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
![OSS Lifecycle](https://img.shields.io/osslifecycle/pcafstockf/async-injection.svg)

**Lightweight TypeScript dependency injection — with first-class async support.**

`async-injection` is a general-purpose DI library for TypeScript. It keeps ordinary dependency injection simple, while supporting asynchronous initialization when your application needs it.

Most DI containers assume your dependencies are ready the moment they are constructed. `async-injection` doesn't.  
Synchronous and asynchronous dependencies can coexist naturally in the same container, and the library resolves each correctly — whether you get them immediately or need to await them.

## Install

```bash
npm install async-injection
```

Works in Node, browsers, Electron, and other runtimes.  
Ships as both ESM and CJS side by side.

## Why async-injection?

Designed to be a practical default choice for dependency injection in TypeScript applications.

- **TypeScript-first:** Fits naturally into real TypeScript code.
- **Simple for common cases:** Covers constructor injection, constants, factories, singletons, scopes, and lifecycle hooks without unnecessary complexity.
- **Async-capable by design:** Handles asynchronous initialization without requiring special-case wiring.
- **Framework-independent:** Works in backend services, frontend applications, Electron, libraries, or shared packages.
- **Scales with your application:** Starts with straightforward synchronous DI and makes it easy to add async dependencies later.

## Quick start

```typescript
@Injectable()
class SharedService {
    constructor(@Inject('LogLevel') @Optional('warn') private logLevel: string) { }
}

@Injectable()
class TransactionHandler {
    constructor(private svc: SharedService) { }
}

const container = new Container();
container.bindClass(SharedService).asSingleton();  // one shared instance
container.bindClass(TransactionHandler);           // new instance on each get
container.bindConstant('LogLevel', 'info');        // override defaulted 'warn' level
```
If all dependencies are ready, we can simply:
```typescript
const tx = container.get(TransactionHandler);
```
If any dependency could still be [asynchronously initializing](#async-dependencies), use:
```typescript
const tx = await container.resolve(TransactionHandler);
```

## Setup

Decorator-based dependency injection in TypeScript relies on emitted type metadata.  
Two `tsconfig.json` settings are required:

```json
{
  "experimentalDecorators": true,
  "emitDecoratorMetadata": true
}
```
Reflection metadata support is also required.  Rather than mandate a specific library, you have the freedom to bring your own — choose whichever fits your project:
* [reflect-metadata](https://www.npmjs.com/package/reflect-metadata)
* [core-js/es7/reflect](https://www.npmjs.com/package/core-js)
* [@abraham/reflection](https://www.npmjs.com/package/@abraham/reflection)

Import it once at your entry point, before anything else:
```typescript
import 'reflect-metadata';
```

## Async dependencies

Synchronous injection is straightforward and well understood.  
Asynchronous injection is also well established.  
The subtle part is when both need to coexist in the same container.

### `get` vs `resolve`

Think of `get(X)` / `resolve(X)` as a request not just for `X`, but for the entire tree of objects `X` depends on.  
`get` is only safe when every node in that tree is already settled.

| Condition | When to use |
|---|---|
| All dependencies are synchronous, **or** async singletons are already resolved | `container.get(X)` |
| Any dependency in the tree may still be pending | `await container.resolve(X)` |

> **Tip:**  
> Call `resolveSingletons(true)` after your last `bindXXX` call and before any `get` call to avoid hard-to-debug timing issues.

**When a dependency must do async work before it is usable** — open a database connection, load remote config, etc. — there are two ways to handle it:

#### **Async factory** — bind an async factory that performs the initialization and returns the ready instance:

```typescript
container.bindAsyncFactory(SharedService, async () => {
    const svc = new SharedService();
    return svc.connect();           // returns Promise<SharedService>
}).asSingleton();

// Option A — resolve everything up front, then use get() as normal
await container.resolveSingletons(true);
const tx = container.get(TransactionHandler);

// Option B — resolve on demand
const tx = await container.resolve(TransactionHandler);
```

> **Note:**  
> A factory takes full responsibility for constructing and initializing its object — `@PostConstruct` is not called on factory-returned instances.  
> `bindFactory` and `bindAsyncFactory` are therefore the right choice when you need complete control over how an object is built, or when you cannot annotate the class.

#### **`@PostConstruct`** — mark an initialization method to run on the fully constructed object after the constructor returns.  
The method can be synchronous or asynchronous, which is especially useful since a class constructor can never be async.  
It is also useful because a base class constructor cannot call methods overridden by a subclass.  
The method can have parameters which can be annotated with `@Inject` and `@Optional` — the container resolves and injects them before calling the method.  
This lets you avoid storing dependencies from the constructor solely for post-construction use:

```typescript
@Injectable()
class DatabasePool {
    @PostConstruct()
    async init(@Inject(DbConfig) config: DbConfig): Promise<void> {
        this.pool = await createPool(config);  // config is injected, not stored
    }
}
```

> **Important:**  
> Always explicitly declare the return type (`void` or `Promise<void>`, never leave it to be inferred).  
> `container.get()` will throw if the return type is missing and the method actually does return a Promise.  
> Constructor and `@PostConstruct` parameters follow the same rules: class-typed params are auto-resolved by reflected type; use `@Inject` for interface or primitive types. Use `@Optional()` with no argument to pass `undefined` if you want to allow a JS parameter default.

## Scopes

A child container inherits bindings from a parent container and can add or override bindings locally.

This is useful when a local scope needs its own bindings or singleton lifetime while still inheriting from a root container.
```typescript
const root = new Container();
const child = new Container(root);
```
The child checks its own bindings first, then falls back to the parent.
When the scope ends, release its singletons:
```typescript
await child.releaseSingletons();
```
For Node-specific ambient request context that should flow implicitly through async calls, Node's AsyncLocalStorage is often a better fit.

## IoC modules

No special module system is needed. TypeScript's own `import` mechanism is enough: create a file, import your container, and register your bindings.

## Features

- Constructor injection
- Constants, sync factories, and async factories
- Singleton and transient lifetimes
- Parent/child containers for scoped resolution
- `@PostConstruct` and `@Release` lifecycle hooks
- Typed injection tokens for interfaces and primitives
- Support for both synchronous and asynchronous dependency trees

## API

A Container's life follows a simple arc: *configure* it by registering bindings, *activate* it so async singletons can initialize, then *use* it to retrieve objects.

#### Configure

| |                                                                |
|---|----------------------------------------------------------------|
| `new Container(parent?)` | Create a container; optionally inherit bound ids from a parent |
| `bindConstant(id, value)` | Bind a fixed value                                             |
| `bindClass(id, class?)` | Bind a class (requires `@Injectable`)                          |
| `bindFactory(id, fn)` | Bind a synchronous factory function                            |
| `bindAsyncFactory(id, fn)` | Bind an asynchronous factory function                          |
| `.asSingleton()` | Chain: share one instance across the Container                 |
| `.onError(cb)` | Chain: handle construction errors                              |

#### Activate

| | |
|---|---|
| `resolveSingletons(true)` | Await all async singleton initializations |

#### Use

| | |
|---|---|
| `get(id)` | Synchronously retrieve a bound value |
| `resolve(id)` | Asynchronously retrieve a bound value (see [`get` vs `resolve`](#get-vs-resolve)) |

#### Annotate your classes

| | |
|---|---|
| `@Injectable()` | Required on any class bound with `bindClass` |
| `@Inject(id)` | Explicitly declare which id to inject into a constructor parameter |
| `@Optional(default?)` | Provide a fallback if the id is not bound; omit the argument to let a JS parameter default apply |
| `@PostConstruct()` | Mark a method to run after full construction (sync or async); parameters annotated with `@Inject`/`@Optional` are injected by the container |
| `@Release()` | Mark a method to call when a singleton is released |
| `InjectionToken<T>` | Create a typed token for binding interfaces or primitives |

## Support Resources
The [`support/`](./support) directory contains supplementary guides that are **not** part of the library itself:
- [`lazy-loading/`](./support/lazy-loading.md) — patterns for on-demand, split-bundle DI module loading
- [`react-integration/`](./support/react-integration.md) — using with React applications, including scoped child containers and testing patterns
- [`migrate-from-inversify/`](./support/migrate-from-inversify/ReadMe.md) — shim files and a two-phase migration guide for InversifyJS users
- [`migrate-from-tsyringe/`](./support/migrate-from-tsyringe.md) — migration guide for TSyringe users
- [`migrate-from-typedi/`](./support/migrate-from-typedi.md) — migration guide for TypeDI users

## Acknowledgements

Inspired by [InversifyJS](https://github.com/inversify/InversifyJS), [NestJS async providers](https://docs.nestjs.com/fundamentals/async-providers), [Darcy Rayner's DI walkthrough](https://dev.to/darcyrayner/typescript-dependency-injection-in-200-loc-12j7), and Carlos Delgado's [QueryablePromise](https://ourcodeworld.com/articles/read/317/how-to-check-if-a-javascript-promise-has-been-fulfilled-rejected-or-resolved) idea.

## License

[MIT](./License.txt) © 2020–2024 Frank Stock

# Child Containers with async-injection

A child container inherits bindings from a parent container and can add or override bindings locally.

Use a child container when you want an explicit local scope with its own bindings or singleton lifetime, while still reusing services from the application's root container.

> **NOTE**  
> The files in this directory are not built as part of this project.  
> They are provided as illustrative starting points for common integration patterns.

---

## Creating a child container
```
typescript
import {Container} from 'async-injection';

const root = new Container();
const child = new Container(root);
```
The child checks its own bindings first, then falls back to the parent.

---

## When to use one

Child containers are useful for:

- feature-local singletons
- temporary overrides
- isolated test setup
- operation-specific service graphs

This is different from Node's `AsyncLocalStorage`, which is usually a better fit for ambient request context that should flow implicitly through async calls.

Use a child container when you want explicit scoped bindings, local singleton lifetime, and explicit cleanup.

---

## Example
```
typescript
const root = new Container();
root.bindConstant('AppName', 'demo');

const child = new Container(root);
child.bindConstant('RequestId', 'req-123');

const appName = child.get('AppName');     // inherited from root
const requestId = child.get('RequestId'); // local to child
```
---

## Scoped singletons

A child container can have its own singletons that live only for that scope:
```
typescript
child.bindClass(SessionService).asSingleton();
await child.resolveSingletons(true);

const session = child.get(SessionService);
```
When the scope ends, release its singletons:
```
typescript
await child.releaseSingletons();
```
If a scoped singleton has cleanup work, mark a method with `@Release()`.

---

## Summary

Use child containers when you need:

- inherited root bindings
- local overrides
- scoped singletons
- explicit cleanup at the end of a feature, test, or operation
