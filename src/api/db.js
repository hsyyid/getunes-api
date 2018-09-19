const AWS = require('aws-sdk');
const BluebirdPromise = require("bluebird");
const dynamodb = BluebirdPromise.promisifyAll(new AWS.DynamoDB.DocumentClient({region: 'us-east-2'}));

const GetUser = async (identityId) => {
  let params = {
    TableName: 'Users',
    Key: {
      identityId
    }
  };

  let response = await dynamodb.get(params).promise();
  console.log("[GetUser]: " + JSON.stringify(response, null, 2));

  if (response && response.Item) {
    return response.Item;
  }

  return undefined;
};

const AddUser = async (user) => {
  let params = {
    TableName: 'Users',
    Item: user
  };

  let response = await dynamodb.put(params).promise();
  console.log("[AddUser]: " + JSON.stringify(response, null, 2));
};

module.exports = {
  GetUser,
  AddUser
};
