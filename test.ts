import * as boom from 'boom';
import * as gwv from 'gearworks-validation';
import * as joi from 'joi';
import BaseClient, { ApiError, isOkay } from './';
import {
    AsyncTest,
    Expect,
    Test,
    TestFixture
    } from 'alsatian';
import { AxiosResponse } from 'axios';

interface TestObject {
    hello: string;
    foo: boolean;
    bar: number;
    baz: string[];
}

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
        baz: ["hello", "world"]
    }

    private ObjSchema = gwv.object<TestObject>({
        hello: gwv.string(),
        foo: gwv.boolean(),
        bar: gwv.number(),
        baz: gwv.date() // Fail validation on this property
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

    protected parseErrorResponse(body?: string | Object, axiosResponse?: AxiosResponse) { 
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