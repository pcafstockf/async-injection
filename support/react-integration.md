# React Integration with async-injection

React applications depend on services just as much as any server-side application — HTTP clients,
authentication managers, feature flags, WebSocket connections, analytics.  
The question is not whether to manage them, but how.  
Without a deliberate approach, the typical answers are module-level singletons (hidden globals that are hard to test and impossible to swap), prop-drilling, or a proliferation of individual React contexts — one per service.

A single DI container threaded through the component tree via React context consolidates all of that into one place, with proper lifetime management, straightforward testability, and the ability to scope services to a subtree of the UI.

> **NOTE**  
> The files in this directory are not built as part of this project.  
> They are provided as illustrative starting points for common integration patterns.

---

## The provider and hook

Two small pieces of glue are all that is needed: a context provider that makes the container
available to the tree, and a hook that retrieves it.

```tsx
// di/react.tsx
import {createContext, useContext, type ReactNode} from 'react';
import type {Container} from 'async-injection';

const DIContext = createContext<Container | null>(null);

interface DIProviderProps {
    container: Container;
    children: ReactNode;
}

/**
 * Wraps a component subtree with a DI container.
 * Nest a second DIProvider inside the tree to create a scoped child container
 * for a feature or route section (see "Scoped child containers" below).
 */
export function DIProvider({container, children}: DIProviderProps) {
    return <DIContext.Provider value={container}>{children}</DIContext.Provider>;
}

/**
 * Returns the nearest DI container from context.
 * Use this to retrieve services inside a component or custom hook.
 */
export function useDIContainer(): Container {
    const container = useContext(DIContext);
    if (!container)
        throw new Error('useDIContainer must be used within a <DIProvider>.');
    return container;
}
```

> **TIP:**  
> Wrap the `useDIContainer` call in a typed helper hook per service to keep components clean and
> free of import noise:
> ```tsx
> export function useAuthService(): AuthService {
>     return useDIContainer().get(AuthService_DI);
> }
> ```

---

## Root container setup

The container should be created and fully configured before the React tree renders.  
An `async` setup function keeps this out of module scope, making the container easy to replace in tests, Storybook, or server-side rendering environments.

```typescript
// di/setup.ts
import {Container} from 'async-injection';
import {AuthService, AuthService_DI} from './auth/auth-service';
import {ApiClient, ApiClient_DI} from './api/api-client';

export async function setupContainer(): Promise<Container> {
    const container = new Container();

    container.bindClass(AuthService_DI, AuthService).asSingleton();

    // Async singleton: initialization completes before any component renders.
    container.bindAsyncFactory(ApiClient_DI, async () => {
        const config = await loadRemoteConfig();
        return new ApiClient(config.baseUrl);
    }).asSingleton();

    // Settle all async singletons before handing the container to React.
    await container.resolveSingletons(true);
    return container;
}
```

Wire it into your app entry point:

```tsx
// App.tsx
import {useEffect, useState} from 'react';
import {DIProvider} from './di/react';
import {setupContainer} from './di/setup';

export function App() {
    const [container, setContainer] = useState<Container | null>(null);

    useEffect(() => {
        setupContainer().then(setContainer);
    }, []);

    if (!container)
        return <LoadingScreen/>;

    return (
        <DIProvider container={container}>
            <Router/>
        </DIProvider>
    );
}
```

> **NOTE:**  
> Calling `resolveSingletons(true)` before rendering means every async singleton is fully initialized by the time any component calls `container.get()`.  
> Components never need to handle a "service not yet ready" state for root-level singletons.

---

## Consuming services correctly

`useDIContainer` returns a stable container reference — it does **not** cause re-renders when service state changes.  
This is the correct mental model: the container provides *access* to services; reactive data flows through normal React mechanisms (state, context values, or a reactive library).

```tsx
// Good: get the service once, use its reactive output via useState/useEffect
function UserProfile() {
    const auth = useDIContainer().get(AuthService_DI);
    const [user, setUser] = useState(() => auth.currentUser);

    useEffect(() => {
        return auth.onUserChanged(setUser);   // subscribe; cleanup on unmount
    }, [auth]);

    return <div>{user.name}</div>;
}
```

