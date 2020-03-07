import 'jasmine';
import {Injectable, PostConstruct} from './decorators';
import {Container} from './container';

let counter = 1;

describe('Simple Transient classes', () => {
	it('Should support class binding and retrieval', () => {
		@Injectable()
		class A {
			public constructor() {
				this.a = 'A';
				this.c = counter++;
			}

			public a: string;
			public c: number;
		}

		@Injectable()
		class B {
			public constructor() {
				this.b = 'B';
				this.c = counter++;
			}

			public b: string;
			public c: number;
		}

		const bSym = Symbol('B');
		const container = new Container();

		container.bindClass<A>(A);
		container.bindClass<A>('A', A);
		container.bindClass<B>(bSym, B);

		const a1 = container.get(A);
		expect(a1 instanceof A).toBeTruthy();
		expect(a1.a).toEqual('A');
		const a2 = container.get<A>('A');
		expect(a1 instanceof A).toBeTruthy();
		expect(a1.a).toEqual(a2.a);
		expect(a1.c === a2.c).toBeFalsy();
		const b1 = container.get<B>(bSym);
		expect(b1 instanceof B).toBeTruthy();
		expect(b1.b).toEqual('B');
	});
	it('Should throw if attempting to bind a non decorated class', () => {
		class A {
			public constructor(public a: string) {
			}
		}

		const container = new Container();

		function setup() {
			container.bindClass<A>(A);
		}

		expect(setup).toThrowError(/Class not decorated with @Injectable \[.+/);
	});
	it('Should throw if unregistered types are required for construction', () => {
		@Injectable()
		class A {
			public constructor(public a: any) {
			}
		}

		const container = new Container();
		container.bindClass<A>(A);

		function setup() {
			container.get(A);
		}

		expect(setup).toThrowError(/Symbol not bound:.+/);
	});
	it('Should throw if an unregistered types is requested', () => {
		@Injectable()
		class A {
			// noinspection JSUnusedLocalSymbols
			public constructor(private a: string) {
			}
		}

		class C {
			public constructor(public c: string) {
			}
		}

		const container = new Container();
		container.bindClass(A);

		function setup() {
			container.get(C);
		}

		expect(setup).toThrowError(/Symbol not bound:.+/);
	});
});
describe('Simple Singletons', () => {
	it('Should support class binding and retrieval', () => {
		@Injectable()
		class A {
			public constructor() {
				this.a = 'A';
				this.c = counter++;
			}

			public a: string;
			public c: number;
		}

		@Injectable()
		class B {
			public constructor(public a: A) {
				this.c = counter++;
			}

			public c: number;
		}

		const container = new Container();
		container.bindClass(A).asSingleton();
		container.bindClass(B);

		const b1 = container.get(B);
		expect(b1 instanceof B).toBeTruthy();
		expect(b1.a.a).toEqual('A');
		const b2 = container.get(B);
		expect(b2 instanceof B).toBeTruthy();
		expect(b1.c === b2.c).toBeFalsy();
		expect(b1.a.c === b2.a.c).toBeTruthy();
	});
});
describe('Constants', () => {
	it('Should support reflection of and direct access to constants', () => {
		@Injectable()
		class A {
			public constructor(public a: string) {
			}
		}

		const container = new Container();
		container.bindClass(A);
		container.bindConstant(String, 'hello');
		expect(container.isIdKnown(A)).toBeTruthy();

		const a = container.get(A);
		expect(a.a).toEqual('hello');
		const s = container.get(String);
		expect(s).toEqual(a.a);
	});
});
describe('Synchronous Factory', () => {
	it('Should support transient factories', () => {
		class A {
			public constructor(public c: number) {
			}
		}

		const aSym = Symbol('A');
		const container = new Container();
		container.bindFactory(aSym, () => {
			return new A(counter++);
		});

		const a1 = container.get<A>(aSym);
		const a2 = container.get<A>(aSym);
		expect(a1.c === a2.c).toBeFalsy();
	});
	it('Should support singleton factories', () => {
		class A {
			public constructor(public c: number) {
			}
		}

		const aSym = Symbol('A');
		const container = new Container();
		container.bindFactory(aSym, () => {
			return new A(counter++);
		}).asSingleton();

		const a1 = container.get<A>(aSym);
		const a2 = container.get<A>(aSym);
		expect(a1.c === a2.c).toBeTruthy();
	});
});
describe('PostConstruct execution', () => {
	it('Should support PostConstruct with dependencies', () => {
		@Injectable()
		class A {
			public constructor() {
			}

			public a: string;

			@PostConstruct()
			public init() {
				this.a = 'A';
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

		const b = container.get(B);
		expect(b.a.a).toEqual('A');
	});
});

describe('Container synchronous hierarchy', () => {
	it('Should be able to get services from parent container', () => {
		@Injectable()
		class A {
		}

		const root = new Container();
		root.bindClass('A', A);
		const child = new Container(root);
		const grandChild = new Container(child);

		expect(grandChild.get('A') instanceof A).toBeTruthy();
	});
});

describe('Synchronous error handling', () => {
	it('Failure to construct should allow ErrorHandler to recover', () => {
		@Injectable()
		class A {
			public constructor() {
				this.a = 'A';
			}

			public a: string;
		}

		@Injectable()
		class B extends A {
			public constructor() {
				super();
				throw new Error('Unable to construct B');
			}
		}

		class C extends A {
			public constructor() {
				super();
				this.a = 'C';
			}
		}

		const container = new Container();
		container.bindClass('A', B).onError((injector, id, maker, error, value) => {
			expect(id).toBe('A');
			expect(value).toBeUndefined();
			expect(error.message).toBe('Unable to construct B');
			return new C();
		});

		let result = container.get('A');
		expect(result instanceof A).toBeTruthy();
		expect(result instanceof B).toBeFalsy();
		expect(result instanceof C).toBeTruthy();
	});
	it('PostConstruct failure should invoke ErrorHandler with constructed object', () => {
		@Injectable()
		class A {
			public constructor() {
				this.a = 'A';
			}

			public a: string;

			@PostConstruct()
			public init() {
				throw new Error('Unable to initialize A');
			}
		}

		const container = new Container();
		let errorHandlerInvoked = false;
		container.bindClass(A).onError((injector, id: any, maker, error, value) => {
			expect(Object.is(injector, container)).toBeTruthy();
			expect(id.name).toBe('A');
			expect(error.message).toBe('Unable to initialize A');
			expect(value).toBeInstanceOf(A);
			expect(value.a).toBe('A');
			errorHandlerInvoked = true;
			return error;
		});

		try {
			container.get(A);
			fail('Should not be able to retrieve A');
		}
		catch (err) {
			expect(errorHandlerInvoked).toBeTruthy();
			expect(err.message).toBe('Unable to initialize A');
		}
	});
	it('PostConstruct failure should allow ErrorHandler to recover', () => {
		@Injectable()
		class A {
			public constructor() {
				this.a = 'A';
			}

			public a: string;

			@PostConstruct()
			public init() {
				throw new Error('Unable to initialize A');
			}
		}

		const container = new Container();
		let errorHandlerInvoked = false;
		container.bindClass(A).onError((injector, id: any, maker, error, value) => {
			expect(value).toBeInstanceOf(A);
			expect(value.a).toBe('A');
			errorHandlerInvoked = true;
			value.a = 'B';
			return value;
		});

		try {
			let result = container.get(A);
			expect(errorHandlerInvoked).toBeTruthy();
			expect(result.a).toBe('B');
		}
		catch (err) {
			fail('Should have been able to recover from PostConstruct failure');
		}
	});
});
