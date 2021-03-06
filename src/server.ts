import * as fastify from "fastify";
import {
    DefaultHeaders,
    DefaultParams,
    DefaultQuery,
    FastifyReply,
    FastifyRequest,
    RouteSchema,
    ServerOptions,
} from "fastify";

import { IncomingMessage, Server, ServerResponse } from "http";
import { AddressInfo } from "net";
import "reflect-metadata";
import { Constructor, Container, Provider, Scope } from "./dependency-injection";

const API_TOKEN = "__api_token";
const ROUTE_TOKEN = "__api_token";

type HttpRequest = FastifyRequest<IncomingMessage, DefaultQuery, DefaultParams, DefaultHeaders, any>
    & { validationError?: string; };

type HttpResponse = FastifyReply<ServerResponse>;

interface ServerOpts extends ServerOptions {
    readonly port?: number;
    readonly address?: string;
}

interface ApiMeta {
    readonly path: string;
}

interface RouteBinding {
    readonly apiMeta: ApiMeta;
    readonly routesMeta: RouteMeta[];
    readonly instance: any;
}

interface RouteMeta {
    readonly method: HttpMethod;
    readonly path: string;
    readonly key: string;
    readonly descriptor: TypedPropertyDescriptor<RouteFn>;
    readonly schema: RouteSchema;
}

const isHttpError = (arg: any): arg is HttpError => arg instanceof Error && arg.hasOwnProperty("code");

export type RouteFn = (exchange: Exchange) => any | void;
export type AsyncRouteFn = (exchange: Exchange) => Promise<any | void>;

export type RouteMethodDescriptor = TypedPropertyDescriptor<RouteFn> | TypedPropertyDescriptor<AsyncRouteFn>;

export interface Exchange {
    readonly request: HttpRequest;
    readonly response: HttpResponse;
}

export interface HttpErrorResponse {
    readonly statusCode: number;
    readonly error: string;
}

export enum HttpMethod {
    OPTIONS = "options",
    HEAD = "head",
    GET = "get",
    POST = "post",
    PUT = "put",
    PATCH = "patch",
    DELETE = "delete",
}

export class HttpError extends Error {
    constructor(public readonly code: number, message: string) {
        super(message);
    }
}

export function api<T>(path: string = "") {
    return (ctor: Constructor<T>) => {
        Reflect.defineMetadata(API_TOKEN, { path }, ctor);
        Container.getInstance().register(ctor, Scope.Singleton);
    };
}

export function route(method: HttpMethod, path: string = "", schema?: RouteSchema) {
    return (target: object, key: string, descriptor: RouteMethodDescriptor) => Reflect
        .defineMetadata(ROUTE_TOKEN, [
            ...(Reflect.getMetadata(ROUTE_TOKEN, target) || []), { method, path, key, descriptor, schema },
        ], target);
}

export class HttpServer {

    public static getInstance = () => HttpServer.instance;
    private static readonly instance = new HttpServer(Container.getInstance());

    private bindings: RouteBinding[] = [];
    private app?: fastify.FastifyInstance<Server, IncomingMessage, ServerResponse>;

    public constructor(private readonly container: Container) { }

    public api<T>(ctor: Constructor<T>) {
        const instance = this.container.resolve(ctor);
        const apiMeta: ApiMeta = Reflect.getMetadata(API_TOKEN, ctor);
        const routesMeta: RouteMeta[] = Reflect.getMetadata(ROUTE_TOKEN, instance) || [];

        this.bindings.push({ apiMeta, routesMeta, instance });
        return this;
    }

    public registerProvider<T>(
        providerCtor: Constructor<Provider<T | PromiseLike<T>>>,
        scope: Scope = Scope.Singleton,
    ) {
        this.container.registerProvider(providerCtor, scope);
        return this;
    }

    public getApp() {
        return this.app;
    }

    public getServer() {
        return this.app ? this.app.server : undefined;
    }

    public async start(serverOptions?: ServerOpts) {

        this.app = fastify(serverOptions);
        this.app.setErrorHandler((error, _, response) => {
            const statusCode = isHttpError(error) ? error.code : 500;
            const responseBody: HttpErrorResponse = {
                statusCode,
                error: error.message,
            };
            response.code(statusCode).send(responseBody);
        });

        this.bindings.forEach(({ routesMeta, apiMeta, instance }) => {
            routesMeta.forEach((meta) => {
                const opts = { schema: meta.schema, attachValidation: true };
                const fullPath = `${apiMeta.path}${meta.path}`;
                this.app![meta.method](fullPath, opts, async (request, response) => {
                    const exchange: Exchange = { request, response };
                    if (exchange.request.validationError) {
                        throw new HttpError(400, exchange.request.validationError);
                    } else {
                        await meta.descriptor.value!.apply(instance, [exchange]);
                    }
                });
            });
        });

        const port = serverOptions && serverOptions.port ? serverOptions.port : 0;
        const address = serverOptions && serverOptions.address ? serverOptions.address : "0.0.0.0";

        try {
            await this.app.listen(port, address);
            const addressInfo = this.app.server.address() as AddressInfo;
            this.app.log.info(`Server started [port=${addressInfo.port}]`);
        } catch (err) {
            this.app.log.error(err);
            process.exit(1);
        }
    }

    public async stop() {

        if (!this.app) {
            throw new Error("App is not running");
        }

        return new Promise((resolve) => {
            this.app!.close(() => {
                this.app!.log.info("Server stopped");
                resolve();
            });
        });
    }
}
