const AWS = require('aws-sdk');
const ecs = new AWS.ECS({region: 'us-east-2'});

const GetLibrary = async (identityId) => {
  return await new Promise((resolve) => {
    let params = {
      cluster: "getunes-cluster",
      launchType: "FARGATE",
      taskDefinition: "getunes-library-task-definition:3",
      networkConfiguration: {
        awsvpcConfiguration: {
          assignPublicIp: "ENABLED",
          subnets: ['subnet-002f95c607d7cf0e9']
        }
      },
      overrides: {
        containerOverrides: [
          {
            name: "docker-getunes-library",
            environment: [
              {
                name: "USER_IDENTITY_ID",
                value: identityId
              }
            ]
          }
        ]
      }
    };

    ecs.runTask(params, function(err, res) {
      if (res) {
        resolve(res);
      } else {
        resolve(err);
      }
    });
  });
};

module.exports = {
  GetLibrary
};
