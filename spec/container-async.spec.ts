/* eslint-disable */

import 'jasmine';
import 'reflect-metadata';
import {Container, Inject, Injectable, Injector, Optional, PostConstruct} from '../src';
import {Release} from '../src/decorators';

describe('Async factories', () => {
	it('Should support delayed retrieval', async () => {
		class A {
			public constructor(public c: number) {
			}
		}

		let requested: Date = null;

		async function fetchA() {
			return new Promise<A>((resolve) => {
				requested = new Date();
				setTimeout(() => {
					resolve(new A(1));
				}, 25);
			});
		}

		const container = new Container();
		container.bindAsyncFactory(A, async () => {
			return await fetchA();
		}).asSingleton();

		let a = await container.resolve(A);
		const end = new Date();

		expect(end.getTime() - requested.getTime()).toBeGreaterThanOrEqual(20);
		expect(a.c).toEqual(1);
	});
	it('Should support async initialization', async () => {
		class A {
			public constructor(public c: number) {
			}
		}

		let requested: Date = null;

		async function fetchA() {
			return new Promise<A>((resolve) => {
				requested = new Date();
				setTimeout(() => {
					resolve(new A(1));
				}, 25);
			});
		}

		const container = new Container();
		container.bindAsyncFactory(A, async () => {
			return await fetchA();
		}).asSingleton();

		await container.resolveSingletons();
		const end = new Date();

		expect(end.getTime() - requested.getTime()).toBeGreaterThanOrEqual(20);
		expect(container.get(A).c).toEqual(1);
	});
	it('Should respect the resolveSingletons call contract', (done) => {
		// All the other code binds to objects, lets bind to a number (which is perfectly valid).
		async function fetchA(n: number) {
			return new Promise<number>((resolve, reject) => {
				setTimeout(() => {
					if (isNaN(n))
						reject(new Error('Not a number'));
					else
						resolve(n);
				}, 25);
			});
		}

		const container = new Container();
		container.bindAsyncFactory('A', async () => {
			return await fetchA(1);
		}).asSingleton();
		container.bindAsyncFactory('B', async () => {
			return await fetchA(NaN);
		}).asSingleton();
		container.resolveSingletons().then(() => {
			fail('resolveSingletons should have rejected');
			done();
		}).catch((reason) => {
			expect(reason).toBeInstanceOf(Map);
			expect(reason.size).toBe(1);
			let r = reason.get('B');
			expect(r).toBeDefined();
			expect(r.message).toBe('Not a number');
			done();
		});
	});
	it('Should throw if you request an unresolved dependency tree', async () => {
		class A {
			public constructor(public c: number) {
			}
		}

		async function fetchA() {
			return new Promise<A>((resolve) => {
				setTimeout(() => {
					resolve(new A(1));
				}, 25);
			});
		}

		const container = new Container();

		function impatient() {
			expect(container.get(A).c).toEqual(1);
		}

		container.bindAsyncFactory(A, async () => {
			return await fetchA();
		}).asSingleton();

		expect(impatient).toThrowError(/^Synchronous request on unresolved asynchronous dependency tree: /);
	});
	it('Should support sync Factory with async PostConstruct in the dependency chain as long as resolve is used', async () => {
		@Injectable()
		class A {
			public constructor() {
				this.i = 'PostConstruct';
			}

			public i: string;
			public a: string;

			@PostConstruct()
			public init(value?: string): Promise<void> {
				if (value)
					this.i = value;
				return new Promise<void>((resolve) => {
					setTimeout(() => {
						this.a = 'A';
						resolve();
					}, 25);
				});
			}
		}

		@Injectable()
		class B {
			public constructor(public a: A) {
			}
		}

		const container = new Container();
		container.bindClass(A).asSingleton();
		container.bindFactory(B, (i) => {
			return new B(i.get(A));
		});
		await container.resolveSingletons();   // This will resolve A which is an async singleton, so the factory will have immediate access to it.

		const b = container.get(B);
		expect(b.a.a).toEqual('A');
		expect(b.a.i).toEqual('PostConstruct');
	});
	it('Should support sync Factory with async success handler in the dependency chain as long as resolve is used', async () => {
		@Injectable()
		class A {
			public constructor() {
				this.i = 'PostConstruct';
			}

			public i: string;
			public a: string;

			@PostConstruct()
			public init(value?: string): Promise<void> {
				if (value)
					this.i = value;
				return new Promise<void>((resolve) => {
					setTimeout(() => {
						this.a = 'A';
						resolve();
					}, 25);
				});
			}
		}

		@Injectable()
		class B {
			public constructor(public a: A) {
			}
		}

		const container = new Container();
		container.bindClass(A).asSingleton().onSuccess((value) => {
			return value.init('onSuccess');
		});
		container.bindFactory(B, (i) => {
			return new B(i.get(A));
		});
		await container.resolveSingletons();   // This will resolve A which is an async singleton, so the factory will have immediate access to it.

		const b = container.get(B);
		expect(b.a.a).toEqual('A');
		expect(b.a.i).toEqual('onSuccess');
	});
	it('Should fail with an sync Factory using an async PostConstruct, when get is used without an intervening resolveIfSingleton', async () => {
		@Injectable()
		class A {
			public constructor() {
			}

			public a: string;

			@PostConstruct()
			public init(): Promise<void> {
				return new Promise<void>((resolve) => {
					setTimeout(() => {
						this.a = 'A';
						resolve();
					}, 25);
				});
			}
		}

		@Injectable()
		class B {
			public constructor(public a: A) {
			}
		}

		const container = new Container();
		container.bindClass(A).asSingleton();
		container.bindFactory(B, (i) => {
			return new B(i.get(A));
		});

		function checkB() {
			const b = container.get(B);
			expect(b.a.a).toEqual('A');
		}

		expect(checkB).toThrowError(/^Synchronous request on unresolved asynchronous dependency tree: /);
	});
	it('Multiple async in dependency tree should all properly resolve', async () => {
		class A {
			public constructor() {
				this.a = 'A';
			}

			public a: string;
		}

		async function fetchA() {
			return new Promise<A>((resolve) => {
				setTimeout(() => {
					resolve(new A());
				}, 25);
			});
		}

		@Injectable()
		class B {
			public constructor(public a: A) {
			}
		}

		@Injectable()
		class C {
			public constructor(public b: B) {
			}
		}

		const container = new Container();
		container.bindClass(B);
		container.bindAsyncFactory(A, async () => {
			return await fetchA();
		});
		container.bindClass(C);
		let b = await container.resolve(B);

		expect(b.a.a).toEqual('A');
	});
	it('Failure in async dependency tree should propagate', (done) => {
		class A {
			public constructor() {
			}

			public a: string;
		}

		async function fetchA() {
			return new Promise<A>((resolve, reject) => {
				setTimeout(() => {
					reject(new Error('Unable to create A'));
				}, 25);
			});
		}

		@Injectable()
		class B {
			public constructor(public a: A) {
			}
		}

		@Injectable()
		class C {
			public constructor(public b: B) {
			}
		}

		const container = new Container();
		container.bindClass(B);
		container.bindAsyncFactory(A, async () => {
			return await fetchA();
		});
		container.bindClass(C);

		container.resolve(B).then(() => {
			fail('Factory failures should not resolve');
			done();
		}, (err) => {
			expect(err.message).toBe('Unable to create A');
			done();
		});
	});
	it('Failure in async dependency tree should invoke ErrorHandler', (done) => {
		class A {
			public constructor() {
			}

			public a: string;
		}

		async function fetchA() {
			return new Promise<A>((resolve, reject) => {
				setTimeout(() => {
					reject(new Error('Unable to create A'));
				}, 25);
			});
		}

		@Injectable()
		class B {
			public constructor(public a: A) {
			}
		}

		const container = new Container();
		container.bindClass(B);
		container.bindAsyncFactory(A, async () => {
			return await fetchA();
		}).onError((injector, id: any, maker, error, value) => {
			expect(value).toBeUndefined();  // We didn't create it, so nothing should be passed.
			return new Error('Unable to recover ' + id.name);
		});

		container.resolve(B).then(() => {
			fail('Factory failures should not resolve');
			done();
		}, (err) => {
			expect(err.message).toBe('Unable to recover A');
			done();
		});
	});
	it('Failure in async dependency tree should allow ErrorHandler to provide alternative', (done) => {
		class A {
			public constructor() {
				this.a = 'A';
			}

			public a: string;
		}

		async function fetchA() {
			return new Promise<A>((resolve, reject) => {
				setTimeout(() => {
					reject(new Error('Unable to create A'));
				}, 25);
			});
		}

		@Injectable()
		class B {
			public constructor(public a: A) {
			}
		}

		const container = new Container();
		container.bindClass(B);
		container.bindAsyncFactory(A, async () => {
			return await fetchA();
		}).onError((injector, id: any, maker, error, value) => {
			expect(value).toBeUndefined();  // We didn't create it, so nothing should be passed.
			return new A();
		});

		container.resolve(B).then((b) => {
			expect(b.a.a).toBe('A');
			done();
		}, () => {
			fail('Factory failures should recover');
			done();
		});
	});
});

