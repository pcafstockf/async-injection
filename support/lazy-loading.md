# Lazy Loading with async-injection

Modern bundlers (webpack, Rollup, Vite) create separate chunks at dynamic `import()` boundaries,
letting you defer parts of your application — and their DI bindings — until actually needed.

`async-injection` supports this naturally: write an `async` setup function per feature, call it at
the right moment, and the bundler does the rest. No special library support required.

> **NOTE**  
> The files in this directory are not built as part of this project.  
> They are provided as illustrative starting points for common integration patterns.

---

## The setup function pattern

A *setup function* is an `async` function that dynamically imports a feature's modules and
registers their bindings with the container:

```typescript
// feature-a/setup.ts
import type {Container} from 'async-injection';

export async function setupFeatureA(di: Container): Promise<void> {
    // The dynamic import() is the bundler split point.
    // Everything transitively imported by './service' lands in a separate chunk.
    const {FeatureAService, FeatureA_Service_DI} = await import('./service');

    if (!di.isIdKnown(FeatureA_Service_DI))
        di.bindClass(FeatureA_Service_DI, FeatureAService).asSingleton();

    // Settle any async singletons registered above before the caller uses get().
    await di.resolveSingletons(true);
}
```

> **TIP:**  
> - Token and implementation come from the same dynamic import — simple and sufficient for most cases.
> - `isIdKnown` makes the setup function safely idempotent — call it multiple times, binds only once.
> - `resolveSingletons(true)` ensures new async singletons are fully initialized before any `container.get()` call.

If eagerly-loaded code needs to reference a token *before* the feature loads (e.g., to call
`isIdKnown` at startup or type a stored variable), place the token in a dedicated `tokens.ts` and
import it statically. The implementation stays in the lazy chunk; only the lightweight token value
lands in the eager bundle. For most setups this is unnecessary.

---

## Pattern 1 — React Router

TanStack Router and React Router v6.4+ both support a `loader` (or `beforeLoad`) hook that runs
before a route's component is rendered — a natural demand signal for lazy DI setup:

```typescript
// router.ts
import {createBrowserRouter} from 'react-router-dom';
import {appContainer} from './app';                   // your root container

const router = createBrowserRouter([
    {
        path: '/',
        // ... eager root routes
    },
    {
        path: '/feature-a',
        // loader runs before the component renders; its return value is available via useLoaderData()
        loader: async () => {
            const {setupFeatureA} = await import('./feature-a/setup');
            await setupFeatureA(appContainer);           // registers bindings and resolves singletons
            return null;
        },
        // The component itself is also lazy — a second split point
        lazy: async () => {
            const {FeatureAPage} = await import('./feature-a/page');
            return {Component: FeatureAPage};
        },
    },
]);
```

Inside `FeatureAPage`, the service is ready:

```typescript
// feature-a/page.tsx  (also lazily loaded — same chunk as the setup)
import {appContainer} from '../app';
import {FeatureA_Service_DI} from './service';          // token is already in this chunk

export function FeatureAPage() {
    // Safe: loader guaranteed setupFeatureA() completed before this renders.
    const svc = appContainer.get(FeatureA_Service_DI);
    // ...
}
```

---

## Pattern 2 — HTTP first-request handler (Node.js)

For a Node.js server that handles multiple feature areas, defer loading a feature's bindings until
the first request for that area arrives:

```typescript
// server.ts
import http from 'http';
import {appContainer} from './app';

const setupCache = new Map<string, Promise<void>>();

function ensureFeature(name: string): Promise<void> {
    if (!setupCache.has(name)) {
        const p = name === 'feature-a'
            ? import('./feature-a/setup').then(m => m.setupFeatureA(appContainer))
            : Promise.reject(new Error(`Unknown feature: ${name}`));
        setupCache.set(name, p);
    }
    return setupCache.get(name)!;
}

http.createServer(async (req, res) => {
    if (req.url?.startsWith('/feature-a')) {
        await ensureFeature('feature-a');           // no-op after first request
        const {handleFeatureA} = await import('./feature-a/handler');
        return handleFeatureA(req, res, appContainer);
    }
    // ... other routes
}).listen(3000);
```

> **NOTE:**  
> The `setupCache` ensures setup runs exactly once regardless of concurrent first requests;
> subsequent requests pay no cost.

---

## Pattern 3 — Child containers for scoped modules

If a lazy feature needs its own isolated scope — singletons that shouldn't outlive the feature's
active lifetime, or that need to shadow a root binding — return a child container from the setup
function instead of registering into the root:

```typescript
// feature-b/setup.ts
import {Container} from 'async-injection';
import {FeatureB_Service_DI} from './tokens';

export async function loadFeatureB(root: Container): Promise<Container> {
    const {FeatureBService} = await import('./service');

    const child = new Container(root);              // inherits all root bindings
    child.bindClass(FeatureB_Service_DI, FeatureBService).asSingleton();
    await child.resolveSingletons(true);

    return child;                                   // caller uses child, not root
}
```

The caller holds the child container for as long as the feature is active, then discards it.
Singletons decorated with `@Release` clean up automatically:

```typescript
// In a route loader, modal controller, or scoped request handler:
let featureBContainer: Container | null = null;

async function onFeatureBEnter() {
    featureBContainer = await loadFeatureB(appContainer);
}

async function onFeatureBExit() {
    await featureBContainer?.releaseSingletons();
    featureBContainer = null;
}
```

> This maps naturally to Angular's concept of a feature module injector sitting below the root
> injector, with its own singleton scope.

---

## Choosing an approach

| Scenario | Recommended approach |
|---|---|
| Feature bindings can live in the root for the app's lifetime | Patterns 1 or 2 |
| Feature has its own singleton lifecycle or shadows a root binding | Pattern 3 — child container |
| Browser SPA with client-side routing | React Router `loader` / TanStack Router `beforeLoad` |
| Node.js server, Electron main process, or CLI | First-request handler with a setup cache |

In all cases the bundler split point is the `import()` inside the setup function.
The demand signal — when setup is actually called — comes from your application's routing or event
layer, not from `async-injection` itself.
