import 'reflect-metadata';
import {AbstractConstructor, InjectableId, Injector, ClassConstructor} from './injector';
import {AsyncFactory, BindAs, Binder, SyncFactory} from './binder';
import {INJECTABLE_METADATA_KEY} from './constants';
import {State} from './state';
import {Provider} from './provider';
import {ConstantProvider} from './constant-provider';
import {FactoryBasedProvider} from './sync-factory-provider';
import {AsyncFactoryBasedProvider} from './async-factory-provider';
import {ClassBasedProvider} from './class-provider';

/**
 * Helper class to ensure we can distinguish between Error instances legitimately returned from Providers, and Errors thrown by Providers.
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
		let provider = this.providers.get(id);
		if (!provider) {
			if (this.parent)
				return this.parent.get<T>(id);
			throw new Error('Symbol not bound: ' + id.toString());
		}
		let state = provider.provideAsState();
		if (state.pending)
			throw new Error('Synchronous request on unresolved asynchronous dependency tree: ' + id.toString());
		if (state.rejected)
			throw state.rejected;
		return state.fulfilled;
	}

	/**
	 * @inheritDoc
	 */
	public resolve<T>(id: InjectableId<T>): Promise<T> {
		let state = this.resolveState(id);
		if (state.promise) {
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
	 * @param id    The id to be removed.
	 * @param ascending  If true, this will remove all bindings of the specified id all the way up the parent container chain (if it exists).
	 */
	public removeBinding<T>(id: InjectableId<T>, ascending?: boolean): void {
		this.providers.delete(id);
		if (ascending && this.parent && (<any>this.parent).removeBinding)
			(<any>this.parent).removeBinding(id, true);
	}

	/**
	 * @inheritDoc
	 */
	public bindConstant<T>(id: InjectableId<T>, value: T): void {
		this.providers.set(id, new ConstantProvider(value));
	}

	/**
	 * @inheritDoc
	 */
	public bindClass<T>(id: ClassConstructor<T>, constructor?: ClassConstructor<T>): BindAs<T, ClassConstructor<T>>;
	public bindClass<T>(id: string | symbol | AbstractConstructor<T>, constructor: ClassConstructor<T>): BindAs<T, ClassConstructor<T>>;
	public bindClass<T>(id: string | symbol | AbstractConstructor<T> | ClassConstructor<T>, constructor: ClassConstructor<T>): BindAs<T, ClassConstructor<T>> {
		if (typeof constructor === 'undefined') {
			constructor = <{ new(...args: any[]): T }>id;
		}
		if (!Reflect.getMetadata(INJECTABLE_METADATA_KEY, constructor)) {
			throw new Error('Class not decorated with @Injectable [' + constructor.toString() + ']');
		}
		let provider = new ClassBasedProvider(this, id, constructor, (i: InjectableId<any>) => {
			return this.resolveState(i);
		});
		this.providers.set(id, provider);
		return provider.makeBindAs();
	}

	/**
	 * @inheritDoc
	 */
	public bindFactory<T>(id: InjectableId<T>, factory: SyncFactory<T>): BindAs<T, SyncFactory<T>> {
		let provider = new FactoryBasedProvider(this, id, factory);
		this.providers.set(id, provider);
		return provider.makeBindAs();
	}

	/**
	 * @inheritDoc
	 */
	public bindAsyncFactory<T>(id: InjectableId<T>, factory: AsyncFactory<T>): BindAs<T, AsyncFactory<T>> {
		let provider = new AsyncFactoryBasedProvider(this, id, factory);
		this.providers.set(id, provider);
		return provider.makeBindAs();
	}

	/**
	 * @inheritDoc
	 */
	public resolveSingletons(asyncOnly?: boolean, parentRecursion?: boolean): Promise<void> {
		let makePromiseToResolve = () => {
			return new Promise<void>((resolve, reject) => {
				let pending = new Map<InjectableId<any>, Promise<void>>();
				// Ask each provider to resolve itself *IF* it is a singleton.
				this.providers.forEach((value: Provider, key: InjectableId<any>) => {
					// If the provider is a singleton *and* if resolution is being handled asynchronously, the provider will return a completion promise.
					let p = value.resolveIfSingleton(asyncOnly);
					if (p)
						pending.set(key, p);
				});
				// The contract for this method is that it behaves somewhat like Promise.allSettled (e.g. won't complete until all pending Singletons have settled).
				// Further the contract states that if any of the asynchronous Singletons rejected, that we will also return a rejected Promise, and that the rejection reason will be a Map of the InjectableId's that did not resolve, and the Error they emitted.
				let pp = Array.from(pending.values());
				let keys = Array.from(pending.keys());
				// Mapping the catch is an alternate version of Promise.allSettled (e.g. keeps Promise.all from short-circuiting).
				Promise.all(pp.map(p => p.catch(e => new ReasonWrapper(e)))).then((results) => {
					let rejects = new Map<InjectableId<any>, Error>();
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
		if (parentRecursion && this.parent && (<Binder>(<any>this.parent)).resolveSingletons) {
			let pb: Binder = <any>this.parent;
			return pb.resolveSingletons(asyncOnly, parentRecursion).then(() => {
				return makePromiseToResolve();
			});
		}
		return makePromiseToResolve();
	}

	/**
	 * As implied by the name prefix, this is a factored out method invoked only by the 'resolve' method.
	 * It makes searching our parent (if it exists) easier (and quicker) IF our parent is a fellow instance of Container.
	 */
	protected resolveState<T>(id: InjectableId<T>): State<T> {
		let provider = this.providers.get(id);
		if (!provider) {
			if (this.parent) {
				if (this.parent instanceof Container) {
					return this.parent.resolveState<T>(id);
				}
				// This code (below) will only ever execute if the creator of this container passes in their own implementation of an Injector.
				try {
					return State.MakeState<T>(this.parent.resolve<T>(id), undefined, undefined);
				}
				catch (err) {
					return State.MakeState<T>(null, err);
				}
			}
			return State.MakeState<T>(null, new Error('Symbol not bound: ' + id.toString()));
		}
		return provider.provideAsState();
	}
}