describe('Container asynchronous hierarchy', () => {
	it('Should be able to get services from parent container', async () => {
		class A {
			public constructor(public c: number) {
			}
		}

		async function fetchA() {
			return new Promise<A>((resolve) => {
				setTimeout(() => {
					resolve(new A(1));
				}, 25);
			});
		}

		const root = new Container();
		root.bindAsyncFactory('A', async () => {
			return await fetchA();
		}).asSingleton();
		const child = new Container(root);
		const grandChild = new Container(child);
		await grandChild.resolveSingletons(false, true);

		let a = grandChild.get<A>('A');
		expect(a instanceof A).toBeTruthy();
		expect(a.c).toEqual(1);
	});
	it('Should be able to get services from parent container', async () => {
		class A {
			public constructor(public c: number) {
			}
		}

		async function fetchA() {
			return new Promise<A>((resolve) => {
				setTimeout(() => {
					resolve(new A(1));
				}, 25);
			});
		}

		const root = new Container();
		root.bindAsyncFactory('A', async () => {
			return await fetchA();
		}).asSingleton();
		const child = new Container(root);
		const grandChild = new Container(child);

		let a = await grandChild.resolve<A>('A');
		expect(a instanceof A).toBeTruthy();
		expect(a.c).toEqual(1);
	});
});

