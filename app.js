//. app.js
var express = require( 'express' ),
    bodyParser = require( 'body-parser' ),
    ejs = require( 'ejs' ),
    passport = require( 'passport' ),
    request = require( 'request' ),
    session = require( 'express-session' ),
    WebAppStrategy = require( 'ibmcloud-appid' ).WebAppStrategy,
    SelfServiceManager = require( 'ibmcloud-appid' ).SelfServiceManager,
    app = express();

var settings = require( './settings' );

//. setup session
app.use( session({
  secret: 'appid_fullcustom',
  resave: false,
  saveUninitialized: false
}));

app.use( bodyParser.urlencoded( { extended: true } ) );
app.use( bodyParser.json() );
app.use( express.Router() );
app.use( express.static( __dirname + '/public' ) );

app.set( 'views', __dirname + '/views' );
app.set( 'view engine', 'ejs' );


//. setup passport
app.use( passport.initialize() );
app.use( passport.session() );
passport.use( new WebAppStrategy({
  tenantId: settings.tenantId,
  clientId: settings.clientId,
  secret: settings.secret,
  oauthServerUrl: settings.oauthServerUrl,
  redirectUri: settings.redirectUri
}));
passport.serializeUser( ( user, cb ) => cb( null, user ) );
passport.deserializeUser( ( user, cb ) => cb( null, user ) );

var managementUrl = 'https://' + settings.region + '.appid.cloud.ibm.com/management/v4/' + settings.tenantId;
var selfServiceManager = new SelfServiceManager({
  iamApiKey: settings.apiKey,
  managementUrl: managementUrl 
});


//. login UI
app.get( '/login', function( req, res ){
  var message = ( req.query.message ? req.query.message : '' );
  res.render( 'login', { message: message } );
});

//. signup UI
app.get( '/signup', function( req, res ){
  var message = ( req.query.message ? req.query.message : '' );
  res.render( 'signup', { message: message } );
});

//. reset password UI
app.get( '/resetpassword', function( req, res ){
  var message = ( req.query.message ? req.query.message : '' );
  res.render( 'resetpassword', { message: message } );
});

//. set new password UI
app.get( '/newpassword', function( req, res ){
  var message = ( req.query.message ? req.query.message : '' );
  res.render( 'newpassword', { message: message } );
});

//. logout
app.get( '/appid/logout', function( req, res ){
  WebAppStrategy.logout( req );
  res.redirect( '/login' );
});

//. login submit
app.post( '/appid/login/submit', bodyParser.urlencoded({extended: false}), passport.authenticate(WebAppStrategy.STRATEGY_NAME, {
	successRedirect: '/',
	failureRedirect: '/login?message=login failed.',
	failureFlash : false
}));

//. signup submit
app.post( '/appid/signup', function( req, res ){
  var language = req.body.language;
  var lastName = req.body.lastName;
  var firstName = req.body.firstName;
  var phoneNumber = req.body.phoneNumber;
  var email = req.body.email;
  var password = req.body.password;
  var confirmed_password = req.body.confirmed_password;
  if( language ){
    if( password && password == confirmed_password ){
      var userData = {
        lastName: lastName,
        firstName: firstName,
        phoneNumber: phoneNumber,
        emails: [ { value: email, primary: true } ],   //. emails[0] should be **object**
        //confirmed_password: confirmed_password,
        password: password
      };
      selfServiceManager.signUp( userData, language, null ).then( function( user ){
        res.redirect( '/login' );
      }).catch( function( err ){
        console.log( { err } );
        res.redirect( '/signup?message=' + JSON.stringify( err ) );
      });
    }else{
      res.redirect( '/signup?message=password not mached.' );
    }
  }else{
    res.redirect( '/signup?message=no language specified.' );
  }
});

//. reset password submit
app.post( '/appid/resetpassword', function( req, res ){
  var language = req.body.language;
  var email = req.body.email;
  if( language && email ){
    selfServiceManager.forgotPassword( email, language, null ).then( function( user ){
      console.log( { user } );
      res.redirect( '/login' );
    }).catch( function( err ){
      console.log( { err } );
      res.redirect( '/signup?message=' + JSON.stringify( err ) );
    });
  }else{
    res.redirect( '/login?message=no language and/or email specified.' );
  }
});

