import {isPromise} from './utils.js';

/**
 * Internal class that allows us to track the state of a promise (chain).
 */
export class State<T = any> {
	static MakeState<TState = any>(promise: Promise<TState> | null, rejected?: unknown, fulfilled?: TState): State<TState> {
		const retVal = new State<TState>();
		if (isPromise(promise)) {
			retVal._pending = true;
			retVal._promise = promise.then(
				(v) => {
					retVal._fulfilled = v;
					retVal._pending = false;
					return v;
				},
				(e: any) => {
					retVal._rejected = e;
					retVal._pending = false;
					throw e;
				}
			);
		}
		else {
			retVal._pending = false;
			if (rejected) {
				retVal._rejected = rejected;
			}
			else {
				retVal._fulfilled = fulfilled as TState;
			}
			retVal._promise = null;
		}
		return retVal;
	}

	protected constructor() {
	}

	protected _promise!: Promise<T> | null;

	get promise(): Promise<T> | null {
		return this._promise;
	}

	protected _pending!: boolean;

	get pending(): boolean {
		return this._pending;
	}

	protected _fulfilled!: T;

	get fulfilled(): T {
		return this._fulfilled;
	}

	protected _rejected: unknown;

	get rejected(): unknown {
		return this._rejected;
	}
}