describe('Edge cases', () => {
	it('Should successfully invoke resolve even on a fully synchronous dependency tree', async () => {
		@Injectable()
		class A {
			public constructor() {
				this.a = 'A';
			}

			public a: string;
		}

		@Injectable()
		class B {
			public constructor(public a: A) {
			}
		}

		const container = new Container();
		container.bindClass(A).asSingleton();
		container.bindClass(B);

		const b1 = await container.resolve(B);
		expect(b1 instanceof B).toBeTruthy();
		expect(b1.a.a).toEqual('A');
		const b2 = container.get(B);
		expect(b2 instanceof B).toBeTruthy();
	});
});

describe('Asynchronous error handling', () => {
	it('Async initialization followed by another Async PostConstruct which fails, should propagate the error', (done) => {
		@Injectable()
		class A {
			public constructor() {
				this.a = 'A';
			}

			public a: string;

			@PostConstruct()
			public init(): Promise<void> {
				return new Promise<void>((resolve) => {
					setTimeout(() => {
						resolve();
					}, 25);
				});
			}
		}

		@Injectable()
		class B {
			public constructor(public a: A) {
			}

			@PostConstruct()
			public init(): Promise<void> {
				return new Promise<void>((resolve, reject) => {
					setTimeout(() => {
						reject(new Error('Failed post construction of B'));
					}, 25);
				});
			}
		}

		const container = new Container();
		container.bindClass(A);
		container.bindClass(B);

		container.resolve(B).then(() => {
			fail('Rejected parameters should cause construction failure');
			done();
		}, (err) => {
			expect(err.message).toBe('Failed post construction of B');
			done();
		});
	});
	it('Pending constructor parameters that subsequently fail, should propagate the error', (done) => {
		@Injectable()
		class A {
			public constructor() {
				this.a = 'A';
			}

			public a: string;

			@PostConstruct()
			public init(): Promise<void> {
				return new Promise<void>((resolve, reject) => {
					setTimeout(() => {
						reject(new Error('Failed post construction of A'));
					}, 25);
				});
			}
		}

		@Injectable()
		class B {
			public constructor(public a: A) {
			}
		}

		const container = new Container();
		container.bindClass(A);
		container.bindClass(B);

		container.resolve(B).then(() => {
			fail('Rejected parameters should cause construction failure');
			done();
		}, (err) => {
			expect(err.message).toBe('Failed post construction of A');
			done();
		});
	});
	it('be able to clone a container', async () => {
		@Injectable()
		class A {
			public constructor() {
			}
		}

		@Injectable()
		class B {
			public constructor() {
				this.b = 'B';
			}

			public b: string;

			@PostConstruct()
			public init(): Promise<void> {
				return new Promise<void>((resolve) => {
					setTimeout(() => {
						resolve();
					}, 25);
				});
			}

			@Release()
			autoRelease() {
				this.b = 'released';
			}
		}

		@Injectable()
		class C {
			public constructor(public b: B) {
			}
		}

		@Injectable()
		class E {
			public constructor(@Inject('UnDef') @Optional('attempt') public e: string) {
			}

			@PostConstruct()
			public init(): Promise<void> {
				this.e = 'fail';
				return new Promise<void>((resolve, reject) => {
					setTimeout(() => {
						reject(new Error('Failed post construction of E'));
					}, 25);
				});
			}
		}

		const orig = new Container();
		let clone: Container;
		let acount = 0;
		// test success callbacks *and* that we can retrieve something from the orig container, clone that container, and retrieve another instance of A from the cloned container.
		orig.bindClass(A).onSuccess((value, injector, id, maker) => {
			if (acount === 0) {
				expect(injector).toBe(orig);
			}
			else {
				expect(injector).toBe(clone);
			}
			expect(value).toBeInstanceOf(A);
			expect(id).toBe(A);
			expect(maker).toBe(A);
			acount++;
		});
		// test singletons
		orig.bindClass(B).asSingleton();
		// test async factory
		let ccount = 0;
		orig.bindAsyncFactory(C, async (injector: Injector) => {
			if (ccount === 0)
				expect(injector).toBe(clone);
			else
				expect(injector).toBe(orig);
			const b = await injector.resolve(B);
			ccount++;
			return new C(b);
		});
		orig.bindClass(E).onError((injector, id, maker, error, value) => {
			// The construction will succeed, but postcontruction will throw, so this error handler should be invoked and will 'init' the e property as a "recovery"
			expect(injector).toBe(clone);
			expect(value).toBeInstanceOf(E);
			expect(id).toBe(E);
			expect(maker).toBe(E);
			value.e = 'recovery';
			return value;
		});
		orig.bindConstant('const', 42);

		expect(acount).toBe(0);
		const origA = orig.get(A);
		expect(origA).toBeInstanceOf(A);
		expect(acount).toBe(1);
		orig.resolveSingletons();
		clone = orig.clone();
		expect(clone).toBeInstanceOf(Container);
		expect(clone).not.toBe(orig);
		const cloneA = clone.get(A);
		expect(cloneA).toBeInstanceOf(A);
		expect(acount).toBe(2);

		const c = await clone.resolve(C);
		expect(c.b).toBeInstanceOf(B);
		const z = await orig.resolve(C);
		expect(c).not.toBe(z);  // C is not a singleton, so regardless of container, we should always get a new one.
		expect(z.b).toBe(c.b);  // B is a singleton, so regardless of container, it should always be the same.

		const e = await clone.resolve(E);
		expect(e.e).toEqual('recovery');

		expect(clone.get('const')).toEqual(42);
		expect(clone.get('const')).toBe(orig.get('const'));

		// Since we resolved B in orig, it's singleton state carried over to clone, so we should be able to release.
		expect(c.b.b).toEqual("B");
		clone.releaseSingletons();
		expect(c.b.b).toEqual("released");
	});
});
