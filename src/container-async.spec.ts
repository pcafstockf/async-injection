import 'jasmine';
import {Injectable, PostConstruct} from './decorators';
import {Container} from './container';

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
	it('Should respect the resolveSingletons call contract', async (done) => {
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
		await container.resolveSingletons();   // This will resolve A which is an async singleton, so the factory will have immediate access to it.

		const b = container.get(B);
		expect(b.a.a).toEqual('A');
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
	it('Failure in async dependency tree should propagate', async (done) => {
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
	it('Failure in async dependency tree should invoke ErrorHandler', async (done) => {
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
	it('Failure in async dependency tree should allow ErrorHandler to provide alternative', async (done) => {
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
	it('Async initialization followed by another Async PostConstruct which fails, should propagate the error', async (done) => {
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
	it('Pending constructor parameters that subsequently fail, should propagate the error', async (done) => {
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
});
