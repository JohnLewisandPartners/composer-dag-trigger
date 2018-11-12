# Composer Dag Trigger

This is a module that can be used to trigger a DAG on GCP composer. It handles all the authentication so that this can be easily added to a cloud function.   
It is adapted from https://cloud.google.com/composer/docs/how-to/using/triggering-with-gcf

## Setup

To authenticate to Cloud IAP, grant the Appspot Service Account (used by Cloud Functions) the Service Account Token Creator role on itself. To do this, execute the following command in the gcloud command-line tool or Cloud Shell:

```
gcloud iam service-accounts add-iam-policy-binding \
your-project-id@appspot.gserviceaccount.com \
--member=serviceAccount:your-project-id@appspot.gserviceaccount.com \
--role=roles/iam.serviceAccountTokenCreator
```
## Usage

```
  const composer-trigger-dag = require('composer-trigger-dag');  

  exports.triggerDag = function triggerDag(event, callback) {
    const DAG_NAME = 'my_dag';
    const CURRENT_DATE = new Date();
    const runId = `my-trigger-run_${CURRENT_DATE.toISOString()}`;
    const data = {
        data_to_pass: 'test_data'
    };
    const AIRFLOW_WEB_URL = 'https://xxxxxxxxxxxxxxxxx-tp.appspot.com'
    const PROJECT_ID = 'your-project-id'
    const CLIENT_ID =  'xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com'
    const triggerDagParams = {
        dagName: DAG_NAME,
        runId,
        data,
        composerWebUrl: AIRFLOW_WEB_URL,
        projectId: PROJECT_ID,
        clientId: CLIENT_ID,
        callback,
   };

   composer-trigger-dag.triggerDag(triggerDagParams);
  }
```
DAG_NAME should be the name of the dag you want to trigger.   
runId is an optional param allowing you to specify the run id in airflow.   
data is a JSON object containing data that you want to pass to the dag. This is available in the dag in the conf object.   
AIRFLOW_WEB_URL should be the base URL of your composer instance.   
PROJECT_ID should be the GCP project that airflow is in.   
CLIENT_ID is the client id of the identity aware proxy running in front of composer. This can either be retrieved by navigating to composer and taking it from the sign in page, or by using this command
```
COMPOSER_ENVIRONMENT=mycomposerinstance
COMPOSER_LOCATION=europe-west-1
AIRFLOW_WEB_URL=`gcloud composer environments describe ${COMPOSER_ENVIRONMENT} --location ${COMPOSER_LOCATION} --format="get(config.airflow_uri)"`

# get the client id to be used in the trigger script so it can do proper oauth
CLIENT_ID=`curl ${AIRFLOW_WEB_URL} -I -s | grep -i "^location: "|grep -o "[?&]client_id=[^&]*"|cut -d= -f2`
echo $CLIENT_ID

```
