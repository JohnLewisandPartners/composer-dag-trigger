/*
 Copyright (c) John Lewis & Partners

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.

*/

const rp = require('request-promise');

/**
 * Triggered from a message on a Cloud Storage bucket.
 *
 * IAP authorization based on:
 * https://stackoverflow.com/questions/45787676/how-to-authenticate-google-cloud-functions-for-access-to-secure-app-engine-endpo
 * and
 * https://cloud.google.com/iap/docs/authentication-howto
 *
 */


/**
 * @param {string} clientId The client id associated with the Composer webserver application.
 * @param {string} projectId The id for the project containing the Cloud Function.
 * @param {string} userAgent The user agent string which will be provided with the request.
 * @param {!Function} callback A callback accepting error, jwt, and idToken arguments.
 */
function authorizeIap(clientId, projectId, userAgent) {
  const SERVICE_ACCOUNT = [projectId, '@appspot.gserviceaccount.com'].join('');

  const options = {
    url: [
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/',
      SERVICE_ACCOUNT, '/token',
    ].join(''),
    headers: {
      'User-Agent': userAgent,
      'Metadata-Flavor': 'Google',
    },
  };
  let jwtHeader;
  let jwtClaimset;
  let jwt;
  return rp(options)
  // Obtain an Oauth2 access token for the appspot service account
    .then((body) => {
      if (body.error) {
        throw new Error(body);
      }
      const tokenResponse = JSON.parse(body);
      const accessToken = tokenResponse.access_token;
      jwtHeader = Buffer.from(JSON.stringify({
        alg: 'RS256',
        typ: 'JWT',
      })).toString('base64');
      const iat = Math.floor(new Date().getTime() / 1000);
      const claims = {
        iss: SERVICE_ACCOUNT,
        aud: 'https://www.googleapis.com/oauth2/v4/token',
        iat,
        exp: iat + 60,
        target_audience: clientId,
      };
      jwtClaimset = Buffer.from(JSON.stringify(claims)).toString('base64');
      const toSign = [jwtHeader, jwtClaimset].join('.');
      const signJsonClaimCallbackOptions = {
        url: [
          'https://iam.googleapis.com/v1/projects/', projectId,
          '/serviceAccounts/', SERVICE_ACCOUNT, ':signBlob',
        ].join(''),
        method: 'POST',
        json: {
          bytesToSign: Buffer.from(toSign).toString('base64'),
        },
        headers: {
          'User-Agent': userAgent,
          Authorization: ['Bearer', accessToken].join(' '),
        },
      };
      return rp(signJsonClaimCallbackOptions);
    })
    .then((body) => {
      if (body.error) {
        throw new Error(body);
      }
      const jwtSignature = body.signature;
      jwt = [jwtHeader, jwtClaimset, jwtSignature].join('.');
      const getIdTokenCallbackOptions = {
        url: 'https://www.googleapis.com/oauth2/v4/token',
        form: {
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwt,
        },
      };

      return rp.post(getIdTokenCallbackOptions);
    })
    .then((body) => {
      if (body.error) {
        throw new Error(body);
      }
      const idToken = JSON.parse(body).id_token;

      return ({
        idToken,
      });
    });
}

/**
 * @param {string} url The url that the post request targets.
 * @param {string} body The body of the post request.
 * @param {string} idToken Bearer token used to authorize the iap request.
 * @param {string} userAgent The user agent to identify the requester.
 */
function makeIapPostRequest(url, body, idToken, userAgent) {
  const options = {
    url,
    headers: {
      'User-Agent': userAgent,
      Authorization: ['Bearer', idToken].join(' '),
    },
    method: 'POST',
    json: body,
    resolveWithFullResponse: true,
  };

  return rp.post(options);
}

/**
* @param {!string} dagName The name of the dag to trigger
* @param {!string} runId The runId used when triggering the dag
* @param {!object} data The data to include when triggering the dag
* @param {!string} composerWebUrl The url of the compeser instance
* @param {!string} projectId The projectid the composer instance is in
* @param {!string} clientId The clientId used to authenticate against the composer instance
* @param {!function} callback A callback function that is returned
 */

function triggerDag({
  dagName,
  runId,
  data,
  composerWebUrl,
  projectId,
  clientId,
  callback,
} = {}) {
  // Use this to trigger a dag on a composer instance


  const WEBSERVER_URL = `${composerWebUrl}/api/experimental/dags/${dagName}/dag_runs`;
  const USER_AGENT = 'gcf-event-trigger';
  const BODY = {
    conf: JSON.stringify(data),
    run_id: runId,
  };
  console.log(`Triggering DAG ${dagName} with dag run_id ${runId}`);

  // Make the request to get a valid token so we can trigger the DAG on compose
  authorizeIap(clientId, projectId, USER_AGENT)
    .then((result) => {
      const {
        idToken,
      } = result;
      // this is the call that actually triggers the DAG
      return makeIapPostRequest(WEBSERVER_URL, BODY, idToken, USER_AGENT);
    })
    .then(response => callback(null, response))
    .catch(error => callback(error));
}
module.exports = {
  triggerDag,
};
