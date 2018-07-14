import "reflect-metadata";
import { TOKEN_KEY } from "./decorators";
import { Constructor, InjectionToken, Provider, Scope, TokenRegistry } from "./types";

export class Container {

  public static getInstance() {
    return this.instance;
  }

  public static newContainer() {
    return new Container();
  }

  private static readonly instance = new Container();

  private readonly instances = new Map<InjectionToken<any>, any>();
  private readonly dependencies = new Map<InjectionToken<any>, Provider<any>>();

  public resolve<T>(type: Constructor<T>): T {
    const provider = this.dependencies.get(type);
    if (!provider) {
      throw new Error(`Error resolving type ${type.name}`);
    }
    return provider();
  }

  public singletonProvider<T>(type: InjectionToken<T>, provider: Provider<T>) {
    return () => {
      if (!this.instances.has(type)) {
        this.instances.set(type, provider());
      }
      return this.instances.get(type);
    };
  }

  public provide<T>(type: InjectionToken<T>, provider: Provider<T>, scope: Scope = Scope.Singleton) {
    if (this.dependencies.has(type)) {
      throw new Error(`Type ${type} already has a registered provider`);
    }
    switch (scope) {
      case Scope.Singleton:
        this.dependencies.set(type, this.singletonProvider(type, provider));
        break;
      case Scope.Prototype:
        this.dependencies.set(type, provider);
        break;
    }
  }

  public register<T>(type: Constructor<T>, scope: Scope) {
    this.provide(type, () => this.create(type), scope);
  }

  private create<T>(ctor: Constructor<T>) {
    const params = this.getParams(ctor);
    return new ctor(
      ...params.map((dependency: Constructor<any>) => this.resolve(dependency)),
    );
  }

  private getParams<T>(ctor: Constructor<T>) {
    const params: Array<Constructor<T>> = Reflect.getOwnMetadata("design:paramtypes", ctor) || [];
    const injectionTokens: TokenRegistry<T> = Reflect.getOwnMetadata(TOKEN_KEY, ctor) || {};

    Object.keys(injectionTokens).forEach((paramIdx) => params[+paramIdx] = injectionTokens[paramIdx]);
    return params;
  }
}