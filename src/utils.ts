export function isErrorObj(err: any): err is Error {
    if (err instanceof Error)
        return true;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/explicit-module-boundary-types
    return err && typeof err.message === 'string' && typeof err.stack === 'string';
}

export function isPromise<T>(value: any): value is Promise<T> {
    if (value instanceof Promise)
        return true;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return value && typeof value.then === 'function';
}