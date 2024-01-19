import {AsyncFactoryBasedProvider} from './async-factory-provider.js';
import {BindableProvider} from './bindable-provider.js';
import {AsyncFactory, BindAs, Binder, SyncFactory} from './binder.js';
import {ClassBasedProvider} from './class-provider.js';
import {ConstantProvider} from './constant-provider.js';
import {INJECTABLE_METADATA_KEY} from './constants.js';
import {AbstractConstructor, ClassConstructor, InjectableId, Injector} from './injector.js';
import {Provider} from './provider.js';
import {State} from './state.js';
import {FactoryBasedProvider} from './sync-factory-provider.js';
import {isPromise} from './utils.js';

/**
 * Helper class to ensure we can distinguish between Error instances legitimately returned from Providers, and Errors thrown by Providers.
 *
 * @see resolveSingletons.
 */
class ReasonWrapper {
	constructor(public reason: any) {
	}
}

/**
 * Binder and Injector (aka Container) to handle (a)synchronous dependency management.
 */
export class Container implements Binder {

	/**
	 * Create a new Container, with an optional parent Injector which will be searched if any given InjectableId is not bound within this Container.
	 */
	public constructor(protected parent?: Injector) {
	}

	protected providers = new Map<InjectableId<any>, Provider>();

	/**
	 * @inheritDoc
	 */
	public isIdKnown<T>(id: InjectableId<T>, ascending?: boolean): boolean {
		if (!!this.providers.get(id))
			return true;
		if (ascending && this.parent)
			return this.parent.isIdKnown(id, true);
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public get<T>(id: InjectableId<T>): T {
		const provider = this.providers.get(id);
		if (!provider) {
			if (this.parent)
				return this.parent.get<T>(id);
			throw new Error('Symbol not bound: ' + id.toString());
		}
		const state = provider.provideAsState();
		if (state.pending)
			throw new Error('Synchronous request on unresolved asynchronous dependency tree: ' + id.toString());
		if (state.rejected)
			throw state.rejected;
		return state.fulfilled as T;
	}

	/**
	 * @inheritDoc
	 */
	public resolve<T>(id: InjectableId<T>): Promise<T> {
		const state = this.resolveState(id);
		if (isPromise(state.promise)) {
			return state.promise;
		}

		if (state.rejected) {
			return Promise.reject(state.rejected);
		}

		return Promise.resolve(state.fulfilled);
	}

	// noinspection JSUnusedGlobalSymbols
	/**
	 * This method is not part of the Binding interface, because it is highly unusual.
	 * But that doesn't mean we can't imagine scenarios where you might require it.
	 *
	 * @param id    The id to be removed.
	 * @param ascending  If true, this will remove all bindings of the specified id all the way up the parent container chain (if it exists).
	 * @param releaseIfSingleton  If true, @Provider.releaseIfSingleton will be invoked before the binding is removed.
	 */
	public removeBinding<T>(id: InjectableId<T>, ascending?: boolean, releaseIfSingleton?: boolean): void {
		if (releaseIfSingleton) {
			const p = this.providers.get(id);
			if (p)
				p.releaseIfSingleton();
		}
		this.providers.delete(id);

		if (ascending && this.parent) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
			(this.parent as any)?.removeBinding(id, true, releaseIfSingleton);
		}
	}

	/**
	 * @inheritDoc
	 */
	public bindConstant<T>(id: InjectableId<T>, value: T): T {
		this.providers.set(id, new ConstantProvider(value));
		return value;
	}

	/**
	 * @inheritDoc
	 */
	public bindClass<T>(id: ClassConstructor<T>, constructor?: ClassConstructor<T>): BindAs<T, ClassConstructor<T>>;
	public bindClass<T>(id: string | symbol | AbstractConstructor<T> | InjectableId<T>, constructor: ClassConstructor<T>): BindAs<T, ClassConstructor<T>>;
	public bindClass<T>(id: string | symbol | AbstractConstructor<T> | ClassConstructor<T>, constructor: ClassConstructor<T>): BindAs<T, ClassConstructor<T>> {
		if (typeof constructor === 'undefined') {
			constructor = id as new (...args: any[]) => T;
		}
		if (!Reflect.getMetadata(INJECTABLE_METADATA_KEY, constructor)) {
			throw new Error('Class not decorated with @Injectable [' + constructor.toString() + ']');
		}
		/* eslint-disable @typescript-eslint/no-unsafe-argument */
		const provider = new ClassBasedProvider(this as any, id, constructor);
		this.providers.set(id, provider);
		return provider.makeBindAs();
	}

	/**
	 * @inheritDoc
	 */
	public bindFactory<T>(id: InjectableId<T>, factory: SyncFactory<T>): BindAs<T, SyncFactory<T>> {
		const provider = new FactoryBasedProvider(this, id, factory);
		this.providers.set(id, provider);
		return provider.makeBindAs();
	}

	/**
	 * @inheritDoc
	 */
	public bindAsyncFactory<T>(id: InjectableId<T>, factory: AsyncFactory<T>): BindAs<T, AsyncFactory<T>> {
		const provider = new AsyncFactoryBasedProvider(this, id, factory);
		this.providers.set(id, provider);
		return provider.makeBindAs();
	}

