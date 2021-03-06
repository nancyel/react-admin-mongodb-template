import { AxiosRequestConfig } from "axios";
import { stringify } from "query-string";
import {
  GET_LIST,
  GET_ONE,
  GET_MANY,
  GET_MANY_REFERENCE,
  CREATE,
  UPDATE,
  UPDATE_MANY,
  DELETE,
  DELETE_MANY,
} from "react-admin";

/**
 * Maps react-admin queries to a simple REST API
 *
 * The REST dialect is similar to the one of FakeRest
 * @see https://github.com/marmelab/FakeRest
 * @example
 * GET_LIST     => GET http://my.api.url/posts?sort=['title','ASC']&range=[0, 24]
 * GET_ONE      => GET http://my.api.url/posts/123
 * GET_MANY     => GET http://my.api.url/posts?filter={ids:[123,456,789]}
 * UPDATE       => PUT http://my.api.url/posts/123
 * CREATE       => POST http://my.api.url/posts
 * DELETE       => DELETE http://my.api.url/posts/123
 */
export default function dataProvider(
  apiUrl: string | undefined,
  httpClient: (url: string, options: AxiosRequestConfig) => Promise<any>
) {
  /**
   * @param {String} type One of the constants appearing at the top if this file, e.g. 'UPDATE'
   * @param {String} resource Name of the resource to fetch, e.g. 'posts'
   * @param {Object} params The data request params, depending on the type
   * @returns {Object} { url, options } The HTTP request parameters
   */
  const convertDataRequestToHTTP = (
    type: string,
    resource: string,
    params: {
      ids: any;
      data: any;
      pagination: { page: any; perPage: any };
      sort: { field: any; order: any };
      filter: { [x: string]: { $search: any }; q: any };
      id: string;
      target: any;
    }
  ) => {
    let url = "";
    const options: AxiosRequestConfig = {};
    switch (type) {
      case GET_LIST: {
        const { page, perPage } = params.pagination;
        const { field, order } = params.sort;
        // handle full-text
        if (params.filter.q) {
          params.filter["$text"] = { $search: params.filter.q };
          delete params.filter.q;
        }
        const query = {
          sort:
            field === "id"
              ? "{}"
              : JSON.stringify({ [field]: order === "ASC" ? 1 : -1 }),
          skip: (page - 1) * perPage,
          page: page,
          limit: perPage,
          /*range: JSON.stringify([
                        (page - 1) * perPage,
                        page * perPage - 1,
                    ]),*/
          query: JSON.stringify(params.filter),
        };
        url = `${apiUrl}/${resource}?${stringify(query)}`;
        break;
      }
      case GET_ONE:
        url = `${apiUrl}/${resource}/${params.id}`;
        break;
      case GET_MANY: {
        const query = {
          filter: JSON.stringify({ id: params.ids }),
        };
        url = `${apiUrl}/${resource}?${stringify(query)}`;
        break;
      }
      case GET_MANY_REFERENCE: {
        const { page, perPage } = params.pagination;
        const { field, order } = params.sort;
        const query = {
          sort: JSON.stringify({ [field]: order === "ASC" ? 0 : 1 }),
          skip: (page - 1) * perPage,
          limit: perPage,
          /*range: JSON.stringify([
                        (page - 1) * perPage,
                        page * perPage - 1,
                    ]),*/
          query: JSON.stringify({
            ...params.filter,
            [params.target]: params.id,
          }),
        };
        url = `${apiUrl}/${resource}?${stringify(query)}`;
        break;
      }
      case UPDATE:
        url = `${apiUrl}/${resource}/${params.id}`;
        options.method = "PUT";
        options.data = params.data;
        break;
      case CREATE:
        url = `${apiUrl}/${resource}`;
        options.method = "POST";
        options.data = JSON.stringify(params.data);
        break;
      case DELETE:
        url = `${apiUrl}/${resource}/${params.id}`;
        options.method = "DELETE";
        break;
      default:
        throw new Error(`Unsupported fetch action type ${type}`);
    }
    return { url, options };
  };

  /**
   * @param {Object} response HTTP response from fetch()
   * @param {String} type One of the constants appearing at the top if this file, e.g. 'UPDATE'
   * @param {String} resource Name of the resource to fetch, e.g. 'posts'
   * @param {Object} params The data request params, depending on the type
   * @returns {Object} Data response
   */
  const convertHTTPResponse = (
    response: { headers: any; data: any },
    type: string,
    resource: string,
    params: any
  ) => {
    const { headers, data } = response;
    switch (type) {
      case GET_LIST:
      case GET_MANY:
      case GET_MANY_REFERENCE:
        return {
          data: data.map((item: { id: any; _id: any }) => {
            item.id = item._id;
            delete item._id;
            return item;
          }),
          total: parseInt(headers["x-total-count"], 0),
        };
      case DELETE:
      case DELETE_MANY:
        return { data: params };
      default:
        if (data && data._id) {
          data.id = data._id;
          delete data._id;
        }
        return { data };
    }
  };

  /**
   * @param {string} type Request type, e.g GET_LIST
   * @param {string} resource Resource name, e.g. "posts"
   * @param {Object} payload Request parameters. Depends on the request type
   * @returns {Promise} the Promise for a data response
   */
  return (
    type: string,
    resource: string,
    params: {
      ids: any;
      data: any;
      pagination: { page: any; perPage: any };
      sort: { field: any; order: any };
      filter: {
        [x: string]: { $search: any };
        q: any;
        email: any;
        stripe: any;
      };
      id: string;
      target: any;
    }
  ) => {
    // simple-rest doesn't handle filters on UPDATE route, so we fallback to calling UPDATE n times instead
    if (type === UPDATE_MANY) {
      return Promise.all(
        params.ids.map((id: string) =>
          httpClient(`${apiUrl}/${resource}/${id}`, {
            method: "PUT",
            data: params.data,
          })
        )
      ).then((responses) => ({
        data: responses.map((response: any) => response.json),
      }));
    }
    // simple-rest doesn't handle filters on DELETE route, so we fallback to calling DELETE n times instead
    if (type === DELETE_MANY) {
      return Promise.all(
        params.ids.map((id: string) =>
          httpClient(`${apiUrl}/${resource}/${id}`, {
            method: "DELETE",
          })
        )
      ).then((responses) => ({
        data: responses.map((response: any) => response.json),
      }));
    }

    const { url, options } = convertDataRequestToHTTP(type, resource, params);
    return httpClient(url, options).then((response) => {
      return convertHTTPResponse(response, type, resource, params);
    });
  };
}
