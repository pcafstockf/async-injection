# Async-Injection

[![CI](https://github.com/pcafstockf/async-injection/workflows/CI/badge.svg)](https://github.com/pcafstockf/async-injection/actions)
[![npm version](https://img.shields.io/npm/v/async-injection)](https://www.npmjs.com/package/async-injection)
[![codecov](https://codecov.io/gh/pcafstockf/async-injection/graph/badge.svg)](https://codecov.io/gh/pcafstockf/async-injection)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
![OSS Lifecycle](https://img.shields.io/osslifecycle/pcafstockf/async-injection.svg)

**Lightweight TypeScript dependency injection — with first-class async support.**

Most DI containers assume your dependencies are ready the moment they are constructed.  `async-injection` doesn't.  
Synchronous and asynchronous dependencies can coexist naturally in the same container, and the library resolves each correctly — whether you get them immediately or need to await them.

## Install

```bash
npm install async-injection
```

Works in Node, browsers, Electron, and other runtimes.  
Ships as both ESM and CJS side by side.

## Quick start

```typescript
@Injectable()
class SharedService {
    constructor(@Inject('LogLevel') @Optional('warn') private logLevel: string) { }
}

@Injectable()
class TransactionHandler {
    constructor(svc: SharedService) { }
}

const container = new Container();
container.bindClass(SharedService).asSingleton();  // one shared instance
container.bindClass(TransactionHandler);           // new instance on each get
container.bindConstant('LogLevel', 'info');        // override defaulted 'warn' level

const tx = container.get(TransactionHandler);
```

> **Tip:**  
> Real-world projects should follow best practices like [separation of concerns](https://medium.com/machine-words/separation-of-concerns-1d735b703a60), having a [composition root](https://medium.com/@cfryerdev/dependency-injection-composition-root-418a1bb19130), and should avoid anti-patterns like [service locator](http://scotthannen.org/blog/2018/11/27/stop-worrying-love-service-locator.html).

## Setup

Two `tsconfig.json` settings are required:

```json
{
  "experimentalDecorators": true,
  "emitDecoratorMetadata": true
}
```

Reflection metadata is also required.  Rather than mandate a specific library, you have the freedom to bring your own — choose whichever fits your project:
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
But when you are **blending** the two in the same container, it requires a little care.

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

Create isolated or hierarchical scopes using multiple containers.  
A child container searches its own bindings first, then walks up the parent hierarchy:

```typescript
const child = new Container(parent);
```

## IoC modules

No special module system needed — TypeScript's own `import` is your module system.  Create a file, import your container, and register your bindings.

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

## Acknowledgements

Inspired by [InversifyJS](https://github.com/inversify/InversifyJS), [NestJS async providers](https://docs.nestjs.com/fundamentals/async-providers), [Darcy Rayner's DI walkthrough](https://dev.to/darcyrayner/typescript-dependency-injection-in-200-loc-12j7), and Carlos Delgado's [QueryablePromise](https://ourcodeworld.com/articles/read/317/how-to-check-if-a-javascript-promise-has-been-fulfilled-rejected-or-resolved) idea.

## Support Resources
The [`support/`](./support) directory contains supplementary guides that are **not** part of the library itself:
- [`lazy-loading/`](./support/lazy-loading.md) — patterns for on-demand, split-bundle DI module loading
- [`react-integration/`](./support/react-integration.md) — using with React applications, including scoped child containers and testing patterns
- [`migrate-from-inversify/`](./support/migrate-from-inversify/ReadMe.md) — shim files and a two-phase migration guide for InversifyJS users
- [`migrate-from-tsyringe/`](./support/migrate-from-tsyringe.md) — migration guide for TSyringe users
- [`migrate-from-typedi/`](./support/migrate-from-typedi.md) — migration guide for TypeDI users

## License

[MIT](./License.txt) © 2020–2024 Frank Stock
