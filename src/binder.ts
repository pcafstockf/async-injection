import {ClassConstructor, InjectableId, Injector, AbstractConstructor} from './injector';

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
 * You may bind an error handler which will be invoked, if the bound InjectableId could not be put into service.
 * An error handler *must* not throw, but may return an Error that will be propagated back up the call chain.
 *
 * @param binder   The Binder that experienced the error.
 * @param id   The identifier for what was trying to be made.
 * @param maker   The thing that made (or tried to provideAsState).  Will be one of type ClassConstructor, SyncFactory, or AsyncFactory, depending on how you registered the binding.
 * @param error   Identifies the problem that occurred.
 * @param value   If the 'maker' was able to create the thing, but it had an error during post construction, the made thing will be passed here.
 * @returns one of 3 results...
 *      A substitute thing (kind of like a 'maker' do-over) which must be fully operational (e.g. any @PostConstruct will be ignored).
 *      An alternate Error which will be propagated back up the call chain.
 *      Undefined, which means the 'error' parameter will be propagated back up the call chain.
 */
export type OnErrorCallback<T, M> = (injector: Injector, id: InjectableId<T>, maker: M, error: Error, value?: T) => T | Error | void;

/**
 * An interface allowing binding of an error handler.
 * @see OnErrorCallback
 */
export interface BindErrHandler<T, M> {
	onError(cb: OnErrorCallback<T, M>): void;
}

/**
 * @inheritDoc
 * This specialization also allows you to specify that the binding is 'Singleton' (e.g. only one in the system).
 */
export interface BindAs<T, M> extends BindErrHandler<T, M> {
	asSingleton(): BindErrHandler<T, M>;
}

/**
 * Bind Ids to producers.
 */
export interface Binder extends Injector {

	/**
	 * Bind an InjectableId to a constant value.
	 * Constants are by their very nature singleton, and are assumed to be error proof.
	 */
	bindConstant<T>(id: InjectableId<T>, value: T): void;

	/**
	 * Bind an InjectableId to a class (actually it's constructor).
	 * As a shortcut, you may use the class constructor as the 'id' (e.g. container.bindClass(A); ).
	 * The container will also invoke any @PostConstruct present on the class.
	 */
	bindClass<T>(id: ClassConstructor<T>, constructor?: ClassConstructor<T>): BindAs<T, ClassConstructor<T>>;
	bindClass<T>(id: string | symbol | AbstractConstructor<T>, constructor: ClassConstructor<T>): BindAs<T, ClassConstructor<T>>;

	/**
	 * Bind an InjectableId to a synchronous factory that will be invoked on demand when the object is needed.
	 * The factory should produce the needed value
	 * NOTE:  The container will not invoke any @PostConstruct present on the class, this is the responsibility of the factory.
	 */
	bindFactory<T>(id: InjectableId<T>, factory: SyncFactory<T>): BindAs<T, SyncFactory<T>>;

	/**
	 * Bind an InjectableId to an asynchronous factory that will be invoked on demand when the object is needed.
	 * The factory should produce the needed value (asynchronously of course).
	 * NOTE:  The container will not invoke any @PostConstruct present on the class, this is the responsibility of the factory.
	 * WARNING!!! The factory may not throw and must return a valid Promise (which can be pending, resolved, rejected, etc.).
	 */
	bindAsyncFactory<T>(id: InjectableId<T>, factory: AsyncFactory<T>): BindAs<T, AsyncFactory<T>>;

	/**
	 * This essentially pre creates/loads all *singleton* InjectableIds currently known to the Binder.
	 * This *may* be helpful if you wish to use Injector.get on a dependency tree that has asynchronous singletons within the tree.
	 *
	 * @param asyncOnly     Only resolve AsyncFactorys as well as any bound classes that have an asynchronous @PostConstruct decorator.  WARNING: If true, SyncFactorys will *not* be resolved even if they are Singletons.
	 * @param parentRecursion   If true and the the container has a parent, resolveIfSingleton will first be called for the parent
	 * @returns A Promise that resolves when all Singleton's have been resolved, OR rejects if one or more of the Singleton's failed to resolve.  NOTE: Rejection does not occur until all Singleton resolutions have settled, and the rejection reason/err will be a Map<InjectableId, Error>
	 */
	resolveSingletons(asyncOnly?: boolean, parentRecursion?: boolean): Promise<void>;
}
