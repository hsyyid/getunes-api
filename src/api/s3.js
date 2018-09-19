const AWS = require('aws-sdk');
const s3 = new AWS.S3({region: 'us-east-2'});

const SaveData = async (identityId, name, data) => {
  return await new Promise((resolve) => {
    let params = {
      Bucket: 'user-data.getunes.io',
      Key: `${identityId}/${name}`,
      Body: JSON.stringify(data),
      ACL: "private",
      ContentType: "application/json",
      ContentEncoding: "utf-8"
    };

    console.log("Uploading to AWS S3...");

    s3.upload(params, function(err, response) {
      console.log("[SaveData]: " + JSON.stringify(response, null, 2));

      if (response && response.Location) {
        resolve(response);
      } else {
        resolve(undefined);
      }
    });
  });
};

const GetData = async (identityId, name) => {
  return await new Promise((resolve) => {
    let params = {
      Bucket: 'user-data.getunes.io',
      Key: `${identityId}/${name}`
    };

    console.log("Getting object from AWS S3...");

    s3.getObject(params, function(err, response) {
      if (response && response.Body) {
        resolve(response.Body.toString('utf8'));
      } else {
        resolve(undefined);
      }
    });
  });
};

const AddOrCreateData = async (identityId, name, newData) => {
  let data = await GetData(identityId, name);
  let arr = data
    ? JSON.parse(data)
    : [];

  return await SaveData(identityId, name, arr.concat(newData));
};

module.exports = {
  SaveData,
  GetData,
  AddOrCreateData
};
