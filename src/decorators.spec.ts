import 'jasmine';
import {_getInjectedIdAt, Inject, Injectable, Optional, PostConstruct} from './decorators';
import {InjectableId} from './injector';
import {Container} from './container';
import {POSTCONSTRUCT_ASYNC_METADATA_KEY, POSTCONSTRUCT_SYNC_METADATA_KEY, REFLECT_PARAMS} from './constants';

describe('@Injectable', () => {
	it('Should generate proper metadata', () => {
		class A {
		}

		interface B {
		}

		@Injectable()
		class Target {
			// noinspection JSUnusedLocalSymbols
			public constructor(private a: A, private b: B) {
			}
		}

		const metadata = Reflect.getMetadata(REFLECT_PARAMS, Target);
		expect(Array.isArray(metadata)).toBeTruthy();
		expect(metadata[0]).toBe(A);
		expect(metadata[1]).toBe(Object);
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
	it('Should generate proper metadata', () => {
		class A {
			@PostConstruct()
			public initMethod() {
			}
		}

		const smd = Reflect.getMetadata(POSTCONSTRUCT_SYNC_METADATA_KEY, A);
		expect(smd).toBe('initMethod');
		const amd = Reflect.getMetadata(POSTCONSTRUCT_ASYNC_METADATA_KEY, A);
		expect(amd).toBeUndefined();
	});
	it('Should detect an asynchronous return', () => {
		class A {
			@PostConstruct()
			public initMethod(): Promise<void> {
				return Promise.resolve();
			}
		}

		const amd = Reflect.getMetadata(POSTCONSTRUCT_ASYNC_METADATA_KEY, A);
		expect(amd).toBe('initMethod');
		const smd = Reflect.getMetadata(POSTCONSTRUCT_SYNC_METADATA_KEY, A);
		expect(smd).toBeUndefined();
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
	class A {
	}

	class B {
	}

	it('Should generate metadata for named parameters', () => {
		// noinspection JSUnusedLocalSymbols
		class C {
		}

		function makeDynamically(): InjectableId<symbol> {
			// Make it impossible for the Typescript compiler to predict the value.
			let d = new Date();
			if (d.getMilliseconds() > 1000) {
				return Symbol('C');
			}
			return Symbol('Error');
		}

		const dynamicId = makeDynamically();

		class D {
			public constructor(
				private primary: A,
				@Inject('B') private secondary: B,
				@Inject(dynamicId) private tertiary: any
			) {
			}
		}

		const paramsMetadata = Reflect.getMetadata(REFLECT_PARAMS, D);
		expect(Array.isArray(paramsMetadata) && paramsMetadata.length).toBeTruthy();

		// assert metadata for first argument
		const inject0 = _getInjectedIdAt(D, 0);
		expect(inject0).toBeUndefined();
		expect(paramsMetadata[0].name).toBe('A');
		// assert metadata for second argument
		const inject1 = _getInjectedIdAt(D, 1);
		expect(inject1.toString()).toBe(paramsMetadata[1].name);

		// assert metadata for second argument
		const inject2 = _getInjectedIdAt(D, 2);
		expect(inject2).toBe(dynamicId);
		expect(paramsMetadata[2].name).toBe('Object');

		const inject3 = _getInjectedIdAt(D, 3);
		expect(inject3).toBeUndefined();
	});

	it('Should throw when applied with undefined', () => {
		function setup(x) {
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
