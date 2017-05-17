# gearworks-http
A standardized HTTP client used by Gearworks apps, backed by Axios. [Gearworks](https://github.com/nozzlegear/gearworks) is the best way to get started with building Shopify applications!

## Installing

You can install this package from NPM with the NPM CLI or with Yarn (recommended):

```bash
# With NPM
npm install gearworks-http --save

# With Yarn
yarn add gearworks-http
```

## Importing

You can import the BaseClient via require or TypeScript's import:

```typescript
// Import with TypeScript or ES6
import BaseClient from "gearworks-http";

// Import via Node's require:
const BaseClient = require("gearworks-http").default;
```

## Usage

This package provides a base, abstract client for you to extend with your own custom logic. When constructing your class, you need to make a call to the base client with `super(baseUrl, defaultHeaders?, proxy?)`, passing along the `baseUrl` and two other optional variables (documented below) for all requests made by your class.

```typescript
import BaseClient from "gearworks-http";

export class MyClientClass extends BaseClient {
    constructor() {
        super("http://example.com/api", { 
            "X-Custom-Header-Name": "custom header value sent with each request"
        })
    }

    public getFooObject(id: string) => this.sendRequest<FooType>(`foos/${id}`, "GET");

    public listFooObjects(page: number = 1) => this.sendRequest<FooType>(`foos`, "GET", { 
        qs: {
            page: page
        }
    });

    public createFooObject(foo: FooType) => this.sendRequest<FooType>(`foos`, "POST", { 
        body: foo 
    });

    public updateFooObject(id: string, foo: FooType) => this.sendRequest<FooType>(`foos/${id}`, "PUT", { 
        body: foo 
    });

    public deleteFooObject(id: string) => this.sendRequest<void>(`foos/${id}`, "DELETE");
}
```

The `this.sendRequest<T>` function returns a promise that can be awaited when using TypeScript or Babel, and will throw an `ApiError` when the server responds with a status code that isn't OK.

### BaseClient.Constructor

The abstract BaseClient class should be extended by your own custom API client classes. When extending the BaseClient, you need to call `super()` which accepts the following function:

|Variable|Type|Required|Description|Example|
|--------|----|--------|-----------|-------|
|`baseUrl`|string|true|A base URL string (relative or absolute) that will be used for all requests made with this particular instance.|`"http://localhost:3000"`|
|`headers`|object|false|An object containing headers, e.g. auth headers, that will be sent along with all requests.|`{ 'header-name': 'custom header value' }`|
|`proxy`|object|false|An Axios proxy config object that will be used for all requests. Useful for debugging requests with e.g. [Fiddler](http://www.telerik.com/fiddler)|`{ host: "127.0.0.1", port: 8888}`|

### BaseClient.sendRequest<T>

A protected function that your client class should use to make requests. When using TypeScript, this function accepts a type parameter that can be used to tell the compiler what return type you expect from your request. 

|Variable|Type|Required|Description|Example|
|--------|----|--------|-----------|-------|
|`path`|string|true|The endpoint path you're making a request to. Will be combined with the `baseUrl` used in the constructor.|`"foos/123"`|
|`method`|string|true|Method to use for the request. Accepted values are `"POST"`, `"PUT"`, `"GET"`, `"DELETE"`.|`"POST"`|
|`data`|object|false|Object containing an optional `body` property with your POST or PUT object and an optional `qs` property with a querystring parameter object.|`{ body: { propName: "prop value" }, qs: { paramName: "param value" } }`|

This function returns a `Promise<T>` that can be awaited with TypeScript or Babel. The default implementation will deserialize the response body to an object (type `T` when using TypeScript) and return it. 

You can override this function with your own implementation:

```typescript
import BaseClient, { RequestData, isOkay } from "gearworks-http";

export class MyClientClass extends BaseClient {
    constructor() {
        super("http://example.com/api", { 
            "X-Custom-Header-Name": "custom header value sent with each request"
        })
    }

    // Override the sendRequest function
    protected async sendRequest<T>(path: string, method: "POST" | "PUT" | "GET" | "DELETE", data: RequestData = { }) {
        // Make your own custom request with this.Axios here.
        const request = this.Axios.request({
            ...
        })
        let result: AxiosResponse;
        let body: any;

        try {
            result = await request;
            body = result.data;
        } catch (e) {
            // Axios was configured to only throw an error when a network error is encountered, not when the server returns a not-OK response.
        }

        if (!isOkay) {
            const error = this.parseErrorResponse(body, result);

            throw error;
        }

        const output: T = ...
        
        return output;
    }
}
```

### BaseClient.parseErrorResponse

A protected function that the client class uses to parse error responses. You shouldn't need to call this function directly unless you're using a custom version of `BaseClient.sendRequest<T>`. When this function is called, it *must* return an `ApiError` – the caller already knows there was an error, it just wants this function to parse it.

The default implementation of this function is configured to parse errors returned by the [Gearworks](https://github.com/nozzlegear/gearworks) API: 

```json
{
    "message": "Something crazy happened", 
    "details": [ 
        {
            "key": "foo",
            "details": [
                "here's an itemized list of everything wrong with this prop",
                "1. ...",
                "2. ..."
            ]
        }
    ]
}
```

|Variable|Type|Required|Description|Example|
|--------|----|--------|-----------|-------|
|`body`|string|false|The response body object or raw string. This may be null!|`{ message: "Something crazy happened", ... }`|
|`axiosResponse`|AxiosResponse|false|The Axios response itself, containing the status code and status text. This may be null!|`{status: 500, statusText: "Internal server error", ...}`|

You can override this function with your own implementation, which is particularly useful when you're making requests to a server that isn't using Gearworks:

```typescript
import BaseClient, { ApiError } from "gearworks-http";

export class MyClientClass extends BaseClient {
    constructor() {
        super("http://example.com/api", { 
            "X-Custom-Header-Name": "custom header value sent with each request"
        })
    }

    protected parseErrorResponse(body?: string | Object, axiosResponse?: AxiosResponse) {
        const statusCode = 66;
        const statusText = "I AM THE SENATE.";
        const message = "It's treason then.";
        const details = {
            "sheev": "Are you threatening me, Master Jedi?"
        }

        const error = new ApiError(66, "I AM THE SENATE", "It's treason then.");
        error.details = details;

        return error;
    }
```

### ApiError

The `ApiError` is a custom Error class that's returned by the `BaseClient.parseErrorResponse` function and thrown by the default implementation of `BaseClient.sendRequest<T>` function. It has the following properties:

|Variable|Type|Description|Example|
|--------|----|-----------|-------|
|`status_code`|number|The response status code.|500|
|`status_text`|string|The status text corresponding with the `status_code`.|`"Internal Server Error"`.|
|`unauthorized`|boolean|Indicates whether the response is a `401 unauthorized` response. Automatically set in the `ApiError` class constructor.|401|
|`message`|string|A message describing the error.|`"It's treason then."`|
|`details`|any|A property set by the `BaseClient.parseErrorResponse` function that describes extra error details. May be null or undefined.|`{"sheev": "Are you threatening me, Master Jedi?"}`|