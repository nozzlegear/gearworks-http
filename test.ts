import * as boom from 'boom';
import * as gwv from 'gearworks-validation';
import * as joi from 'joi';
import BaseClient, { ApiError, isOkay } from './';
import {
    AsyncSetup,
    AsyncTeardown,
    AsyncTest,
    Expect,
    FocusTest,
    Test,
    TestFixture,
    Timeout
    } from 'alsatian';
import { AxiosResponse } from 'axios';
import { inspect } from 'logspect/bin';
import { Server } from 'http';
import Micro, * as MicroLib from "micro";

interface TestObject {
    hello: string;
    foo: boolean;
    bar: number;
    array: string[];
}

interface ServerResponse {
    body: TestObject;
    headers: Object;
}

const customHeaderKey = "General-Kenobi";
const customHeaderVal = "You are a bold one!";
const skippedHeaderKey = "skip-this-header";

function fakeAxiosResponse(error: boom.BoomError): AxiosResponse {
    return {
        data: error.output.payload,
        config: undefined,
        headers: undefined,
        status: error.output.statusCode,
        statusText: "Bad Data"
    }
}

@TestFixture("BaseClient tests")
export class ClientTestFixture extends BaseClient {
    constructor() {
        super("https://example.com", { "X-Powered-By": "Gearworks" })
    }

    private Obj: TestObject = {
        hello: "world",
        foo: true,
        bar: 12,
        array: ["hello", "world"]
    }

    private ObjSchema = gwv.object<TestObject>({
        hello: gwv.string(),
        foo: gwv.boolean(),
        bar: gwv.number(),
        array: gwv.date() // Fail validation on this property
    })

    @Test()
    public ParsesStringError() {
        // The default error parsing function is designed to parse boom errors with joi/gearworks-validation details, we'll use those as a basis.
        const validation = joi.validate(this.Obj, this.ObjSchema);
        const boomError = boom.badData(validation.error.message, validation.error.details);
        const json = JSON.stringify(boomError.output.payload);
        const error = this.parseErrorResponse(json, fakeAxiosResponse(boomError));

        Expect(error).toBeTruthy();
        Expect(error).toBeTruthy();
        Expect(error.message).toEqual(validation.error.message);
        Expect(error.status).toEqual(boomError.output.statusCode);
    }

    @Test()
    public ParsesObjectError() {
        // The default error parsing function is designed to parse boom errors with joi/gearworks-validation details, we'll use those as a basis.
        const validation = joi.validate(this.Obj, this.ObjSchema);
        const boomError = boom.badData(validation.error.message, validation.error.details);
        const error = this.parseErrorResponse(boomError.output.payload, fakeAxiosResponse(boomError));

        Expect(error).toBeTruthy();
        Expect(error).toBeTruthy();
        Expect(error.message).toEqual(validation.error.message);
        Expect(error.status).toEqual(boomError.output.statusCode);
    }

    @Test()
    public JoinsPaths() {
        const path = this.joinUriPaths(this.baseUrl, "/api/v1/webhooks");
        const path2 = this.joinUriPaths("/api/v1/webhooks");
        const path3 = this.joinUriPaths("/api/v1/", "test");
        const path4 = this.joinUriPaths("/api/v1/webhooks", "5.json");
        const path5 = this.joinUriPaths("/api/v1/webhooks", ".json");
        const path6 = this.joinUriPaths("/api/v1/webhooks", ".png");
        const path7 = this.joinUriPaths("", "/api/v1/webhooks");
        const path8 = this.joinUriPaths("", "", "/api/v1/webhooks");
        const path9 = this.joinUriPaths("///", "/api/v1/webhooks");
        const path10 = this.joinUriPaths("/", "/", "/api/v1/webhooks");

        Expect(path).toEqual("https://example.com/api/v1/webhooks");
        Expect(path2).toEqual("/api/v1/webhooks");
        Expect(path3).toEqual("/api/v1/test");
        Expect(path4).toEqual("/api/v1/webhooks/5.json");
        Expect(path5).toEqual("/api/v1/webhooks.json");
        Expect(path6).toEqual("/api/v1/webhooks.png");
        Expect(path7).toEqual("/api/v1/webhooks");
        Expect(path8).toEqual("/api/v1/webhooks");
        Expect(path9).toEqual("/api/v1/webhooks");
        Expect(path10).toEqual("/api/v1/webhooks");
    }
}

@TestFixture("OverriddenClient tests")
export class OverriddenClientTestFixture extends BaseClient {
    constructor() {
        super("https://example.com")
    }

    get status() {
        return 66;
    }

    get description() {
        return "It's treason then.";
    }

    get message() {
        return "I AM THE SENATE.";
    }

    parseErrorResponse(body?: string | Object, axiosResponse?: AxiosResponse) {
        return new ApiError(this.status, this.description, this.message);
    }

    @Test("Uses a custom error parsing function")
    public UsesCustomErrorParseFunction() {
        const error = this.parseErrorResponse(undefined, undefined);

        Expect(error.status).toEqual(this.status);
        Expect(error.status_text).toEqual(this.description);
        Expect(error.message).toEqual(this.message);
    }
}

@TestFixture("BaseClient request tests")
export class BaseClientRequestTestFixture extends BaseClient {
    constructor() {
        super("http://localhost:4000", { [customHeaderKey]: customHeaderVal, [skippedHeaderKey]: undefined });
    }

    private Server: Server;

    private get HeaderVal() {
        return "You are a bold one!"
    }

    @AsyncSetup
    async SetupServer() {
        this.Server = Micro(async (req, res) => {
            // Read the json and send it back with the headers.
            const json = await MicroLib.json(req);
            const headers = req.headers;
            const response: ServerResponse = {
                body: json as any,
                headers: headers
            };

            return JSON.stringify(response);
        })

        this.Server.listen(4000);
    }

    @AsyncTeardown
    async TeardownServer() {
        this.Server.close();
    }

    @AsyncTest()
    @Timeout(2000)
    public async MakesRequests() {
        const obj: TestObject = {
            hello: "world",
            foo: true,
            bar: 10,
            array: ["hello", "world"]
        }
        const response = await this.sendRequest<ServerResponse>("", "POST", { body: obj });

        Expect(response).toBeTruthy();
        Expect(response.body).toBeTruthy();
        Expect(response.headers).toBeTruthy();
        Expect(response.headers[customHeaderKey.toLowerCase()]).toEqual(customHeaderVal);
        Expect(response.headers[skippedHeaderKey.toLowerCase()]).not.toBeTruthy();
        Expect(response.body.hello).toEqual(obj.hello);
        Expect(response.body.foo).toEqual(obj.foo);
        Expect(response.body.bar).toEqual(obj.bar);
        Expect(Array.isArray(response.body.array)).toBe(true);
        Expect(response.body.array.every(s => obj.array.indexOf(s) > -1)).toBe(true);
    }
}

@TestFixture("ApiError tests")
export class ErrorFixture {
    @Test()
    public SetsUnauthorizedBool() {
        const description = "Unauthorized";
        const message = "You need to log in!";
        const status = 401;
        const error = new ApiError(status, description, message);

        Expect(error.unauthorized).toBe(true);
        Expect(error.message).toEqual(message)
        Expect(error.status_text).toEqual(description);
        Expect(error.status).toEqual(status);
    }
}