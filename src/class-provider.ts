import {BindableProvider} from './bindable-provider';
import {POSTCONSTRUCT_ASYNC_METADATA_KEY, POSTCONSTRUCT_SYNC_METADATA_KEY, REFLECT_PARAMS} from './constants';
import {_getInjectedIdAt, _getInjectedIdForMethod, _getOptionalDefaultAt, _getOptionalDefaultForMethod} from './decorators';
import {ClassConstructor, InjectableId, Injector} from './injector';
import {State} from './state';
import {isPromise} from './utils';

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
	 * This specialization returns undefined if 'asyncOnly' is true **and** there is no asynchronous PostConstruct annotation (since class constructors can never by asynchronous),
	 * **unless** the @PostConstruct method has injectable parameters, which may themselves require async resolution.
	 */
	resolveIfSingleton(asyncOnly: boolean): Promise<T> | undefined {
		if (!asyncOnly || Reflect.getMetadata(POSTCONSTRUCT_ASYNC_METADATA_KEY, this.maker) || this.postConstructHasParams())
			return super.resolveIfSingleton(false);
		return undefined;
	}

	/**
	 * Returns true if the @PostConstruct method (if any) has at least one parameter.
	 * Any parameter may require async resolution, so this class must participate in resolveSingletons.
	 */
	private postConstructHasParams(): boolean {
		const pcMethod =
			(Reflect.getMetadata(POSTCONSTRUCT_SYNC_METADATA_KEY, this.maker) as string | undefined) ??
			(Reflect.getMetadata(POSTCONSTRUCT_ASYNC_METADATA_KEY, this.maker) as string | undefined);
		if (!pcMethod)
			return false;
		const paramTypes = Reflect.getMetadata(REFLECT_PARAMS, this.maker.prototype, pcMethod) as unknown[] | undefined;
		return Array.isArray(paramTypes) && paramTypes.length > 0;
	}

	/**
	 * Make a resolved or pending State that reflects any @PostConstruct annotations and/or onSuccess handler.
	 * Any @PostConstruct method (with any injected parameters) runs first; the onSuccess handler runs after.
	 */
	protected makePostConstructState(obj: T): State<T> {
		if (obj === null || typeof obj !== 'object' || Array.isArray(obj) || !(obj as any).constructor) {
			return State.MakeState<T>(null, undefined, obj);
		}
		const ctor = (obj as any).constructor;

		// Look up the @PostConstruct method name (sync or async).
		let pcMaybeAsync = false;
		let pcMethodName: string | undefined = Reflect.getMetadata(POSTCONSTRUCT_SYNC_METADATA_KEY, ctor) as string | undefined;
		if (!pcMethodName) {
			pcMethodName = Reflect.getMetadata(POSTCONSTRUCT_ASYNC_METADATA_KEY, ctor) as string | undefined;
			pcMaybeAsync = !!pcMethodName;
		}
		const pcValid = !!(pcMethodName && typeof ctor.prototype[pcMethodName] === 'function');
		const hasSuccess = typeof this.successHandler === 'function';

		if (!pcValid && !hasSuccess) {
			return State.MakeState<T>(null, undefined, obj);
		}

		// Resolve any injectable parameters declared on the @PostConstruct method.
		const paramStates = pcValid ? this.getMethodParameterStates(ctor, pcMethodName!) : [];

		// A synchronously rejected param (with no @Optional fallback) is treated as a PostConstruct error.
		const firstRejected = paramStates.find(p => !p.pending && p.rejected);
		if (firstRejected) {
			try {
				obj = this.queryErrorHandler(firstRejected.rejected, obj);
				return State.MakeState<T>(null, undefined, obj);
			}
			catch (e) {
				return State.MakeState<T>(null, e, undefined);
			}
		}

		if (paramStates.some(p => p.pending)) {
			// One or more params require async resolution — wait for them, then invoke.
			const paramsPromise = Promise.all(paramStates.map(async (p, idx) => {
				if (p.pending) {
					try {
						return await p.promise!;
					}
					catch (err) {
						const md = _getOptionalDefaultForMethod(ctor.prototype, pcMethodName!, idx);
						if (!md) throw err;
						return md.value;
					}
				}
				return p.fulfilled;
			}));
			return State.MakeState<T>((async () => {
				let args: any[];
				try {
					args = await paramsPromise;
				}
				catch (err) {
					return this.queryErrorHandler(err, obj);
				}
				try {
					const pcResult = (obj as any)[pcMethodName!](...args);
					if (pcResult && (pcResult instanceof Promise || (pcMaybeAsync && isPromise(pcResult))))
						await pcResult;
					if (hasSuccess) {
						const sResult = this.successHandler!(obj, this.injector, this.id, this.maker);
						if (sResult && isPromise(sResult)) await sResult;
					}
					return obj;
				}
				catch (err) {
					return this.queryErrorHandler(err, obj);
				}
			})());
		}

		// All params are synchronously available (or there are no params).
		const pcArgs = paramStates.map(p => p.fulfilled);
		const maybeAsync = pcMaybeAsync || hasSuccess;

		// Build a single function that calls PostConstruct (with resolved args) then onSuccess.
		let pcFn: (() => void | Error | Promise<void | Error>) | undefined;
		if (pcValid) {
			pcFn = () => {
				const pcResult = (obj as any)[pcMethodName!](...pcArgs);
				if (pcResult && (pcResult instanceof Promise || (pcMaybeAsync && isPromise<void>(pcResult)))) {
					// PostConstruct is async — chain onSuccess after it resolves.
					return hasSuccess
						? (pcResult as Promise<void>).then(() => this.successHandler!(obj, this.injector, this.id, this.maker))
						: pcResult as Promise<void>;
				}
				// PostConstruct is sync — call onSuccess immediately.
				if (hasSuccess)
					return this.successHandler!(obj, this.injector, this.id, this.maker) as void | Error | Promise<void | Error>;
				return pcResult;
			};
		}
		else {
			// No PostConstruct — just call onSuccess.
			pcFn = () => this.successHandler!(obj, this.injector, this.id, this.maker) as void | Error | Promise<void | Error>;
		}

		let result: any;
		try {
			result = pcFn();
		}
		catch (err) {
			try {
				obj = this.queryErrorHandler(err, obj);
				return State.MakeState<T>(null, undefined, obj);
			}
			catch (e) {
				return State.MakeState<T>(null, e, undefined);
			}
		}
		if (result && (result instanceof Promise || (maybeAsync && isPromise<void>(result)))) {
			return State.MakeState<T>(this.makePromiseForObj<T>(result, () => obj));
		}
		return State.MakeState<T>(null, undefined, obj);
	}

	/**
	 * Collects the resolved States for all injectable parameters of a @PostConstruct method.
	 * Uses the same resolution rules as constructor parameters: the reflected type (or an explicit @Inject token) is used to look up the binding, and an error is thrown if the type cannot be determined.
	 * Use @Optional() on a parameter to supply a fallback when no binding is found.
	 * Returns an empty array if the method has no parameters.
	 */
	protected getMethodParameterStates(ctor: Function, methodName: string): State[] {
		const argTypes = Reflect.getMetadata(REFLECT_PARAMS, ctor.prototype, methodName) as unknown[] | undefined;
		if (!Array.isArray(argTypes) || argTypes.length === 0)
			return [];
		return argTypes.map((argType, index) => {
			const overrideToken = _getInjectedIdForMethod(ctor.prototype, methodName, index);
			const actualToken = overrideToken !== undefined ? overrideToken : argType;
			if (actualToken == null) {
				throw new Error(`Injection error. Unable to determine parameter ${index} type/value of ${(ctor as any).name}.${methodName}`);
			}
			let param = (this.injector as StateResolvingInjector).resolveState(actualToken as InjectableId<unknown>);
			if (!param.pending && param.rejected) {
				const optionalDefault = _getOptionalDefaultForMethod(ctor.prototype, methodName, index);
				if (optionalDefault)
					param = State.MakeState<any>(null, undefined, optionalDefault.value);
			}
			return param;
		});
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
			const objPromise = this.makePromiseForObj<any[]>(Promise.all(params.map(async (p, idx) => {
				if (p.pending) {
					try {
						return await p.promise!;
					}
					catch (err) {
						// This was a promised param that failed to resolve.
						// If there is an Optional decorator, use that, otherwise, failure is failure.
						const md = _getOptionalDefaultAt(this.maker, idx);
						if (!md)
							throw err;
						return md.value as unknown;
					}
				}
				return p.fulfilled;
			})), (values) => {
				if (values) {
					// All the parameters are now available, instantiate the class.
					// If this throws, it will be handled by our caller.
					return Reflect.construct(this.maker, values);
				}
				return undefined as unknown as T;
			});
			// Once the obj is resolved, then we need to check for PostConstruct and if it was async, wait for that too.
			return State.MakeState<T>((async () => {
				const obj = await objPromise;
				const state = this.makePostConstructState(obj);
				if (state.pending) {
					return await state.promise!;   // chain (aka wait some more).
				}
				else if (state.rejected) {
					throw state.rejected; // error
				}
				else {
					return state.fulfilled!; // value (aka obj).
				}
			})());
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
