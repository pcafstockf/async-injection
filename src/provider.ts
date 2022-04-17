import {State} from './state';
import {InvokeReleaseMethod} from './utils';


/**
 * Internally all InjectableIds are mapped to an abstract Provider<T>.
 * A Provider may choose to return a singleton or a new value each time it is queried.
 */
export abstract class Provider<T = any> {
	protected constructor() {
	}

	/**
	 * If the provider is configured as a singleton, this property will be the state of that singleton.
	 * This value will be defined for resolved/resolving Singletons, null for Singletons that have not yet been queried, and will remain undefined for non-Singleton Providers.
	 * Default value is undefined (e.g. not a Singleton).
	 */
	protected singleton?: State<T>;

	/**
	 * This is the workhorse method of the Provider, and is invoked directly or indirectly by both Injector.get and Injector.resolve.
	 * This method returns the current State<T> if it is already known (which it might be for Singleton scenarios).
	 * Otherwise it resolves the State<T>.
	 * IF the Provider<T> is a Singleton, it's State<T> is updated before returning.
	 */
	abstract provideAsState(): State<T>;

	/**
	 * Base method to initialize the state of this Provider *if* (and only if) it has been configured as a Singleton.
	 * If this Provider has not been configured as a singleton, this method is essentially a noop that returns undefined.
	 *
	 * @param asyncOnly This default implementation ignores this parameter.
	 * @returns A completion Promise if initialization requires asynchronicity, otherwise the return value is undefined.
	 */
	resolveIfSingleton(asyncOnly: boolean): Promise<T> {   // eslint-disable-line @typescript-eslint/no-unused-vars
		if (this.singleton === null) {
			const s = this.provideAsState();
			if (s.pending)
				return s.promise;
			else if (s.rejected)
				return Promise.reject(s.rejected);
		}
		return undefined;
	}

	/**
	 * If (and only if) this Provider has been configured as a Singleton, and if it has been (or is being resolved), find and invoke the @Release decorated method (if there is one).
	 * NOTE that if the singleton is actively being resolved when this method is called, this method waits for the resolution to complete and then invokes the @Release decorated method; But in any case this is a synchronous method and returns immediately to it's caller.
	 * Also note that invoking this method does not release or invalidate the Provider;
	 * Rather, it resets a Singleton Provider to a fresh (unresolved/unqueried) state (aka sets this.singleton to null).
	 * It is assumed that the Singleton itself will no longer be used after this method returns.
	 */
	releaseIfSingleton(): void {
		if (this.singleton) {
			const s = this.provideAsState();
			if (s.pending) {
				s.promise.then((v) => {
					this.singleton = null;
					InvokeReleaseMethod(v);
				}).catch(() => {
					this.singleton = null;
				});
			}
			else {
				this.singleton = null;
				if ((!s.rejected) && s.fulfilled)
					InvokeReleaseMethod(s.fulfilled);
			}
		}
	}
}
