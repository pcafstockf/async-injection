/*
Inversify thinks a Promise should not be injectable (! async-injection).
Luckily there is a choke point in the InversifyJS code that we can patch.
The monkey patch below tail patches the two choke points that check if the object is a Promise.
If a FastifyInstance, FastifyRequest, or FastifyReply is found, this patch lies and tells Inversify that it is *not* a Promise.
This allows all the normal Fastify misbehavior that everyone else expects, but works around lame async-injection hackon in InversifyJS.
*/
const inversifyasync = require('inversify/lib/utils/async');

function useDefaultInversifyPromiseHandling(obj: any): boolean {
	//TODO: If you have promises for which you want the default InversifyJS behavior, test for them here and return true.
	return false;
}
const oldIPromise = inversifyasync.isPromise;
const oldIContainsPromise = inversifyasync.isPromiseOrContainsPromise;
inversifyasync.isPromise = function (object: any) {
	if (oldIPromise(object))
		return useDefaultInversifyPromiseHandling(object);
	return false;
} as any;
inversifyasync.isPromiseOrContainsPromise = function (object: any) {
	if (oldIContainsPromise(object))
		return useDefaultInversifyPromiseHandling(object);
	return false;
} as any;
import {Container as InversifyContainer, inject as Inject, injectable as Injectable, interfaces, optional as Optional, postConstruct as PostConstruct, preDestroy as Release} from 'inversify';
import 'reflect-metadata';
import {BindAs, ClassConstructor, Container, InjectableId, SyncFactory} from './di';

/**
 * @inheritDoc
 * This specialization allows us to map our generic DI Container over the top of InversifyJS.
 * If an application has a hard dependency on InversifyJS *or* if it needs a feature our generic Container does not provide, they can still make the InversifyJS call.
 */
export class InversifyContainerAdapter extends InversifyContainer implements Container {
	constructor(containerOptions?: interfaces.ContainerOptions) {
		super(containerOptions);
		this.idToSingletonMap = new Map<symbol | string, () => void>();
	}

	// @see InversifyContainerAdapter.bindFactory
	private idToSingletonMap: Map<symbol | string, () => void>;

	/**
	 * @inheritDoc
	 */
	isBound<T>(id: InjectableId<T>): boolean {
		return super.isBound(id as symbol | string);
	}


	/**
	 * @inheritDoc
	 */
	// @ts-ignore
	get<T>(id: InjectableId<T>): T {
		return super.get(id as (symbol | string));
	}

	/**
	 * @inheritDoc
	 */
	bindConstant<T>(id: InjectableId<T>, value: T): void {
		this.bind(id as symbol | string).toConstantValue(value);
	}

	/**
	 * @inheritDoc
	 */
	bindClass<T>(id: InjectableId<T>, constructor: ClassConstructor<T>): BindAs<T, ClassConstructor<T>> {
		const chain = this.bind(id as symbol | string).to(constructor);
		return {
			asSingleton: () => {
				chain.inSingletonScope();
			}
		};
	}

	/**
	 * @inheritDoc
	 * In InversifyJS, a provider is always async, and a factory is always a function that the caller has to then invoke.
	 * We need to "provide" a *value* (synchronously) whenever container.getById is invoked.
	 */
	bindFactory<T>(id: InjectableId<T>, factory: SyncFactory<T>): BindAs<T, SyncFactory<T>> {
		let singletonState = 0;
		let singleton: T = undefined as T;
		// Inversify defines Factory as singleton by default, so we set to transient (aka dynamic value) and manage it ourselves.
		// noinspection GrazieInspection
		this.bind(id as symbol | string).toDynamicValue((context: interfaces.Context) => {
			// Only way for this state is if we have already invoked the factory at least once.
			if (singletonState === -1)
				return singleton;
			// Either way, we need a new "thing".
			let retVal = factory(context.container as any);
			// If the 'asSingleton' chain was called, initialize our internal singleton instance and transition the state so that we never create another.
			if (singletonState === 1) {
				singleton = retVal;
				singletonState = -1;
				// Because these are outside our closure, they will leak in unbind is called.
				// This allows us to release them.
				this.idToSingletonMap.set(id as symbol | string, () => {
					singleton = undefined as T;
					singletonState = undefined as any;
				});
			}
			return retVal;
		});
		return {
			asSingleton: () => {
				singletonState = 1;
			}
		};
	}

	/**
	 * @inheritDoc
	 */
	unbind<T>(id: InjectableId<T>): void {
		super.unbind(id as symbol | string);
		// Ensure we do not leak singleton factories.
		const fn = this.idToSingletonMap.get(id as symbol | string);
		if (fn) {
			this.idToSingletonMap.delete(id as symbol | string);
			fn();
		}
	}
}

/* istanbul ignore next */
export {Inject, Injectable, Optional, PostConstruct, Release};
