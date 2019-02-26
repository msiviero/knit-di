# Typescript lightweight dependency injection container and http server framework

## Installation

```
npm i @msiviero/knit
```

## Dependency injection

Base usage is simple as:

```typescript
import { Container, injectable } from "@msiviero/knit";

@injectable()
class EmailService {
  public sendEmail(recipient: string) {
    // omitted
  }
}

@injectable()
class MyApplication {

  constructor(private readonly emailService: EmailService) { }

  public run() {
    this.emailService.sendEmail("example@gmail.com");
  }
}

const app = Container.getInstance().resolve(MyApplication);

app.run();
```

Note that all instances all singleton by default

## Injection scope

Pass desired scope as decorator parameter

```typescript

@injectable(Scope.Prototype)
class EmailService {
  public sendEmail(recipient: string) {
    // omitted
  }
}
```

## Register custom provider

```typescript

@provider<EmailService>(EmailService, Scope.Prototype)
export class EmailServiceProvider {
    public provide = () => new EmailService();
}

@injectable()
class MyApplication {
  constructor(public readonly emailService: EmailService) { }
}
```

## Register interface provider

```typescript

interface EmailService {
  sendEmail: (recipient: string) => void;
}

@provider<EmailService>(EmailService, Scope.Prototype)
export class EmailServiceProvider {
    public provide = () => ({
      sendEmail: (recipient: string) => {
        // omitted
      }
    });
}

@injectable()
class MyApplication {
  constructor(@inject("EmailService") public readonly emailService: EmailService) { }
}
```

## Http server

```typescript

import { injectable } from "./dependency-injection";
import { api, Exchange, HttpMethod, HttpServer, route } from "./server";

@injectable()
class TestService {
    public readonly who: string = "world";
}

@api()
class ApiClass {

    constructor(
        private readonly testService: TestService,
    ) { }

    @route(HttpMethod.GET, "/hello")
    public async getEndpoint(exchange: Exchange) {
        exchange.response.send({ hello: this.testService.who });
    }
}

HttpServer
    .getInstance()
    .api(ApiClass)
    .start(0);
```

## Http endpoint testing

```typescript

describe("Http server custom instance", () => {

    const container = new Container()
        .register(ApiClass, Scope.Singleton)
        .registerProvider("service:test", class implements Provider<TestService> {
            public provide = () => new TestService("world2");
        }, Scope.Singleton);

    const httpServer = new HttpServer(container)
        .api(ApiClass);

    beforeAll(() => httpServer.start(0));
    afterAll(() => httpServer.stop());

    it("should register endpoint and serve requests", async () => {

        const response = await supertest(httpServer.app.server)
            .get("/hello")
            .expect(200)
            .expect("Content-Type", "application/json; charset=utf-8");

        expect(response.text).toEqual(JSON.stringify({ hello: "world2" }));
    });
});
```

## Benchmarks (MacBook Pro 2,2 GHz Intel Core i7 16GB ram)
```shell
npx autocannon -c1000 -l http://127.0.0.1:62880/hello
npx: installed 34 in 1.485s
Running 10s test @ http://127.0.0.1:62880/hello
1000 connections

┌─────────┬────────┬────────┬────────┬────────┬───────────┬──────────┬───────────┐
│ Stat    │ 2.5%   │ 50%    │ 97.5%  │ 99%    │ Avg       │ Stdev    │ Max       │
├─────────┼────────┼────────┼────────┼────────┼───────────┼──────────┼───────────┤
│ Latency │ 122 ms │ 125 ms │ 179 ms │ 191 ms │ 130.66 ms │ 16.02 ms │ 382.01 ms │
└─────────┴────────┴────────┴────────┴────────┴───────────┴──────────┴───────────┘
┌───────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
│ Stat      │ 1%      │ 2.5%    │ 50%     │ 97.5%   │ Avg     │ Stdev   │ Min     │
├───────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│ Req/Sec   │ 6283    │ 6283    │ 7863    │ 8019    │ 7611.82 │ 587.38  │ 6281    │
├───────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│ Bytes/Sec │ 1.03 MB │ 1.03 MB │ 1.29 MB │ 1.32 MB │ 1.25 MB │ 96.4 kB │ 1.03 MB │
└───────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘

Req/Bytes counts sampled once per second.

┌────────────┬──────────────┐
│ Percentile │ Latency (ms) │
├────────────┼──────────────┤
│ 0.001      │ 117          │
├────────────┼──────────────┤
│ 0.01       │ 117          │
├────────────┼──────────────┤
│ 0.1        │ 119          │
├────────────┼──────────────┤
│ 1          │ 121          │
├────────────┼──────────────┤
│ 2.5        │ 122          │
├────────────┼──────────────┤
│ 10         │ 123          │
├────────────┼──────────────┤
│ 25         │ 124          │
├────────────┼──────────────┤
│ 50         │ 125          │
├────────────┼──────────────┤
│ 75         │ 129          │
├────────────┼──────────────┤
│ 90         │ 143          │
├────────────┼──────────────┤
│ 97.5       │ 179          │
├────────────┼──────────────┤
│ 99         │ 191          │
├────────────┼──────────────┤
│ 99.9       │ 297          │
├────────────┼──────────────┤
│ 99.99      │ 381          │
├────────────┼──────────────┤
│ 99.999     │ 382          │
└────────────┴──────────────┘

84k requests in 11.14s, 13.7 MB read
```