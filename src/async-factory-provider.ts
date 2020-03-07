import {InjectableId, Injector} from './injector';
import {AsyncFactory} from './binder';
import {State} from './state';
import {BindableProvider} from './bindable-provider';

/**
 * @inheritDoc
 * This specialization invokes it's configured Factory asynchronously and waits until it can provide the result.
 */
export class AsyncFactoryBasedProvider<T> extends BindableProvider<T, AsyncFactory<T>> {
	constructor(injector: Injector, id: InjectableId<T>, maker: AsyncFactory<T>) {
		super(injector, id, maker);
	}

	/**
	 * @inheritDoc
	 * This specialization invokes it's configured Factory and provides the result (or invokes the error handler if necessary).
	 */
	provideAsState(): State<T> {
		let retVal = this.singleton;
		if (!retVal) {
			// Wrap the async factory's Promise in an errorHandler aware Promise.
			// Our contract is that an AsyncFactory may not throw and must return a valid Promise (e.g. pending, resolved, rejected, etc).
			retVal = State.MakeState<T>(this.makePromiseForObj<T>(this.maker(this.injector), obj => obj));
		}
		if (this.singleton === null)
			this.singleton = retVal;
		return retVal;
	}
}
