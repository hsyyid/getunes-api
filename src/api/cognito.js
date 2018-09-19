const AWS = require('aws-sdk');
const cognito = new AWS.CognitoIdentity({region: 'us-east-2'});

const IdentityPoolId = process.env.IDENTITY_POOL_ID;

const GetIdentity = async (userId) => {
  return await new Promise((resolve) => {
    let params = {
      IdentityPoolId,
      Logins: {
        'spotify.com': userId
      }
    };

    cognito.getOpenIdTokenForDeveloperIdentity(params, function(err, data) {
      if (data) {
        resolve(data);
      } else {
        resolve(err);
      }
    });
  });

  // NOTE: Returns an object:
  // {
  //  IdentityId — (String) A unique identifier in the format REGION:GUID.
  //  Token — (String) An OpenID token.
  // }
};

module.exports = {
  GetIdentity
};
