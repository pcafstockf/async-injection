import {BindableProvider} from './bindable-provider.js';
import {POSTCONSTRUCT_ASYNC_METADATA_KEY, POSTCONSTRUCT_SYNC_METADATA_KEY, REFLECT_PARAMS} from './constants.js';
import {_getInjectedIdAt, _getOptionalDefaultAt} from './decorators.js';
import {ClassConstructor, InjectableId, Injector} from './injector.js';
import {State} from './state.js';
import {isPromise} from './utils.js';

/*
 * This is a bit of a hack, but it avoids a ton of alternative hacks.
 * Note that in the Container, resolveState is a protected method.
 * Injector was never meant to publicly expose State.
 * Gotta love JS!
 */
interface StateResolvingInjector extends Injector {
	resolveState<T>(id: InjectableId<T>): State<T>;
}

/**
 * @inheritDoc
 * This specialization invokes it's configured class constructor synchronously and then scans for (and invokes) any @PostConstruct (which may be synchronous or asynchronous).
 */
export class ClassBasedProvider<T> extends BindableProvider<T, ClassConstructor<T>> {
	constructor(injector: StateResolvingInjector, id: InjectableId<T>, maker: ClassConstructor<T>) {
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
			}
			else {
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
					/* eslint-disable @typescript-eslint/no-unsafe-argument */
					return State.MakeState<T>(this.makePromiseForObj<T>(result, () => obj));
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
			// The reflect-metadata API fails on circular dependencies returning undefined instead.
			// Additionally, it cannot return generic types (no runtime type info).
			// If an Inject annotation precedes the parameter, then that is what should get injected.
			const overrideToken = _getInjectedIdAt(this.maker, index);
			// If there was no Inject annotation, we might still be able to determine what to inject using the 'argType' (aka Reflect design:paramtypes).
			const actualToken = overrideToken === undefined ? argType : overrideToken;
			if (actualToken === undefined) {
				// No Inject annotation, and the type is not known.
				throw new Error(`Injection error. Unable to determine parameter ${index} type/value of ${this.maker.toString()} constructor`);
			}
			// Ask our container to resolve the parameter.
			/* eslint-disable @typescript-eslint/no-unsafe-argument */
			let param = (this.injector as StateResolvingInjector).resolveState(actualToken);
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
		const firstRejectedParam = params.find((p) => {
			return (!p.pending) && p.rejected;
		});
		if (firstRejectedParam)
			return firstRejectedParam as State<T>;
		if (params.some(p => p.pending)) {
			// Some of the parameters needed for construction are not yet available, wait for them and then attempt construction.
			// We do this by mapping each param to a Promise (pending or not), and then awaiting them all.
			// This might create some unnecessary (but immediately resolved) Promise objects,
			// BUT, it allows us to chain for failure *and* substitute the Optional (if one exists).
			const objPromise = this.makePromiseForObj<any[]>(Promise.all(params.map((p, idx) => {
				if (p.pending) {
					return p.promise.catch(err => {
						// This was a promised param that failed to resolve.
						// If there is an Optional decorator, use that, otherwise, failure is failure.
						const md = _getOptionalDefaultAt(this.maker, idx);
						if (!md)
							throw err;
						return md.value as unknown;
					});
				}
				if (p.rejected)
					return Promise.reject(p.rejected);
				return Promise.resolve(p.fulfilled);
			})), (values) => {
				if (values) {
					// All the parameters are now available, instantiate the class.
					// If this throws, it will be handled by our caller.
					return Reflect.construct(this.maker, values);
				}
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
