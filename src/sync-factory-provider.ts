import {InjectableId, Injector} from './injector';
import {SyncFactory} from './binder';
import {State} from './state';
import {BindableProvider} from './bindable-provider';

/**
 * @inheritDoc
 * This specialization simply invokes it's configured Factory and provides the result.
 */
export class FactoryBasedProvider<T> extends BindableProvider<T, SyncFactory<T>> {
	constructor(injector: Injector, id: InjectableId<T>, maker: SyncFactory<T>) {
		super(injector, id, maker);
	}

	/**
	 * @inheritDoc
	 * This specialization invokes it's configured Factory and provides the result (or invokes the error handler if necessary).
	 */
	provideAsState(): State<T> {
		let retVal = this.singleton;
		if (!retVal) {
			try {
				retVal = State.MakeState<T>(null, undefined, this.maker(this.injector));
			}
			catch (err) {
				// There was an error, give the errorHandler (if any) a crack at recovery.
				try {
					// queryErrorHandler will throw if it could not obtain a substitute object.
					retVal = State.MakeState<T>(null, undefined, this.queryErrorHandler(err));
				}
				catch (e) {
					// could not recover, propagate the error.
					retVal = State.MakeState<T>(null, e, undefined);
				}
			}
		}
		if (this.singleton === null)
			this.singleton = retVal;
		return retVal;
	}

	/**
	 * @inheritDoc
	 * This specialization returns undefined anytime 'asyncOnly' is true (since this Provider is by definition synchronous).
	 */
	resolveIfSingleton(asyncOnly: boolean): Promise<T> {
		if (asyncOnly)
			return undefined;
		return super.resolveIfSingleton(false);
	}
}
