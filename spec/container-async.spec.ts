import 'jasmine';
import 'reflect-metadata';
// noinspection ES6PreferShortImport
import {Container, Inject, Injectable, Injector, Optional, PostConstruct, Release} from '../src/index.js';

describe('Async factories', () => {
	it('Should support delayed retrieval', async () => {
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
		container.bindAsyncFactory(A, async () => {
			return await fetchA();
		}).asSingleton();

		let a = await container.resolve(A);
		expect(a.c).toEqual(1);
	});
	it('Should support async initialization', async () => {
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
		container.bindAsyncFactory(A, async () => {
			return await fetchA();
		}).asSingleton();

		await container.resolveSingletons();
		expect(container.get(A).c).toEqual(1);
	});
	it('Should respect the resolveSingletons call contract', async () => {
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
		try {
			await container.resolveSingletons();
			fail('resolveSingletons should have rejected');
		}
		catch (reason) {
			const reasonMap = reason as Map<string, Error>;
			expect(reasonMap).toBeInstanceOf(Map);
			expect(reasonMap.size).toBe(1);
			const r = reasonMap.get('B');
			expect(r).toBeDefined();
			expect(r!.message).toBe('Not a number');
		}
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
			public a!: string;

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
			public a!: string;

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

			public a!: string;

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
	it('Failure in async dependency tree should propagate', async () => {
		class A {
			public constructor() {
			}

			public a!: string;
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

		try {
			await container.resolve(B);
			fail('Factory failures should not resolve');
		}
		catch (err) {
			expect((err as Error).message).toBe('Unable to create A');
		}
	});
	it('Failure in async dependency tree should invoke ErrorHandler', async () => {
		class A {
			public constructor() {
			}

			public a!: string;
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

		try {
			await container.resolve(B);
			fail('Factory failures should not resolve');
		}
		catch (err) {
			expect((err as Error).message).toBe('Unable to recover A');
		}
	});
	it('Failure in async dependency tree should allow ErrorHandler to provide alternative', async () => {
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

		const b = await container.resolve(B);
		expect(b.a.a).toBe('A');
	});
	it('Async transient should produce a distinct instance on each resolve call', async () => {
		class A {
			public constructor() {
			}
		}

		const container = new Container();
		container.bindAsyncFactory(A, async () => new A());

		const a1 = await container.resolve(A);
		const a2 = await container.resolve(A);
		expect(a1).not.toBe(a2);
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
	it('Should be able to resolve services from parent container', async () => {
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
	it('releaseSingleton on a still-pending async singleton should return a Promise', async () => {
		@Injectable()
		class A {
			public a: string = 'A';

			@Release()
			cleanup() {
				this.a = 'released';
			}
		}

		const container = new Container();
		container.bindAsyncFactory(A, () => {
			return new Promise<A>((resolve) => {
				setTimeout(() => resolve(new A()), 25);
			});
		}).asSingleton();

		// Start resolution so the singleton enters the pending state
		const resolvePromise = container.resolve(A);

		// Release while still pending — must return a Promise (not the instance or null)
		const releaseResult = container.releaseSingleton(A);
		expect(releaseResult).toBeInstanceOf(Promise);

		// Once settled, @Release will have been invoked on the instance
		const released = await (releaseResult as Promise<A | null>);
		expect(released).not.toBeNull();
		expect((released as A).a).toBe('released');

		// The original resolve promise also settles cleanly
		await resolvePromise;
	});
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
	it('resolveSingletons should reject if a singleton threw during async creation', async () => {
		@Injectable()
		class BadService {
			@PostConstruct()
			async init(): Promise<void> {
				throw new Error('creation failed');
			}
		}

		const container = new Container();
		container.bindClass(BadService).asSingleton();

		// resolveSingletons itself triggers resolution; the async @PostConstruct throws, so it must reject
		await expectAsync(container.resolveSingletons()).toBeRejected();
	});
	it('resolve() should reject when the sync singleton was already rejected via get()', async () => {
		@Injectable()
		class BadSync {
			constructor() {
				throw new Error('sync construction failed');
			}
		}

		const container = new Container();
		container.bindClass(BadSync).asSingleton();

		// Drive the singleton into a rejected state via the sync API
		expect(() => container.get(BadSync)).toThrow();

		// The async API must surface the same pre-existing rejection
		await expectAsync(container.resolve(BadSync)).toBeRejected();
	});
	it('resolveSingletons() should reject when a sync singleton constructor throws', async () => {
		@Injectable()
		class BadSync {
			constructor() {
				throw new Error('sync construction failed');
			}
		}

		const container = new Container();
		container.bindClass(BadSync).asSingleton();

		// resolveSingletons triggers provideAsState() inside resolveIfSingleton; the throwing
		// constructor produces a rejected State synchronously, which must be surfaced as a rejection
		await expectAsync(container.resolveSingletons()).toBeRejected();
	});
});

describe('Blending synchronous and asynchronous injection', () => {
	it('Should support full blending scenario end-to-end', async () => {
		@Injectable()
		class SharedService {
			public connected = false;

			public constructor(@Inject('LogLevel') @Optional('warn') public logLevel: string) {
			}

			@PostConstruct()
			connect(): Promise<void> {
				return new Promise<void>((resolve) => {
					setTimeout(() => {
						this.connected = true;
						resolve();
					}, 25);
				});
			}
		}

		@Injectable()
		class TransactionHandler {
			public constructor(public svc: SharedService) {
			}
		}

		// Case 1: LogLevel omitted — @Optional default 'warn' applies
		const container1 = new Container();
		container1.bindClass(SharedService).asSingleton();
		container1.bindClass(TransactionHandler);
		await container1.resolveSingletons();

		const tx1 = container1.get(TransactionHandler);
		expect(tx1).toBeInstanceOf(TransactionHandler);
		expect(tx1.svc).toBeInstanceOf(SharedService);
		expect(tx1.svc.connected).toBeTrue();
		expect(tx1.svc.logLevel).toBe('warn');

		// Transient: each get() returns a new handler sharing the same singleton svc
		const tx2 = container1.get(TransactionHandler);
		expect(tx2).not.toBe(tx1);
		expect(tx2.svc).toBe(tx1.svc);

		// Case 2: LogLevel explicitly bound — constant overrides the @Optional default
		const container2 = new Container();
		container2.bindClass(SharedService).asSingleton();
		container2.bindClass(TransactionHandler);
		container2.bindConstant('LogLevel', 'info');
		await container2.resolveSingletons();

		const tx3 = container2.get(TransactionHandler);
		expect(tx3.svc.logLevel).toBe('info');
		expect(tx3.svc.connected).toBeTrue();
	});
});

describe('Asynchronous error handling', () => {
	it('Async initialization followed by another Async PostConstruct which fails, should propagate the error', async () => {
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

		try {
			await container.resolve(B);
			fail('Rejected parameters should cause construction failure');
		}
		catch (err) {
			expect((err as Error).message).toBe('Failed post construction of B');
		}
	});
	it('Pending constructor parameters that subsequently fail, should propagate the error', async () => {
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

		try {
			await container.resolve(B);
			fail('Rejected parameters should cause construction failure');
		}
		catch (err) {
			expect((err as Error).message).toBe('Failed post construction of A');
		}
	});
	it('Clone should share already-resolved singletons with the original', async () => {
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
		}

		@Injectable()
		class C {
			public constructor(public b: B) {
			}
		}

		const orig = new Container();
		orig.bindClass(B).asSingleton();
		orig.bindAsyncFactory(C, async (injector: Injector) => {
			const b = await injector.resolve(B);
			return new C(b);
		});
		await orig.resolveSingletons();
		const clone = orig.clone();

		const c1 = await clone.resolve(C);
		const c2 = await orig.resolve(C);
		expect(c1).not.toBe(c2);       // C is transient: each resolve gives a new instance
		expect(c1.b).toBe(c2.b);       // B is singleton: both containers share the same resolved instance
		expect(clone.get(B)).toBe(orig.get(B));
	});
	it('Clone should create independent transient instances', () => {
		@Injectable()
		class A {
			public constructor() {
			}
		}

		const orig = new Container();
		orig.bindClass(A);
		const clone = orig.clone();

		expect(clone.get(A)).not.toBe(orig.get(A));
	});
	it('Clone should inherit constants from the original', () => {
		const orig = new Container();
		orig.bindConstant('const', 42);
		const clone = orig.clone();

		expect(clone.get('const')).toEqual(42);
		expect(clone.get('const')).toBe(orig.get('const'));
	});
	it('Releasing singletons on a clone should release the shared singleton', async () => {
		@Injectable()
		class B {
			public constructor() {
				this.b = 'B';
			}

			public b: string;

			@Release()
			autoRelease() {
				this.b = 'released';
			}
		}

		const orig = new Container();
		orig.bindClass(B).asSingleton();
		await orig.resolveSingletons();
		const clone = orig.clone();

		const b = clone.get(B);
		expect(b.b).toEqual('B');
		clone.releaseSingletons();
		expect(b.b).toEqual('released');
	});
	it('Async initialization optionally depending on an Async dependency should succeed', async () => {
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
					}, 1);
				});
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
				return new Promise<void>((resolve, reject) => {
					setTimeout(() => {
						reject(new Error('Failed post construction of B'));
					}, 1);
				});
			}
		}

		@Injectable()
		class C {
			public constructor(@Inject(B) @Optional({b: 'fallback'}) public b: { b: string }) {
				this.c = 'C';
				this.b = b;
			}

			public c: string;
		}

		const container = new Container();
		container.bindClass(A);
		container.bindClass(B);
		container.bindClass(C);
		let c = await container.resolve(C);
		expect(c.b.b).toBe('fallback');

	});
});