	/**
	 * @inheritDoc
	 */
	public resolveSingletons(asyncOnly?: boolean, parentRecursion?: boolean): Promise<this> {
		const makePromiseToResolve = () => {
			return new Promise<void>((resolve, reject) => {
				const pending = new Map<InjectableId<any>, Promise<void>>();
				// Ask each provider to resolve itself *IF* it is a singleton.
				this.providers.forEach((value: Provider, key: InjectableId<any>) => {
					// If the provider is a singleton *and* if resolution is being handled asynchronously, the provider will return a completion promise.
					const p = value.resolveIfSingleton(asyncOnly);
					if (p !== null && typeof p !== 'undefined')
						pending.set(key, p);
				});
				// The contract for this method is that it behaves somewhat like Promise.allSettled (e.g. won't complete until all pending Singletons have settled).
				// Further the contract states that if any of the asynchronous Singletons rejected, that we will also return a rejected Promise, and that the rejection reason will be a Map of the InjectableId's that did not resolve, and the Error they emitted.
				const pp = Array.from(pending.values());
				const keys = Array.from(pending.keys());
				// Mapping the catch is an alternate version of Promise.allSettled (e.g. keeps Promise.all from short-circuiting).
				Promise.all(pp
					.map(p => p.catch(e => new ReasonWrapper(e))))
					.then((results) => {
						const rejects = new Map<InjectableId<any>, Error>();
						// Check the results.  Since we don't export ReasonWrapper, it is safe to assume that an instance of that was produced by our map => catch code above, so it's a rejected Singleton error.
						results.forEach((result, idx) => {
							if (result instanceof ReasonWrapper) {
								rejects.set(keys[idx], result.reason);
							}
						});
						// If we had rejections, notify our caller what they were.
						if (rejects.size > 0)
							reject(rejects);
						else
							resolve();  // All good.
					});
			});
		};
		if (parentRecursion && typeof (this.parent as Binder)?.resolveSingletons === 'function') {
			const pb: Binder = this.parent as Binder;
			return pb.resolveSingletons(asyncOnly, parentRecursion).then(() => {
				return makePromiseToResolve().then(() => this);
			});
		}
		return makePromiseToResolve().then(() => this);
	}

	/**
	 * As implied by the name prefix, this is a factored out method invoked only by the 'resolve' method.
	 * It makes searching our parent (if it exists) easier (and quicker) IF our parent is a fellow instance of Container.
	 */
	protected resolveState<T>(id: InjectableId<T>): State<T> {
		const provider = this.providers.get(id);
		if (!provider) {
			if (this.parent) {
				if (this.parent instanceof Container) {
					return this.parent.resolveState<T>(id);
				}
				// This code (below) will only ever execute if the creator of this container passes in their own implementation of an Injector.
				/* istanbul ignore next  */
				try {
					return State.MakeState<T>(this.parent.resolve<T>(id), undefined, undefined);
				}
				catch (err) {
					return State.MakeState<T>(null, err);
				}
			}
			return State.MakeState<T>(null, new Error('Symbol not bound: ' + id.toString()));
		}
		return provider.provideAsState() as State<T>;
	}

	// noinspection JSUnusedGlobalSymbols
	/**
	 * Convenience method to assist in releasing non-garbage-collectable resources that Singletons in this Container may have allocated.
	 * It will walk through all registered Providers (of this Container only), and invoke their @see Provider.releaseIfSingleton method.
	 * This method is not part of the Binding interface, because you normally only create (and release) Containers.
	 * NOTE:
	 * This *only* releases active/pending Singleton's that have already been created by this Container.
	 * The most likely use of this method would be when you have created a new child Container for a limited duration transaction, and you want to easily cleanup temporary resources.
	 * For example, your service object may need to know when it should unsubscribe from an RxJs stream (failure to do so can result in your Singleton not being garbage collected at the end of a transaction).
	 * In theory, you could handle all unsubscription and cleanup yourself, but the @Release decorator and this method are meant to simply make that easier.
	 */
	public releaseSingletons(): void {
		this.providers.forEach((value: Provider) => {
			value.releaseIfSingleton();
		});
	}

	/**
	 * Make a copy of this @see Container.
	 * This is an experimental feature!
	 * I have not thought through all the dark corners, so use at your own peril!
	 * Here are some notes:
	 *  The injector parameter for SyncFactory and AsyncFactory callbacks will be the Container invoking the factory.
	 *      So a factory that uses a parent closure instead of the supplied injector may get unexpected results.
	 *  The injector parameter for OnSuccess and OnError callbacks will be the Container performing the resolution.
	 *  Singletons are cloned at their *existing* state..
	 *      If resolved in "this" container, they will not be re-resolved for the clone.
	 *      If released by the clone, they will be considered released by "this" container.
	 *      If a singleton is currently being asynchronously constructed any callbacks will reference "this" Container, however both Containers should have no problem awaiting resolution.
	 *      If a singleton is not resolved when the container is cloned, then if both containers resolve, you will create *two* "singletons".
	 *      The way to avoid this last effect is to @see resolveSingletons
	 */
	clone(clazz?: ClassConstructor<Container>): Container {
		if (!clazz)
			clazz = Container;
		const retVal = new clazz(this.parent);
		this.providers.forEach((v, k) => {
			if (v instanceof BindableProvider) {
				v = Object.assign(Object.create(Object.getPrototypeOf(v)), v);
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				(v as any).injector = retVal;
			}
			retVal.providers.set(k, v);
		});
		return retVal;
	}
}
