import AxiosLib, { AxiosInstance, AxiosProxyConfig, AxiosResponse } from 'axios';
import inspect from 'logspect';

/**
 * Indicates whether the request was a success or not (between 200-300).
 */
export function isOkay(response: AxiosResponse) {
    return response && response.status >= 200 && response.status < 300;
}

export interface RequestData {
    /**
     * Querystring-compatible object that gets sent along with all requests.
     */
    qs?: any;
    /**
     * Json-serializable object that gets sent along with POST and PUT requests.
     */
    body?: any;
}

export class ApiError extends Error {
    constructor(public status: number, public status_text: string, message: string = "Something went wrong and your request could not be completed.") {
        super(message);

        this.unauthorized = status === 401;
    }

    public unauthorized: boolean;

    public details?: any;
}

export default abstract class BaseService {
    constructor(private baseUrl: string, private headers: {[key: string]: string} = {}, proxy?: AxiosProxyConfig) { 
        this.Axios = AxiosLib.create({
            // Like fetch, Axios should never throw an error if it receives a response
            validateStatus: (status) => true,
            proxy: proxy,
        })
    }

    private Axios: AxiosInstance;

    /**
     * Sends a request to the target URL, parsing the response as JSON.
     * @param path The endpoint that the request should be sent to. Will be combined with the baseUrl.
     * @param method Method to use for the request. Must be upper-case.
     * @param bodyData (optional) A json-serializable object that gets sent along with POST and PUT requests.
     * @param qsData (optional) A querystring-compatible object that gets sent along with all requests.
     */
    protected async sendRequest<T>(path: string, method: "POST" | "PUT" | "GET" | "DELETE", data: RequestData = { }) {
        const { body, qs } = data;
        const url = `${this.baseUrl}/${path}`.replace(/\/\/+/i, "/");
        const request = this.Axios.request({
            url,
            method: method,
            headers: {
                ...this.headers,
                "Content-Type": !!body ? "application/json" : undefined,
            },
            params: qs,
            data: body,
        });

        let result: AxiosResponse;
        let resultBody: T;

        try {
            result = await request;
            resultBody = result.data;
        }
        catch (e) {
            // Axios was configured to only throw an error when a network error is encountered.
            inspect(`There was a problem the fetch operation for ${url}`, e);

            const error = this.parseErrorResponse(resultBody, result);

            throw error;
        }

        if (!isOkay(result)) {
            const error = this.parseErrorResponse(resultBody, result);
            
            throw error;
        }

        return resultBody;
    }

    /**
     * A protected function that parses the error response of an Axios request and returns a new ApiError. 
     * Only called when a response does not indicate success. This function can be overriden to allow 
     * custom error parsing.
     * @param body The response body returned by Axios. May be a string or a JS object.
     * @param axiosResponse The Axios response object.
     */
    protected parseErrorResponse(body?: string | Object, axiosResponse?: AxiosResponse) {
        if (!!axiosResponse) {
            const error = new ApiError(axiosResponse.status, axiosResponse.statusText);

            if (body) {
                try {
                    const response: { message: string, details: { key: string, errors: string[] }[] } = typeof (body) === "string" ? JSON.parse(body || "{}") : body;

                    error.message = Array.isArray(response.details) ? response.details.map(e => e.errors.join(", ")).join(", ") : response.message;
                    error.details = response.details;
                } catch (e) {
                    inspect("Could not read response's error JSON.", body);
                }
            }

            return error;
        }

        // Assume network error occurred.
        return new ApiError(503, "Service Unavailable");
    }
}