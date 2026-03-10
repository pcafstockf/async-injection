import 'jasmine';
import 'reflect-metadata';
// noinspection ES6PreferShortImport
import {Container, Inject, Injectable, Optional, PostConstruct} from '../src/index.js';
import {INJECT_METADATA_KEY, INJECTABLE_METADATA_KEY, OPTIONAL_METADATA_KEY, POSTCONSTRUCT_ASYNC_METADATA_KEY, POSTCONSTRUCT_SYNC_METADATA_KEY, REFLECT_PARAMS, REFLECT_RETURN, RELEASE_METADATA_KEY} from '../src/constants.js';

// These string values are an interoperability contract: a class decorated in Bundle A must
// be recognized by a Container loaded in Bundle B. Changing any of these values is a
// breaking change that requires a major version bump and migration guide.
describe('Cross-bundle metadata key contract', () => {
	it('should use stable string values for all metadata keys', () => {
		expect(INJECTABLE_METADATA_KEY).toBe('async-injection:INJECTABLE');
		expect(POSTCONSTRUCT_SYNC_METADATA_KEY).toBe('async-injection:POSTCONSTRUCT_SYNC');
		expect(POSTCONSTRUCT_ASYNC_METADATA_KEY).toBe('async-injection:POSTCONSTRUCT_ASYNC');
		expect(INJECT_METADATA_KEY).toBe('async-injection:INJECT');
		expect(OPTIONAL_METADATA_KEY).toBe('async-injection:OPTIONAL');
		expect(RELEASE_METADATA_KEY).toBe('async-injection:RELEASE');
		expect(REFLECT_PARAMS).toBe('design:paramtypes');
		expect(REFLECT_RETURN).toBe('design:returntype');
	});
});

describe('@Injectable', () => {
	it('Should enable constructor injection by recording parameter types', () => {
		@Injectable()
		class A {
			public a = 'A';
		}

		@Injectable()
		class Target {
			public constructor(public a: A) {
			}
		}

		const container = new Container();
		container.bindClass(A);
		container.bindClass(Target);

		const t = container.get(Target);
		expect(t.a).toBeInstanceOf(A);
		expect(t.a.a).toEqual('A');
	});

	it('Should throw when applied multiple times', () => {
		function setup() {
			@Injectable()
			@Injectable()
			class A {
			}
		}

		expect(setup).toThrowError(/^@Injectable applied multiple times \[.+/);
	});
});

describe('@PostConstruct', () => {
	it('Should invoke a synchronous init method after construction', () => {
		@Injectable()
		class A {
			public initialized = false;

			@PostConstruct()
			public init() {
				this.initialized = true;
			}
		}

		const container = new Container();
		container.bindClass(A);

		const a = container.get(A);
		expect(a.initialized).toBeTruthy();
	});

	it('Should invoke and await an asynchronous init method after construction', async () => {
		@Injectable()
		class A {
			public initialized = false;

			@PostConstruct()
			public init(): Promise<void> {
				return new Promise<void>((resolve) => {
					setTimeout(() => {
						this.initialized = true;
						resolve();
					}, 1);
				});
			}
		}

		const container = new Container();
		container.bindClass(A).asSingleton();

		await container.resolveSingletons();
		expect(container.get(A).initialized).toBeTruthy();
	});

	it('Should throw when applied multiple times', () => {
		function setup() {
			// noinspection JSUnusedLocalSymbols
			class A {
				@PostConstruct()
				public one() {
				}

				@PostConstruct()
				public two() {
				}
			}
		}

		expect(setup).toThrowError(/^@PostConstruct applied multiple times \[.+/);
	});

	it('Should throw when applied to static member', () => {
		function setup() {
			// noinspection JSUnusedLocalSymbols
			class A {
				@PostConstruct()
				public static three() {
				}
			}
		}

		expect(setup).toThrowError(/^@PostConstruct not applied to instance method \[.+/);
	});
});

describe('@Inject', () => {
	it('Should override the inferred type with a string id', () => {
		@Injectable()
		class A {
			public a = 'A';
		}

		@Injectable()
		class B {
			public b = 'B';
		}

		@Injectable()
		class Target {
			public constructor(
				public a: A,
				@Inject('altB') public b: B
			) {
			}
		}

		const container = new Container();
		container.bindClass(A);
		container.bindClass<B>('altB', B);
		container.bindClass(Target);

		const t = container.get(Target);
		expect(t.a).toBeInstanceOf(A);
		expect(t.b).toBeInstanceOf(B);
		expect(t.b.b).toEqual('B');
	});

	it('Should override the inferred type with a Symbol id', () => {
		@Injectable()
		class A {
			public a = 'A';
		}

		const symId = Symbol('A');

		@Injectable()
		class Target {
			public constructor(
				@Inject(symId) public a: A
			) {
			}
		}

		const container = new Container();
		container.bindClass<A>(symId, A);
		container.bindClass(Target);

		const t = container.get(Target);
		expect(t.a).toBeInstanceOf(A);
		expect(t.a.a).toEqual('A');
	});

	it('Should throw when applied with undefined', () => {
		class A {
		}

		function setup(x: string) {
			// noinspection JSUnusedLocalSymbols
			class D {
				public constructor(@Inject(x) private k: A) {
				}
			}
		}

		expect(setup).toThrowError(/^Undefined id passed to @Inject \[.+/);
	});
});

describe('@Optional', () => {

	@Injectable()
	class A {
		public constructor() {
			this.a = 'A';
		}

		public a: string;
	}

	@Injectable()
	class B {
		public constructor() {
			this.b = 'B';
		}

		public b: string;
	}

	it('Should allow a constructor parameter to be flagged as optional', () => {
		const container = new Container();

		container.bindClass<A>('A', A);

		@Injectable()
		class T {
			public constructor(
				@Inject('A') a: A,
				@Inject('B') @Optional() b: B
			) {
				this.t = 'T';
				this.a = a;
				this.b = b;
			}

			public t: string;
			public a: A;
			public b: B;
		}

		container.bindClass<T>('T', T);

		let t = container.get<T>('T');
		expect(t.t).toEqual('T');
		expect(t.a.a).toEqual('A');
		expect(t.b).toBeUndefined();

		container.bindClass<B>('B', B);

		t = container.get<T>('T');
		expect(t.t).toEqual('T');
		expect(t.a.a).toEqual('A');
		expect(t.b.b).toEqual('B');
	});

	it('Should allow a default value to be specified', () => {
		const container = new Container();

		container.bindClass<A>('A', A);

		const defaultB = new B();
		defaultB.b = 'DefaultB';

		@Injectable()
		class T {
			public constructor(
				@Inject('A') a: A,
				@Inject('B') @Optional(defaultB) b: B
			) {
				this.t = 'T';
				this.a = a;
				this.b = b;
			}

			public t: string;
			public a: A;
			public b: B;
		}

		container.bindClass<T>('T', T);

		let t = container.get<T>('T');
		expect(t.t).toEqual('T');
		expect(t.a.a).toEqual('A');
		expect(t.b.b).toEqual('DefaultB');

		container.bindClass<B>('B', B);

		t = container.get<T>('T');
		expect(t.t).toEqual('T');
		expect(t.a.a).toEqual('A');
		expect(t.b.b).toEqual('B');
	});
});
