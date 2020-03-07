/**
 * Universal id that can be bound to a constant, class, or factories.
 */
export type InjectableId<T> = string | symbol | { new(...args: any[]): T };

/**
 * Retrieve instances previously bound to the specified InjectableId.
 */
export interface Injector {
	/**
	 * Check to see if the existing InjectableId is known (aka has been bound).
	 * Error callbacks may wish to know if a particular InjectableId is available.
	 * Also the Binder's bindXXX calls always overwrite any previous bindings, so you may want to use this as a gate.
	 */
	isIdKnown<T>(id: InjectableId<T>): boolean;

	/**
	 * Return an instance of <T> previously bound to 'id'.
	 * @throws Error if the InjectableId was never registered, OR if there are unresolved asynchronous dependencies in the dependency tree for 'id'.
	 */
	get<T>(id: InjectableId<T>): T;

	/**
	 * awaits the asynchronous resolution of all dependencies in the tree for 'id'.
	 */
	resolve<T>(id?: InjectableId<T>): Promise<T>;
}
