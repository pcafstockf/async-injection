# Async-Injection
[![Actions Status](https://github.com/pcafstockf/async-injection/workflows/CI/badge.svg)](https://github.com/pcafstockf/async-injection/actions)
[![Actions Status](https://github.com/pcafstockf/async-injection/workflows/NPM%20Publish/badge.svg)](https://github.com/pcafstockf/async-injection/actions)
[![npm version](https://badge.fury.io/js/async-injection.svg)](https://badge.fury.io/js/async-injection)
[![Actions Status](https://david-dm.org/pcafstockf/async-injection.svg)](https://github.com/pcafstockf/async-injection/package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A robust lightweight dependency injection library for TypeScript.

## About
Async-Injection is a small IoC container with support for both synchronous and asynchronous dependency injection, as well as isolated and/or hierarchical scopes.

## Installation

You can get the latest release using npm:

```
$ npm install async-injection --save
```

## Basic Usage (synchronous)
Here we 'get' a new transaction handling object, that itself, relies on a shared service:

```typescript
@Injectable()
class SharedService {
    constructor(@Inject('LogLevel') @Optional('warn') private logLevel: string) { }
}

@Injectable()
class TransactionHandler {
    constructor(svc: SharedService) { }
}

// Create a simple container (we will bind providers into it).
const container = new Container();

// A single instance will be created and shared by everyone.
container.bindClass(SharedService).asSingleton();

// A new instance will be created each time one is requested.
container.bindClass(TransactionHandler);

// If we omit this line, the logLevel of SharedService will be initialized to 'warn'
container.bindConstant('LogLevel', 'info');

// In our request processing code (which would be an anti-pattern)...
// Instantiate a new transaction handler (it will be injected with the shared service).
const tx = container.get(TransactionHandler);
```
**NOTE:**  
The examples in this ReadMe are contrived to quickly communicate concepts and usage.  
Your real world project should of course follow best practices like [separation of concerns](https://medium.com/machine-words/separation-of-concerns-1d735b703a60), having a [composition root](https://medium.com/@cfryerdev/dependency-injection-composition-root-418a1bb19130), and should avoid anti-patterns like [service locator](http://scotthannen.org/blog/2018/11/27/stop-worrying-love-service-locator.html).

## Scopes
Scopes can be created using multiple Containers, and/or a hierarchy of Containers.

## IoC Modules
Why reinvent the wheel?  TypeScript is great!  
Implement the "module" you want and just import it:

`my-http-ioc-module.ts`
```typescript
import {myContainer} from './app';
import {Logger, HttpClient} from './services';
import {HttpClientGotWrapper} from './impl';

myContainer.bind(Logger).asSingleton();
myContainer.bind(HttpClient, HttpClientGotWrapper);
```

## Asynchronous Support
For simplicity, it is recommended that you use traditional synchronous injection for any class where that is possible.  
But when that's just to much work, you can "blend" synchronous and asynchronous injection.
To support "blending", we introduce three new methods on the `Container` which will be explained below.

## Asynchronous Usage
Perhaps in the example above, our `SharedService` is useless until it has established a database connection.  
Of course such a simple scenario could easily be handled in user-land code, but as application complexity grows, this becomes more tedious and difficult to maintain.  
Let's modify the example as follows:
```typescript
@Injectable()
class SharedService {
    constructor() { }
    connect(): Promise<void> { ... }
}

const container = new Container();

// Bind a factory function that awaits until it can fully create a SharedService.
container.bindAsyncFactory(SharedService, async () => {
    let svc = new SharedService();
    return await svc.connect();
}).asSingleton();

// A new transient instance will be created each time one is requested.
container.bindClass(TransactionHandler);    

// Wait for all bound asynchronous factory functions to complete.
// This step is optional.  You could omit and use Container.resolve instead (see alternative below).
await container.resolveSingletons(true);
// We are now connected to the database

// In our request processing code...
const tx = container.get(TransactionHandler);
```
As an alternative, we could **remove** the call to `Container.resolveSingletons`, and in our request processing code, simply call `Container.resolve`.
```typescript
const tx = await container.resolve(TransactionHandler);
```

## Important - Container.resolve vs Container.get
Blending synchronous and asynchronous injection adds complexity to your application.  
The key to successful blending is to think of the object you are requesting, not as an object, but as a tree of objects with your object at the top.  
Keep in mind that you may have **transient** objects which need to be created each time, as well as existing **singleton** objects in your dependency tree.  
If you know ahead of time that every object which you depend on is immediately (synchronously) available, **or** if they are asynchronous **singletons** which have already been resolved (via `Container.resolveSingletons`, or a previous call to `Container.resolve`), then no need to wait, you can just `Container.get` the tree.  
Otherwise you need to await the full resolution of the tree with `await Container.resolve`.  

## @PostConstruct Support
It is not always possible to fully initialize your object in the class constructor.
This (albeit contrived) demo shows that the `Employee` class is not yet initialized when the `Person` subclass tries to call the overridden `state` method.
```typescript
class Person {
	public constructor() { this.describe(); }
	protected state() { return "relaxing"; }
	public describe() { console.log("Hi I'm '" + this.state() + "'"); }
}
class Employee extends Person {
	constructor(private manager: boolean) {	super(); }
	protected state() { return this.manager ? "busy" : "producing"; }
}
// This will print: 
//  "Hi I'm 'producing", even though the author probably expected 
//  "Hi I'm busy", because they passed true for the 'manager' parameter.
new Employee(true); 
```
Can we refactor code to work around this?  Sure.  You may have to submit a couple of PR's, re-write legacy code that has no unit tests, trash encapsulation, skip a few nights sleep, etc.  But why?  
A PostConstruct annotation ensure's your initialization method is working on a fully constructed version of your object.
Even better, since constructors cannot be asynchronous, PostConstruct gives you an easy way to asynchronously prepare an object before it's put into service.

## @PostConstruct Usage
Post construction methods can be either synchronous or asynchronous.

```typescript
class A {
    public constructor() { }

    // Called before the object is placed into the container (or is returned from get/resolve)
    @PostConstruct()
    public init(): void { ... } 
}
class D {
    public constructor() { }

    // Will not be placed into the container (or returned) until the Promise has been resolved.
    @PostConstruct()
    public init(): Promise<void> { ... }    
}
```

### @PostConstruct Guidelines:
- Ensure your post construction method signature properly **declares** it's return type.  
**WARNING!**  An unspecified return type signature where the type is implied by `return new Promise(...)` is not sufficient!  You must explicitly declare the return type.  
- `Container.get` will throw an exception if you try to retrieve a class with `@PostConstruct` on a method that returns a `Promise`, but which does not **declare** it's return type to be `Promise`.
- The library will not invoke @PostConstruct on an object returned from a factory.  It is the factory's responsibility to construct and initialize before returning.
- You will likely want a `Container.resolveSingletons(true)` call between your last `Container.bindXXX()` call and any `Container.get` call.

## API Overview
Async-Injection tries to follow the common API patterns found in most other DI implementations.  Please refer to the examples above or the linked elements below for specific syntax.
- The 
[Container](https://pcafstockf.github.io/async-injection/api-docs/container.html) class implements a 
[Binder](https://pcafstockf.github.io/async-injection/api-docs/binder.html) interface, which allows you to bind a 
[Constant](https://pcafstockf.github.io/async-injection/api-docs/container.html#bindconstant), 
[Factory](https://pcafstockf.github.io/async-injection/api-docs/container.html#bindfactory), 
[AsyncFactory](https://pcafstockf.github.io/async-injection/api-docs/container.html#bindasyncfactory), or 
[Class](https://pcafstockf.github.io/async-injection/api-docs/container.html#bindclass) value to an 
[InjectableId](https://pcafstockf.github.io/async-injection/api-docs/globals.html#injectableid) (aka key) within a 
[Container](https://pcafstockf.github.io/async-injection/api-docs/container.html).
- The 
[Container](https://pcafstockf.github.io/async-injection/api-docs/container.html) also implements an 
[Injector](https://pcafstockf.github.io/async-injection/api-docs/injector.html) interface which allows you to synchronously 
[get](https://pcafstockf.github.io/async-injection/api-docs/container.html#get) or asynchronously 
[resolve](https://pcafstockf.github.io/async-injection/api-docs/container.html#resolve) anything that has been bound.
- When binding a 
[Factory](https://pcafstockf.github.io/async-injection/api-docs/container.html#bindfactory), 
[AsyncFactory](https://pcafstockf.github.io/async-injection/api-docs/container.html#bindasyncfactory) or 
[Class](https://pcafstockf.github.io/async-injection/api-docs/container.html#bindclass) to an 
[InjectableId](https://pcafstockf.github.io/async-injection/api-docs/globals.html#injectableid), you can chain the result of the call to specify the binding as a 
[Singleton](https://pcafstockf.github.io/async-injection/api-docs/bindas.html#assingleton), and/or configure an 
[Error Handler](https://pcafstockf.github.io/async-injection/api-docs/bindas.html#onerror).
- Containers may be nested by passing a parent Container to the 
[constructor](https://pcafstockf.github.io/async-injection/api-docs/container.html#constructor) of a child Container.
- To bind a 
[Class](https://pcafstockf.github.io/async-injection/api-docs/container.html#bindclass) into the 
[Container](https://pcafstockf.github.io/async-injection/api-docs/container.html), you must add the 
[@Injectable](https://pcafstockf.github.io/async-injection/api-docs/globals.html#injectable) decorator (aka annotation) to your class (see examples above).
- You may optionally add a 
[@PostConstruct](https://pcafstockf.github.io/async-injection/api-docs/globals.html#postconstruct) decorator to a method of your class to perform synchronous or asynchronous initialization of a new instance.
- By default, Async-Inject will examine the parameters of a class constructor and do it's best to match those to bound 
[InjectableIds](https://pcafstockf.github.io/async-injection/api-docs/globals.html#injectableid).  
- You may use the 
[@Inject](https://pcafstockf.github.io/async-injection/api-docs/globals.html#inject) decorator to explicitly declare which 
[InjectableId](https://pcafstockf.github.io/async-injection/api-docs/globals.html#injectableid) should be used (generally required for a 
[Constant](https://pcafstockf.github.io/async-injection/api-docs/container.html#bindconstant) binding as in the logLevel example above).
- The 
[@Optional](https://pcafstockf.github.io/async-injection/api-docs/globals.html#optional) decorator allows you to specify a default value for a class constructor parameter in the event that no matching 
[InjectableId](https://pcafstockf.github.io/async-injection/api-docs/globals.html#injectableid) can be found.
- The Container's 
[resolveSingletons](https://pcafstockf.github.io/async-injection/api-docs/container.html#resolvesingletons) method may be used to wait for any bound asynchronous [Singletons](https://en.wikipedia.org/wiki/Singleton_pattern) to finish initialization before continuing execution of your application.

## Acknowledgements
Thanks to all the contributors at [InversifyJS](https://github.com/inversify/InversifyJS).  It is a powerful, clean, flexible, inspiring design.

Thanks to everyone at [NestJS](https://docs.nestjs.com/fundamentals/async-providers) for giving us Asynchronous providers.

Thanks to Darcy Rayner for describing a [DI implementation](https://dev.to/darcyrayner/typescript-dependency-injection-in-200-loc-12j7) so simply and clearly.

Thanks to Carlos Delgado for the idea of a ["QuerablePromise"](https://ourcodeworld.com/articles/read/317/how-to-check-if-a-javascript-promise-has-been-fulfilled-rejected-or-resolved) which allowed us to blend asynchronous DI with the simplicity of synchronous DI.

## MIT License

Copyright (c) 2020 Frank Stock

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