```tsx
// Avoid: do not read service output directly in render without a reactive wrapper
function UserProfile() {
    const auth = useDIContainer().get(AuthService_DI);
    return <div>{auth.currentUser.name}</div>;   // will not re-render when user changes
}
```

> **TIP:**  
> The cleanest pattern is to write a dedicated hook per service that encapsulates the subscription logic.  
> Components then call `useCurrentUser()` rather than reaching into the container directly, keeping them ignorant of the DI layer entirely.

---

## Scoped child containers

Some parts of a UI have their own service lifetime: a multi-step checkout flow, a document editor, a chat panel.  
Services for these features should not live in the root container for the full lifetime of the app — they should be created when the feature mounts and released when it unmounts.

A child container inherits all root bindings and adds its own on top.  
Nesting a second `DIProvider` exposes the child to that subtree:

```tsx
// checkout/CheckoutFlow.tsx
import {useState, useEffect} from 'react';
import {DIProvider, useDIContainer} from '../di/react';
import {CheckoutSession, CheckoutSession_DI} from './checkout-session';

export function CheckoutFlow() {
    const root = useDIContainer();
    const [child, setChild] = useState<Container | null>(null);

    useEffect(() => {
        // Create a child container scoped to this component's lifetime.
        const c = root.createChildContainer();
        c.bindClass(CheckoutSession_DI, CheckoutSession).asSingleton();
        c.resolveSingletons(true).then(() => setChild(c));

        // Release scoped singletons when the component unmounts.
        return () => { c.releaseSingletons(); };
    }, [root]);

    if (!child) return <LoadingSpinner/>;

    return (
        <DIProvider container={child}>
            <CheckoutSteps/>
        </DIProvider>
    );
}
```

Components inside `<CheckoutSteps>` call `useDIContainer()` normally and receive the child container.  
They are unaware of the scoping — `CheckoutFlow` manages it entirely.  
Components outside `<CheckoutFlow>` are unaffected; their `useDIContainer()` calls still reach the root.

> **TIP:**  
> Decorate scoped singletons with `@Release` to run cleanup logic (close connections, flush buffers) automatically when `releaseSingletons()` is called on the child container.

The scoped child container pattern pairs naturally with bundler code-splitting: the feature's services and their implementations can live in a lazily-loaded chunk that is only fetched when the route or component first mounts.  
See [lazy-loading.md](./lazy-loading.md) for setup function patterns that work with React Router and other demand signals.

---

## Testing

Because the container is passed in via `DIProvider` rather than imported as a global, replacing services in tests requires no mocking framework — just bind a different implementation:

```tsx
// checkout/CheckoutFlow.test.tsx
function renderWithDI(ui: ReactNode, overrides?: (c: Container) => void) {
    const container = new Container();
    setupContainer(container);       // your real bindings
    overrides?.(container);          // test-specific overrides
    return render(<DIProvider container={container}>{ui}</DIProvider>);
}

it('shows an error when payment fails', async () => {
    renderWithDI(<CheckoutFlow/>, c => {
        c.bindClass(PaymentService_DI, FailingPaymentServiceStub);
    });
    // ...assertions
});
```

---

## Best practices summary

| Practice | Why |
|---|---|
| Create the container in a `setupContainer()` function, not at module scope | Keeps it testable and environment-agnostic |
| Call `resolveSingletons(true)` before rendering | Guarantees no component races with async initialization |
| Access service *state* via React hooks, not direct property reads | Container references are stable; React re-renders require state |
| Wrap per-service access in typed helper hooks | Keeps components decoupled from the DI layer |
| Use child containers + nested `DIProvider` for feature-scoped services | Mirrors the natural lifetime of the UI feature; cleans up automatically |
| Bind test stubs directly in the container for unit/integration tests | No mocking framework needed; same DI path as production code |
