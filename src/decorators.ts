/**
 * These decorators all apply the information they collect (whether class, method, or parameter data) as tagged metadata on the class's constructor
 */
import 'reflect-metadata';
import {InjectableId} from './injector';
import {INJECT_METADATA_KEY, INJECTABLE_METADATA_KEY, OPTIONAL_METADATA_KEY, POSTCONSTRUCT_ASYNC_METADATA_KEY, POSTCONSTRUCT_SYNC_METADATA_KEY, REFLECT_RETURN} from './constants';

// Help user locate misapplied decorators.
function targetHint(target: Function) {
	let hint;
	if (target) {
		hint = target.name;
		if ((!hint) && target.constructor) {
			hint = target.constructor.name;
		}
	}
	return hint;
}

// Validate that 'target' is a class constructor function.
function isClassConstructor(target: any) {
	if (typeof target === 'function') {
		if (target.hasOwnProperty('prototype')) {
			if (target.prototype.constructor === target) {
				return true;
			}
		}
	}
	return false;
}

// Ensure consistency in our meta-data name getting/setting.
function makeParamIdxKey(idx: number): string {
	return `index-${idx}`;
}

// Validate that the specified target is a parameter of a class constructor
function validateConstructorParam(decorator: string, target: Function, idx: number): string {
	if (!isClassConstructor(target)) {
		throw new Error('@' + decorator + ' is not valid here [' + targetHint(target) + ']');
	}
	return makeParamIdxKey(idx);
}

// Validate the decorator was only applied once.
function validateSingleConstructorParam(decorator: string, target: Function, idx: number): string {
	let propKey = validateConstructorParam(decorator, target, idx);
	if (Reflect.hasOwnMetadata(decorator, target, propKey)) {
		throw new Error('@' + decorator + ' applied multiple times [' + target.constructor.name + ']');
	}
	return propKey;
}

/**
 * Placed just before the class declaration, this class decorator applies metadata to the class constructor indicating that the user intends to bind the class into the container.
 * This decorator will throw if not placed on a class declaration, or if placed more than once on a class declaration.
 */
export function Injectable() {
	/**
	 * @param target   The constructor function of the class that is being decorated
	 * @returns Undefined (nothing), as this decorator does not modify the constructor in any way.
	 */
	return function (target: Function) {
		if (Reflect.hasOwnMetadata(INJECTABLE_METADATA_KEY, target)) {
			throw new Error('@Injectable applied multiple times [' + targetHint(target) + ']');
		}
		Reflect.defineMetadata(INJECTABLE_METADATA_KEY, true, target);
	};
}

/**
 * Placed just before a constructor parameter, this parameter decorator allows for specificity and control over the type of the type of Object that will be injected into the parameter.
 * In the absence of this decorator the container will use whatever is bound to a parameter's type (or throw an error if it is unable to recognize the type).
 * @param id  The identifier of the bound type that should be injected.
 */
export function Inject(id: InjectableId<any>) {
	/**
	 * @param target  The constructor function of the class (we don't allow @Inject on anything else).
	 * @param parameterName The name of the parameter
	 * @param parameterIndex The ordinal index of the parameter in the function’s parameter list
	 * @returns Undefined (nothing), as this decorator does not modify the parameter in any way.
	 */
	return function (target: Function, parameterName: string | symbol, parameterIndex: number) {
		let hint = targetHint(target);
		if (id === undefined) {
			throw new Error('Undefined id passed to @Inject [' + hint + ']');
		}
		let paramKey = validateSingleConstructorParam('Inject', target, parameterIndex);
		Reflect.defineMetadata(INJECT_METADATA_KEY, id, target, paramKey);
	};
}

/**
 * This is a helper function used by the container to retrieve the @Inject metadata for a specifically indexed constructor parameter
 * @param target  The constructor function of the class (we don't allow @Inject on anything else).
 * @param parameterIndex    The ordinal index of the parameter in the constructor’s parameter list
 * @see Inject
 */
export function _getInjectedIdAt(target: any, parameterIndex: number): InjectableId<any> {
	return Reflect.getMetadata(INJECT_METADATA_KEY, target, makeParamIdxKey(parameterIndex));
}

/**
 * Placed just before a constructor parameter, this parameter decorator signals the container that it should supply the 'alt' constant value (undefined by default) if for *any* reason it is unable to otherwise resolve the type of the parameter.
 * WARNING!  It is your responsibility to ensure that alt is of the appropriate type/value.
 */
export function Optional(alt?: any) {
	/**
	 * @param target  The constructor function of the class (we don't allow @Optional on anything else).
	 * @param parameterName The name of the parameter
	 * @param parameterIndex The ordinal index of the parameter in the function’s parameter list
	 * @returns Undefined (nothing), as this decorator does not modify the parameter in any way.
	 */
	return function (target: Function, parameterName: string | symbol, parameterIndex: number) {
		let paramKey = validateSingleConstructorParam('Optional', target, parameterIndex);
		Reflect.defineMetadata(OPTIONAL_METADATA_KEY, {value: alt}, target, paramKey);
	};
}

/**
 * This is a helper function used by the container to retrieve the @Optional metadata for a specifically indexed constructor parameter
 * @param target  The constructor function of the class (we don't allow @Optional on anything else).
 * @param parameterIndex    The ordinal index of the parameter in the constructor’s parameter list
 * @see Optional
 * @returns an object containing the value provided in the decorator, or undefined if no annotation was present.
 */
export function _getOptionalDefaultAt(target: any, parameterIndex: number): { value: any } {
	return Reflect.getMetadata(OPTIONAL_METADATA_KEY, target, makeParamIdxKey(parameterIndex)); // See the @Optional decorator before making any changes here.
}

/**
 * Placed just before a class method, this method decorator flags a method that should be called after an object has been instantiated by the container, but before it is put into service.
 * The method will be assumed to be synchronous unless the method signature explicitly declares it's return type to be ": Promise<something>"
 * This decorator will throw if placed on a non-method or a static method of a class, or if placed on a method more than once, or if placed on more than one method for a class.
 */
export function PostConstruct() {
	/**
	 * @param prototypeOrConstructor   The prototype of the class (we don't allow @PostConstruct on anything other than a class instance method.
	 * @param methodName   The name of the method.
	 * @param descriptor   The Property Descriptor for the method.
	 * @returns Undefined (nothing), as this decorator does not modify the method in any way.
	 */
	// noinspection JSUnusedLocalSymbols
	return function (target: any, methodName: string, descriptor: PropertyDescriptor) {
		if (typeof target !== 'object' || typeof target.constructor !== 'function') {
			throw new Error('@PostConstruct not applied to instance method [' + target + '/' + methodName + ']');
		}
		if (Reflect.hasOwnMetadata(POSTCONSTRUCT_SYNC_METADATA_KEY, target.constructor) || Reflect.hasOwnMetadata(POSTCONSTRUCT_ASYNC_METADATA_KEY, target.constructor)) {
			throw new Error('@PostConstruct applied multiple times [' + targetHint(target.constructor) + ']');
		}
		let rt = Reflect.getMetadata(REFLECT_RETURN, target, methodName);
		if (typeof rt === 'function') {
			Reflect.defineMetadata(POSTCONSTRUCT_ASYNC_METADATA_KEY, methodName, target.constructor);
		}
		else {
			Reflect.defineMetadata(POSTCONSTRUCT_SYNC_METADATA_KEY, methodName, target.constructor);
		}
	};
}
