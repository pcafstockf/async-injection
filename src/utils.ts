/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/explicit-module-boundary-types */
import {RELEASE_METADATA_KEY} from './constants.js';

/**
 * Returns true if the specified object looks like a JavaScript Error object.
 */
export function isErrorObj(err: any): err is Error {
	if (!err)
		return false;

	if (err instanceof Error)
		return true;

	return !!(err && typeof err.message === 'string' && typeof err.stack === 'string');
}

/**
 * Returns true if the specified value is "thenable" (aka a Promise).
 */
export function isPromise<T>(value: any): value is Promise<T> {
	if (!value)
		return false;

	if (value instanceof Promise)
		return true;

	return !!(value && typeof value.then === 'function');
}

/**
 * Simple helper function to find the @Release decorated method of an object (if any), and invoke it.
 * This is primarily an internal method as you probably know the exact method, and should invoke it yourself.
 * async-injection uses this helper to allow Singletons to clean up any non-garbage-collectable resources they may have allocated.
 */
export function InvokeReleaseMethod<T = unknown>(obj: T): boolean {
	const o = obj as any;
	/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
	const releaseMethod: string = Reflect.getMetadata(RELEASE_METADATA_KEY, o.constructor) as string;
	if (releaseMethod && o.constructor.prototype[releaseMethod] && typeof o.constructor.prototype[releaseMethod] === 'function') {
		const releaseFn = o[releaseMethod].bind?.(o);
		if (releaseFn) {
			releaseFn();
			return true;
		}
	}
	/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
	return false;
}
