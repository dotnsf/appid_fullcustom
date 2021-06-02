//. IBM App ID
exports.region = '';
exports.tenantId = '';
exports.apiKey = '';
exports.secret = '';
exports.clientId = '';

exports.redirectUri = 'http://localhost:8080/appid/callback';
exports.oauthServerUrl = 'https://' + exports.region + '.appid.cloud.ibm.com/oauth/v4/' + exports.tenantId;
