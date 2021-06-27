export { };

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Reflect {
        let decorate: (decorators: (PropertyDecorator | MethodDecorator | ClassDecorator)[], target: Object, targetKey?: string | symbol, descriptor?: PropertyDescriptor) => any;
        let defineMetadata: (metadataKey: any, metadataValue: any, target: Object, targetKey?: string | symbol) => void;
        let getMetadata: (metadataKey: any, target: Object, targetKey?: string | symbol) => any;
        let getOwnMetadata: (metadataKey: any, target: Object, targetKey?: string | symbol) => any;
        let hasOwnMetadata: (metadataKey: any, target: Object, targetKey?: string | symbol) => boolean;
        let hasMetadata: (metadataKey: any, target: Object, targetKey?: string | symbol) => boolean;
        let metadata: (metadataKey: any, metadataValue: any) => {
            (target: Function): void;
            (target: Object, targetKey: string | symbol): void;
        };
    }
}