//. set new password submit
app.post( '/appid/newpassword', async function( req, res ){
  var language = req.body.language;
  //var uuid = req.body.uuid;
  var email = req.body.email;
  var password = req.body.password;
  var confirmed_password = req.body.confirmed_password;
  if( language && email ){
    if( password && password == confirmed_password ){
      //. email から uuid を取得する必要がある
      var uuid = "";
      var obj = await getUsers();  //. { totalResults: 2, users: [ { id: "xx", email: "xxx", .. }, .. ] }
      for( var i = 0; i < obj.users.length; i ++ ){
        var user = obj.users[i];
        if( user.email.toUpperCase() == email.toUpperCase() ){
          //uuid = user.id;
          console.log( { user } );
          var profile = await getProfile( user.id );  //. { id: "xx", email: "xxx", identities: [ { id: "yy", .. }, .. ], .. }
          console.log( { profile } );
          for( var j = 0; j < profile.identities.length; j ++ ){
            var identity = profile.identities[j];
            console.log( { identity } );
            //if( identity.provider == 'cloud_directory' ){  //. 判断不要？
              uuid = identity.id;  //. この identity.id が uuid
            //}
          }
        }
      }

      if( uuid ){
        selfServiceManager.setUserNewPassword( uuid, password, language, null, null ).then( function( user ){
          console.log( { user } );
          res.redirect( '/login' );
        }).catch( function( err ){
          console.log( { err } );
          res.redirect( '/login?message=' + JSON.stringify( err ) );
        });
      }else{
        res.redirect( '/login?message=no user information found.' );
      }
    }else{
      res.redirect( '/signup?message=password not mached.' );
    }
  }else{
    res.redirect( '/login?message=no language and/or email specified.' );
  }
});

app.get( '/appid/users', async function( req, res ){
  res.contentType( 'application/json; charset=utf8' );
  var users = await getUsers();
  res.json( users );
});

//. ログイン済みでないとトップページが見れないようにする
app.all( '/*', function( req, res, next ){
  if( !req.user || !req.user.sub ){
    //. ログイン済みでない場合は強制的にログインページへ
    res.redirect( '/login' );
  }else{
    next();
  }
});

//. トップページ
app.get( '/', function( req, res ){
  //. 正しくユーザー情報が取得できていれば、トップページでユーザー情報を表示する
  if( req.user ){
    //console.log( req.user );
    res.render( 'index', { user: req.user } );
  }else{
    res.render( 'index', { user: null } );
  }
});


//. アクセストークンを取得
async function getAccessToken(){
  return new Promise( async ( resolve, reject ) => {
    //. GET an IAM token
    //. https://cloud.ibm.com/docs/appid?topic=appid-manging-api&locale=ja
    var headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    };
    var option = {
      url: 'https://iam.cloud.ibm.com/oidc/token',
      method: 'POST',
      body: 'grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=' + settings.apiKey,
      headers: headers
    };
    request( option, ( err, res, body ) => {
      if( err ){
        console.log( err );
        resolve( null );
      }else{
        body = JSON.parse( body );
        var access_token = body.access_token;
        resolve( access_token );
      }
    });
  });
}

//. ユーザーIDからプロファイルを取得
async function getProfile( user_id ){
  return new Promise( async ( resolve, reject ) => {
    var access_token = await getAccessToken();
    if( access_token ){
      //console.log( 'access_token = ' + access_token );
      //. https://cloud.ibm.com/docs/appid?topic=appid-user-admin
      var headers1 = {
        accept: 'application/json',
        authorization: 'Bearer ' + access_token
      };
      var option1 = {
        url: 'https://' + settings.region + '.appid.cloud.ibm.com/management/v4/' + settings.tenantId + '/users/' + user_id + '/profile',
        method: 'GET',
        headers: headers1
      };
      request( option1, ( err1, res1, body1 ) => {
        if( err1 ){
          console.log( 'err1', err1 );
          reject( err1 );
        }else{
          var profile = JSON.parse( body1 );
          resolve( profile );

          /*
          //. カスタム属性
          var headers2 = {
            accept: 'application/json',
            authorization: 'Bearer ' + access_token
          };
          var option2 = {
            url: 'https://' + settings.region + '.appid.cloud.ibm.com/management/v4/' + settings.tenantId + '/users/' + user_id + '/roles',
            method: 'GET',
            headers: headers2
          };
          request( option2, ( err2, res2, body2 ) => {
            if( err2 ){
              console.log( 'err2', err2 );
              reject( err2 );
            }else{
              //. this means no error
              body2 = JSON.parse( body2 );
              var roles = body2.roles;

              //. カスタム属性
              //. https://qiita.com/yo24/items/7b577891d67cec52d9b2

              //console.log( profile, roles );
              console.log( JSON.stringify( profile, null, 2 ) );
              resolve( { status: true, profile: profile, roles: roles } );
            }
          });
          */
        }
      });
    }
  });
}

//. ユーザー一覧を取得
async function getUsers(){
  return new Promise( async ( resolve, reject ) => {
    var access_token = await getAccessToken();
    if( access_token ){
      //console.log( 'access_token = ' + access_token );
      //. https://cloud.ibm.com/docs/appid?topic=appid-user-admin
      var headers1 = {
        accept: 'application/json',
        authorization: 'Bearer ' + access_token
      };
      var option1 = {
        url: 'https://' + settings.region + '.appid.cloud.ibm.com/management/v4/' + settings.tenantId + '/users',
        method: 'GET',
        headers: headers1
      };
      request( option1, ( err1, res1, body1 ) => {
        if( err1 ){
          console.log( 'err1', err1 );
          reject( err1 );
        }else{
          var users = JSON.parse( body1 );
          resolve( users );
        }
      });
    }
  });
}



var port = process.env.PORT || 8080;
app.listen( port );
console.log( "server starting on " + port + " ..." );

