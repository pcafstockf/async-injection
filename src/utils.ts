/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/explicit-module-boundary-types */
import {RELEASE_METADATA_KEY, INJECTABLE_METADATA_KEY} from './constants.js';
import type {ClassConstructor} from './injector.js';

/**
 * Returns true if the specified object looks like a JavaScript Error object.
 */
export function isErrorObj(err: any): err is Error {
	if (!err)
		return false;

	if (err instanceof Error)
		return true;

	return err && typeof err.message === 'string' && typeof err.stack === 'string';
}

/**
 * Returns true if the specified value is "thenable" (aka a Promise).
 */
export function isPromise<T>(value: any): value is Promise<T> {
	if (!value)
		return false;

	if (value instanceof Promise)
		return true;

	return value && typeof value.then === 'function';
}

/**
 * Simple helper function to find the @Release decorated method of an object (if any), and invoke it.
 * This is primarily an internal method as you probably know the exact method, and should invoke it yourself.
 * async-injection uses this helper to allow Singletons to clean up any non-garbage-collectable resources they may have allocated.
 */
export function InvokeReleaseMethod<T = unknown>(obj: T): boolean {
	const releaseMethod: string = Reflect.getMetadata(RELEASE_METADATA_KEY, obj.constructor);
	/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
	if (releaseMethod && obj.constructor.prototype[releaseMethod] && typeof obj.constructor.prototype[releaseMethod] === 'function') {
		const releaseFn = obj[releaseMethod].bind?.(obj);
		if (releaseFn) {
			releaseFn();
			return true;
		}
	}
	/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
	return false;
}

/**
 * A simple utility method to determine if the specified class has been tagged as @Injectable already.
 */
export function hasDecoration(target: ClassConstructor<unknown>): boolean {
	if (typeof target !== 'object' || target === null) {
		throw new Error('target not an object:' + target.toString());
	}
	return Reflect.hasOwnMetadata(INJECTABLE_METADATA_KEY, target)
}
