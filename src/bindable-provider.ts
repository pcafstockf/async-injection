import {InjectableId, Injector, ClassConstructor} from './injector';
import {AsyncFactory, BindAs, BindErrHandler, OnErrorCallback, SyncFactory} from './binder';
import {Provider} from './provider';

function isErrorObj(err: any): boolean {
	if (err instanceof Error)
		return true;
	return err && typeof err.message === 'string' && typeof err.stack === 'string';
}

/**
 * @inheritDoc
 * This abstraction is for Providers that can be additionally configured as Singletons and/or configured with an error handling callback.
 */
export abstract class BindableProvider<T, M = ClassConstructor<T> | SyncFactory<T> | AsyncFactory<T>> extends Provider<T> {
	protected constructor(protected injector: Injector, protected id: InjectableId<T>, protected maker: M) {
		super();
	}

	/**
	 * A user supplied error handling function.
	 * Default value is undefined.
	 */
	protected errorHandler?: OnErrorCallback<T, any>;

	/**
	 * Invoked by the Binder to create chain-able configuration
	 * @see BindAs
	 */
	makeBindAs(): BindAs<T, M> {
		// We do a little casting to make it look right to the editor of an intelligent IDE, but at the end of the day the BindErrHandler *is* the BindAs object.
		let retVal = <BindErrHandler<T, M>>{};
		retVal.onError = (cb: OnErrorCallback<T, M>) => {
			this.errorHandler = cb;
		};
		(<BindAs<T, M>>retVal).asSingleton = () => {
			this.singleton = null; // Flag state as no longer undefined.
			return retVal;
		};
		return <BindAs<T, M>>retVal;
	}

	/**
	 * Encapsulate the logic of invoking any configured error handler, and processing it's result.
	 * @see OnErrorCallback
	 *
	 * @returns The object substituted by the callback (otherwise this method throws the appropriate error).
	 */
	protected queryErrorHandler(err: Error, obj?: any): T {
		// There was an error during construction, see if an error handler was provided, and if so, see what it wants to do.
		if (this.errorHandler) {
			let handlerResult = this.errorHandler(this.injector, this.id, this.maker, err, obj);
			// Error handler wants us to propagate an error.
			if (isErrorObj(handlerResult))
				throw handlerResult;
			// Error handler has no opinion, so provideAsState a state that reflects the error we just caught.
			if (typeof handlerResult === 'undefined')
				throw err;
			// Error handler provided a valid (fully resolved) replacement.
			return <T>handlerResult;
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
	protected makePromiseForObj<R>(waitFor: Promise<R>, cb: (result: R) => T) {
		return new Promise<T>((resolve, reject) => {
			const errHandlerFn = (err: any) => {
				// There was an error during async post construction, see if an error handler was provided, and if so, see what it wants to do.
				if (this.errorHandler) {
					let handlerResult = this.errorHandler(this.injector, this.id, this.maker, err);
					// Error handler wants us to propagate an alternative error.
					if (isErrorObj(handlerResult))
						err = handlerResult;   // Fall thru
					else if (typeof handlerResult !== 'undefined') {
						resolve(<T>handlerResult);    // Error handler provided a replacement, so change the State that we returned from pending to resolved.
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
						errHandlerFn(err);
					}
				}
			).catch(
				(err) => {
					errHandlerFn(err);
				}
			);
		});
	}
}
