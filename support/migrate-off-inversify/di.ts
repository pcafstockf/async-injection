/**
 * Standard definition of a constructor.
 */
export type ClassConstructor<T> = new (...args: any[]) => T;

/**
 * Universal id that can be associated with a constant, class, or factory.
 */
export type InjectableId<T> = (symbol & T) | symbol;

/**
 * A Dependency Injection Container interface that is compatible with async-injection/Container
 */
export interface Container {

	/**
	 * Check to see if the existing InjectableId is known (e.g. has been bound).
	 * NOTE: The bindXXX calls always overwrite any previous bindings, so you may want to use this as a gate.
	 *
	 * @param id    The id to check for.
	 */
	isBound<T>(id: InjectableId<T>): boolean;

	/**
	 * Return an instance of <T> previously bound to 'id'.
	 * Type inference from a typed "Symbol" allows you to skip explicit typing.
	 *
	 * @throws Error if the InjectableId was never registered, OR if there are unresolved dependencies in the dependency tree for 'id'.
	 */
	get<T>(id: InjectableId<T>): T;

	/**
	 * Bind an InjectableId to a constant value.
	 * Constants are by their very nature singleton.
	 */
	bindConstant<T>(id: InjectableId<T>, value: T): void;

	/**
	 * Bind an InjectableId to a class (actually it's constructor).
	 */
	bindClass<T>(id: InjectableId<T>, constructor: ClassConstructor<T>): BindAs<T, ClassConstructor<T>>;

	/**
	 * Bind an InjectableId to a synchronous factory that will be invoked on demand whenever the object is needed.
	 * The factory should produce the needed value each time it is called.
	 * If you chain a BindAs.asSingleton to this method, the factory will only be called once to produce the singleton.
	 */
	bindFactory<T>(id: InjectableId<T>, factory: SyncFactory<T>): BindAs<T, SyncFactory<T>>;

	/**
	 * This should be a highly unusual invocation.  But in case you require it...
	 *
	 * @param id    The id to be removed.
	 */
	unbind<T>(id: InjectableId<T>): void;
}

/**
 * Allows you to specify that the binding is 'Singleton' (e.g. only one in the system).
 */
export interface BindAs<T, M> {
	asSingleton(): void;
}

/**
 * Type definition for functions that return a value.
 * The function should return a valid value, but may throw an exception if it cannot.
 */
export type SyncFactory<T> = (di: Container) => T;
