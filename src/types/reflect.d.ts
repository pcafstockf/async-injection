/**
 * Polyfill-agnostic ambient augmentation of the global Reflect object.
 * This file is intentionally a global ambient file which declares only the metadata API methods used by this library.
 * The application must provide runtime implementation via whichever reflect-metadata-compatible polyfill it chooses:
 * - reflect-metadata           (https://www.npmjs.com/package/reflect-metadata)
 * - core-js/es7/reflect        (https://www.npmjs.com/package/core-js)
 * - @abraham/reflection        (https://www.npmjs.com/package/@abraham/reflection)
 */
declare namespace Reflect {
	function getMetadata(metadataKey: unknown, target: object, propertyKey?: string | symbol): unknown;
	function defineMetadata(metadataKey: unknown, metadataValue: unknown, target: object, propertyKey?: string | symbol): void;
	function hasOwnMetadata(metadataKey: unknown, target: object, propertyKey?: string | symbol): boolean;
}
