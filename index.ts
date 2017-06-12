import * as joinPaths from 'url-join';
import AxiosLib, {
    AxiosInstance,
    AxiosPromise,
    AxiosProxyConfig,
    AxiosRequestConfig,
    AxiosResponse
    } from 'axios';
import inspect from 'logspect';

/**
 * Indicates whether the request was a success or not (between 200-300).
 */
export function isOkay(response: AxiosResponse) {
    return response && response.status >= 200 && response.status < 300;
}

export interface FileRequestData{
    /**
     * Querystring-compatible object that gets sent along with all requests.
     */
    qs?: any;
    /**
     * A handler called on upload progress events.
     */
    onUploadProgress?: (progressEvent: ProgressEvent) => void;
    /**
     * A handler called on download progress events.
     */
    onDownloadProgress?: (progressEvent: ProgressEvent) => void;
}

export interface RequestData extends FileRequestData {
    /**
     * Data that gets sent along as the request body with POST and PUT requests.
     */
    body?: any;
}

export type RequestMethod = "POST" | "PUT" | "GET" | "DELETE";

export class ApiError extends Error {
    constructor(public status: number, public status_text: string, message: string = "Something went wrong and your request could not be completed.") {
        super(message);

        this.unauthorized = status === 401;
    }

    public unauthorized: boolean;

    public details?: any;
}

export default abstract class BaseService {
    constructor(protected baseUrl: string, protected headers: {[key: string]: string} = {}, proxy?: AxiosProxyConfig) { 
        this.Axios = AxiosLib.create({
            // Like fetch, Axios should never throw an error if it receives a response
            validateStatus: (status) => true,
            proxy: proxy,
        })
    }

    protected Axios: AxiosInstance;

    /**
     * Joins URI paths into one single string, replacing bad slashes, and ensuring the path doesn't start with two or more slashes or end in /.extension.
     */
    protected joinUriPaths(...paths: string[]): string {
        let path = joinPaths(...paths).replace(/\/\.json/ig, ".json");
        const startsWithSlashes = /^\/{2,}/ig; // Checks if a string starts with 2 or more slashes

        if (startsWithSlashes) {
            path = path.replace(startsWithSlashes, "/");
        }

        // Check if the path ends with /.extension
        if (/\/\.(\w)*$/i.test(path)) {
            const letters = [...path];
            const index = path.lastIndexOf("/");
            
            path = [
                ...letters.slice(0, index),
                ...letters.slice(index + 1)
            ].join("");
        }

        return path;
    }

    private buildHeaders() {
        const headers = Object.getOwnPropertyNames(this.headers).reduce((result, key, index) => {
            const value = this.headers[key];

            // Don't include null or undefined header values, as they break Axios requests and throw an error.
            if (value === undefined || value === undefined) {
                inspect(`Header value for key ${key} is null or undefined. ${key} header will not be included in request.`);
            } else {
                result[key] = value;
            }

            return result;
        }, { });

        return headers;
    }

    private async completeRequest<T>(config: AxiosRequestConfig): Promise<T> {
        const request = this.Axios.request(config);
        let result: AxiosResponse;
        let resultBody: T;

        try {
            result = await request;
            resultBody = result.data;
        }
        catch (e) {
            // Axios was configured to only throw an error when a network error is encountered.
            inspect(`There was a problem the fetch operation for ${config.url}`, e);

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
     * Sends a request to the target URL, parsing the response as JSON.
     * @param path The endpoint that the request should be sent to. Will be combined with the baseUrl.
     * @param method Method to use for the request. Must be upper-case.
     * @param data (optional) A RequestData object that configures request options, including querystring and request body objects.
     */
    protected async sendRequest<T>(path: string, method: RequestMethod, config: RequestData = { }): Promise<T> {
        const headers = this.buildHeaders();
        const url = this.joinUriPaths(this.baseUrl, path);

        if (!! config.body) {
            headers["Content-Type"] = "application/json";
        }

        return await this.completeRequest<T>({
            url: url.toString(),
            method,
            headers,
            params: config.qs,
            data: config.body,
            onDownloadProgress: config.onDownloadProgress,
            onUploadProgress: config.onUploadProgress,
        })
    }

    /**
     * Like sendRequest, but specifically meant for uploading files. 
     * @param path The endpoint that the request should be sent to. Will be combined with the baseUrl.
     * @param method Method to use for the request. Must be upper-case.
     * @param files An object containing the files being uploaded. Its keys are each mapped to a file, e.g. { file_1: File, file_2: File }.
     * @param config A RequestData object that configures request options, including querystring and request body objects.
     */
    protected async sendFiles<T>(path: string, method: RequestMethod, files: { [file_name: string]: File }, config: FileRequestData): Promise<T> {
        // Axios relies on the browser to properly set the content-type header for FormData objects. 
        // We absolutely should not set it ourselves.
        const headers = this.buildHeaders();
        const url = this.joinUriPaths(this.baseUrl, path);
        const formData = new FormData();

        Object.keys(files).forEach(key => {
            const file = files[key];
            
            if (file instanceof File === false) {
                inspect("gearworks-http's sendFiles function has detected an value that wasn't a file. This may cause problems.", {[key]: file});
            }

            formData.append(key, file);
        });
        
        return await this.completeRequest<T>({
            url: url.toString(),
            method,
            headers,
            params: config.qs,
            data: formData,
            onDownloadProgress: config.onDownloadProgress,
            onUploadProgress: config.onUploadProgress,
        })
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