/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/explicit-module-boundary-types */

export function isErrorObj(err: any): err is Error {
	if (!err)
        return false;

    if (err instanceof Error)
        return true;

    return err && typeof err.message === 'string' && typeof err.stack === 'string';
}

export function isPromise<T>(value: any): value is Promise<T> {
    if (!value)
        return false;

    if (value instanceof Promise)
        return true;

    return value && typeof value.then === 'function';
}
