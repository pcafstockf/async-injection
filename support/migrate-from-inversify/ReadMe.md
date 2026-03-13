I created `async-injection` because I was using InversifyJS at the time, but after seeing asynchronous injection in NestJS, I realized it was a feature I could not live without.  
I was also working with Angular and felt it was a more TypeScript-friendly, API.

The files in this directory are provided as a useful starting point to assist you in migrating from Inversify.  
Migration is a deliberate two-phase process so that your codebase is never broken:

---

### Phase 1 — Adopt the `async-injection` API (Inversify still runs underneath)

The `Container` interface in `./di.ts` is a compatible subset of the `async-injection` `Container` interface.  
The `async-injection` decorators are a superset of the Inversify decorators; the only difference is that they follow Angular PascalCase naming.

Add these files to your project and then import from `index.ts`, instead of from Inversify package directly.  
Your code will then be calling an `async-injection`-compatible API, while Inversify still continues to do the actual work under the hood.

You can then migrate your application incrementally — or all at once — replacing Inversify calls and lowercase decorators with their `async-injection` equivalents throughout your codebase.

---

### Phase 2 — uninstall Inversify, install `async-injection`

Once your codebase imports only from `index.ts` and uses only `async-injection`-compatible
API calls, completing the migration is mechanical:

1. Remove Inversify from `package.json` and install `async-injection`.
2. Delete the migration files in this directory.
3. Search and replace every import of `index.ts` with an import of `async-injection`.

> **One thing to check before Phase 2:**  
> `isBound` exists in the shim for Inversify compatibility but has no equivalent on the real
> `async-injection` `Container`. Replace any remaining `isBound` calls with `has` (or
> `isIdKnown` if you need the `ascending` option) before dropping the shim.
