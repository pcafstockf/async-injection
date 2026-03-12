import {InjectableId, Injector} from './injector';

/**
 * Type definition for functions that return a value.
 * The function should return a valid value, but may throw an exception if it cannot.
 */
export type SyncFactory<T> = (injector: Injector) => T;

/**
 * Type definition for functions that return a Promise for a value.
 * The function *must* not throw and must return a valid Promise (e.g. pending, resolved, rejected).
 */
export type AsyncFactory<T> = (injector: Injector) => Promise<T>;

/**
 * You may bind an error handler which will be invoked if the bound InjectableId could not be put into service.
 * An error handler *must* not throw, but may return an Error that will be propagated back up the call chain.
 *
 * @param injector   The Injector that experienced the error.
 * @param id   The identifier for what was trying to be made.
 * @param maker   The thing that made (or tried to make) the value.  Will be one of type ClassConstructor, SyncFactory, or AsyncFactory, depending on how you registered the binding.
 * @param error   Identifies the problem that occurred.
 * @param value   If the 'maker' was able to create the thing, but it had an error during post construction, the made thing will be passed here.
 * @returns one of 3 results...
 * A substitute thing (kind of like a 'maker' do-over) which must be fully operational (e.g. any `@PostConstruct` will be ignored).
 * An alternate Error which will be propagated back up the call chain.
 * Undefined, which means the 'error' parameter will be propagated back up the call chain.
 */
export type OnErrorCallback<T, M = unknown> = (injector: Injector, id: InjectableId<T>, maker: M, error: unknown, value?: T) => T | Error | void;

/**
 * You may bind a success handler which will be invoked just before the bound InjectableId is put into service.
 * This is an alternative to the more preferred `@PostConstruct` decorator for scenarios when usage of that decorator is not feasible.
 * WARNING:
 * By registering a success handler, you override and nullify any `@PostConstruct` decorator on the class.
 * In such a scenario, the success handler should perform whatever care and feeding the class expected from the `@PostConstruct` decorator.
 * A success handler *must* not throw, but may return an Error that will be propagated back up the call chain.
 *
 * @param value   The thing that was made.
 * @param injector   The Injector that performed the construction.
 * @param id   The identifier for what was made.
 * @param maker   The thing that made.  Will be one of type ClassConstructor, SyncFactory, or AsyncFactory, depending on how you registered the binding.
 * @returns one of 3 results...
 * An Error which will be propagated back up the call chain.
 * Undefined, which means the object is ready to be placed into service.
 * A Promise that resolves to one of the above two values (undefined or Error).
 */
export type OnSuccessCallback<T, M = unknown> = (value: T, injector: Injector, id: InjectableId<T>, maker: M) => Promise<Error | void> | Error | void;

/**
 * An interface allowing binding of an error handler.
 *
 * @see OnErrorCallback
 */
export interface BindErrHandler<T, M = unknown> {
	onError(cb: OnErrorCallback<T, M>): void;
}

/**
 * An interface allowing binding of a post construction handler.
 *
 * @see OnSuccessCallback
 */
export interface BindHandler<T, M = unknown> extends BindErrHandler<T, M> {
	onSuccess(cb: OnSuccessCallback<T, M>): BindErrHandler<T, M>;
}

/**
 * @inheritDoc
 * This specialization also allows you to specify that the binding is 'Singleton' (e.g. only one in the system).
 */
export interface BindAs<T, M = unknown> extends BindHandler<T, M> {
	asSingleton(): BindHandler<T, M>;
}

