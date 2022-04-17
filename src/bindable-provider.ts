import { AsyncFactory, BindAs, OnErrorCallback, OnSuccessCallback, SyncFactory } from './binder';
import { ClassConstructor, InjectableId, Injector } from './injector';
import { Provider } from './provider';
import { isErrorObj } from './utils';

/**
 * @inheritDoc
 * This abstraction is for Providers that can be additionally configured as Singletons and/or configured with error and/or success handling callback(s).
 */
export abstract class BindableProvider<T, M = ClassConstructor<T> | SyncFactory<T> | AsyncFactory<T>> extends Provider<T> {
	protected constructor(protected injector: Injector, protected id: InjectableId<T>, protected maker: M) {
		super();
	}

	/**
	 * A user supplied success handling function.
	 * Default value is undefined.
	 */
	protected successHandler?: OnSuccessCallback<T, any>;

	/**
	 * A user supplied error handling function.
	 * Default value is undefined.
	 */
	protected errorHandler?: OnErrorCallback<T, any>;

	/**
	 * Invoked by the Binder to create chain-able configuration
	 *
	 * @see BindAs
	 */
	makeBindAs(): BindAs<T, M> {
		const retVal: BindAs<T, M> = {
			onError: (cb: OnErrorCallback<T, M>) => {
				this.errorHandler = cb;
			},
			onSuccess: (cb: OnSuccessCallback<T, M>) => {
				this.successHandler = cb;
				return retVal;
			},
			asSingleton: () => {
				this.singleton = null; // Flag state as no longer undefined.
				return retVal;
			}
		};
		return retVal;
	}

	/**
	 * Encapsulate the logic of invoking any configured error handler, and processing it's result.
	 *
	 * @see OnErrorCallback
	 *
	 * @returns The object substituted by the callback (otherwise this method throws the appropriate error).
	 */
	protected queryErrorHandler(err: Error, obj?: T): T {
		// There was an error during construction, see if an error handler was provided, and if so, see what it wants to do.
		if (this.errorHandler) {
			const handlerResult = this.errorHandler(this.injector, this.id, this.maker, err, obj);
			// Error handler wants us to propagate an error.
			if (isErrorObj(handlerResult))
				throw handlerResult;
			// Error handler has no opinion, so provideAsState a state that reflects the error we just caught.
			if (typeof handlerResult === 'undefined')
				throw err;
			// Error handler provided a valid (fully resolved) replacement.
			return handlerResult;
		}
		// No error handler, provideAsState a state that reflects the error we just caught.
		throw err;
	}

	/**
	 * This is like a retry mechanism that uses the Provider's errorHandler (if any) to attempt recovery whenever the supplied Promise rejects.
	 * This method returns a Promise that rejects if recovery was not possible.
	 * If the supplied Promise resolves, then this method passes the result to the callback, and then resolve as whatever that callback returns.
	 *
	 * @param waitFor   The supplied Promise.
	 * @param cb    Callback to be invoked if the supplied Promise resolves.
	 */
	protected makePromiseForObj<R>(waitFor: Promise<R>, cb: (result: R) => T): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const errHandlerFn = (err: any, objValue?: T) => {
				// There was an error during async post construction, see if an error handler was provided, and if so, see what it wants to do.
				if (this.errorHandler) {
					const handlerResult = this.errorHandler(this.injector, this.id, this.maker, err, objValue);
					// Error handler wants us to propagate an alternative error.
					if (isErrorObj(handlerResult))
						err = handlerResult;   // Fall thru
					else if (typeof handlerResult !== 'undefined') {
						resolve(handlerResult);    // Error handler provided a replacement, so change the State that we returned from pending to resolved.
						return;
					}
				}
				// This will change the State that we returned from pending to rejected.
				reject(err);
			};
			waitFor.then(
				(result) => {
					// This will change the State that we returned from pending to resolved.
					try {
						resolve(cb(result));
					}
					catch (err) {
						errHandlerFn(err, cb(result));
					}
				}
			).catch(
				(err) => {
					errHandlerFn(err, cb(undefined));
				}
			);
		});
	}
}
