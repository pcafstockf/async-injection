import {Provider} from './provider.js';
import {State} from './state.js';

/**
 * @inheritDoc
 * This specialization is always a Singleton.
 */
export class ConstantProvider<T> extends Provider<T> {
	constructor(constant: T) {
		super();
		this.singleton = State.MakeState<T>(null, undefined, constant);
	}

	provideAsState(): State<T> {
		return this.singleton;
	}
}
