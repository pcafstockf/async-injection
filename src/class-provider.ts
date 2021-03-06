import { BindableProvider } from './bindable-provider';
import { POSTCONSTRUCT_ASYNC_METADATA_KEY, POSTCONSTRUCT_SYNC_METADATA_KEY, REFLECT_PARAMS } from './constants';
import { _getInjectedIdAt, _getOptionalDefaultAt } from './decorators';
import { ClassConstructor, InjectableId, Injector } from './injector';
import { State } from './state';
import { isPromise } from './utils';

export type ResolveStateCallback = (id: InjectableId<any>) => State;

/**
 * @inheritDoc
 * This specialization invokes it's configured class constructor synchronously and then scans for (and invokes) any @PostConstruct (which may be synchronous or asynchronous).
 */
export class ClassBasedProvider<T> extends BindableProvider<T, ClassConstructor<T>> {
	constructor(injector: Injector, id: InjectableId<T>, maker: ClassConstructor<T>, protected stateResolver: ResolveStateCallback) {
		super(injector, id, maker);
	}

	/**
	 * @inheritDoc
	 * @see the class description for this Provider.
	 * This method is just a singleton guard, the real work is done by provideAsStateImpl.
	 */
	provideAsState(): State<T> {
		let retVal = this.singleton;
		if (!retVal) {
			retVal = this.provideAsStateImpl();
		}
		if (this.singleton === null)
			this.singleton = retVal;
		return retVal;
	}

	/**
	 * @inheritDoc
	 * This specialization returns undefined if 'asyncOnly' is true and there is no asynchronous PostConstruct annotation (since class constructors can never by asynchronous).
	 */
	resolveIfSingleton(asyncOnly: boolean): Promise<T> {
		if ((!asyncOnly) || Reflect.getMetadata(POSTCONSTRUCT_ASYNC_METADATA_KEY, this.maker))
			return super.resolveIfSingleton(false);
		return undefined;
	}

	/**
	 * Make a resolved or pending State that reflects any @PostConstruct annotations.
	 */
	protected makePostConstructState(obj: T): State<T> {
		if (typeof obj === 'object' && (!Array.isArray(obj)) && obj.constructor) {
			let maybeAsync = false;
			let pcFn: () => void | Error | Promise<void | Error>;
			if (typeof this.successHandler === 'function') {
				maybeAsync = true;
				pcFn = () => {
					return this.successHandler(obj, this.injector, this.id, this.maker);
				};
			} else {
				/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
				// Check to see if there is a @PostConstruct annotation on a method of the class.
				let postConstruct: string = Reflect.getMetadata(POSTCONSTRUCT_SYNC_METADATA_KEY, obj.constructor);
				if (!postConstruct) {
					maybeAsync = true;
					postConstruct = Reflect.getMetadata(POSTCONSTRUCT_ASYNC_METADATA_KEY, obj.constructor);
				}
				if (postConstruct && obj.constructor.prototype[postConstruct] && typeof obj.constructor.prototype[postConstruct] === 'function')
					pcFn = obj[postConstruct].bind?.(obj);

				/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
			}
			if (pcFn) {
				let result: any;
				try {
					result = pcFn();
				}
				catch (err) {
					// The post construction method threw while executing, give the errorHandler (if any) a crack at recovery.
					try {
						obj = this.queryErrorHandler(err, obj); // The returned obj is unlikely to be the original obj.
						return State.MakeState<T>(null, undefined, obj);
					}
					catch (e) {
						// could not recover, propagate the error.
						return State.MakeState<T>(null, e, undefined);
					}
				}
				// The post construction method says it will let us know when it's finished.
				if (result && (result instanceof Promise || (maybeAsync && isPromise<void>(result)))) {
					// Return a State that is pending (the other return statements in this method return a State which is resolved or rejected).
					return State.MakeState<T>(this.makePromiseForObj<void>(result, () => obj));
				}
			}
		}
		// No PostConstruct, just return a resolved State
		return State.MakeState<T>(null, undefined, obj);
	}

	/**
	 * This method collects the States of all the constructor parameters for our target class.
	 */
	protected getConstructorParameterStates(): State[] {
		const argTypes = Reflect.getMetadata(REFLECT_PARAMS, this.maker);
		if (argTypes === undefined || !Array.isArray(argTypes)) {
			return [];
		}
		return argTypes.map((argType, index) => {
			// The reflect-metadata API fails on circular dependencies, and will return undefined for the argument instead.
			if (argType === undefined) {
				throw new Error(`Injection error. Recursive dependency in constructor for ${this.maker.toString()} at index ${index}`);
			}
			// Check if an Inject annotation precedes the parameter.
			const overrideToken = _getInjectedIdAt(this.maker, index);
			const actualToken = overrideToken === undefined ? argType : overrideToken;
			// Ask our configured container to resolve the parameter.
			let param = this.stateResolver(actualToken);
			// If the parameter could not be resolved, see if there is an @Optional annotation
			if ((!param.pending) && param.rejected) {
				const md = _getOptionalDefaultAt(this.maker, index);
				if (md)
					param = State.MakeState<any>(null, undefined, md.value);
			}
			return param;
		});
	}

	/**
	 * Gather the needed constructor parameters, invoke the constructor, and figure out what post construction needs done.
	 */
	private provideAsStateImpl(): State<T> {
		const params = this.getConstructorParameterStates();

		// If any of the params are in a rejected state, we cannot construct.
		const paramRejection = params.find((p) => {
			return (!p.pending) && p.rejected;
		});
		if (paramRejection) {
			return paramRejection as State<T>;
		}
		// If any of the params are in a pending state, we will have to wait for them to be resolved before we can construct.
		const pendingParams = params.filter((p) => {
			return p.pending;
		}).map((p) => {
			return p.promise;
		});
		if (pendingParams.length > 0) {
			// Some of the parameters needed for construction are not yet available, wait for them and then attempt construction.
			const objPromise = this.makePromiseForObj<any[]>(Promise.all(pendingParams), () => {
				// All the parameters are now available, instantiate the class.
				// If this throws, it will be handled by our caller.
				return Reflect.construct(this.maker, params.map((p) => p.fulfilled as unknown)) as T;
			});
			// Once the obj is resolved, then we need to check for PostConstruct and if it was async, wait for that too.
			return State.MakeState<T>(objPromise.then((obj) => {
				const state = this.makePostConstructState(obj);
				if (state.pending) {
					return state.promise;   // chain (aka wait some more).
				}
				else if (state.rejected) {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-return
					return state.rejected as any; // error
				}
				else {
					return state.fulfilled; // value (aka obj).
				}
			}));
		}
		else {
			// All parameters needed for construction are available, instantiate the object.
			try {
				const newObj = Reflect.construct(this.maker, params.map((p) => p.fulfilled as unknown));
				return this.makePostConstructState(newObj);
			}
			catch (err) {
				// There was an error, give the errorHandler (if any) a crack at recovery.
				try {
					return State.MakeState<T>(null, undefined, this.queryErrorHandler(err));
				}
				catch (e) {
					// could not recover, propagate the error.
					return State.MakeState<T>(null, e, undefined);
				}
			}
		}
	}
}
