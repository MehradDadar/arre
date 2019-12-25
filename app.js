const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const secure = require('express-force-https');

const storageRoot = __dirname;
const secretsRoot = path.join(__dirname, 'secrets');

const privateKey  = fs.readFileSync(path.join(secretsRoot, 'privkey.pem'), 'utf8');
const certificate = fs.readFileSync(path.join(secretsRoot, 'cert.pem'), 'utf8');
const ca = fs.readFileSync(path.join(secretsRoot, 'chain.pem'), 'utf8');


const app = express();

const credentials = {key: privateKey, cert: certificate, ca: ca};


function getIP (request) {
	return request.connection.remoteAddress.substring(7);
}

function userExists (username) {
	flag = false;
	if (username.length == 0) return false;
	if (require('fs').readFileSync(__dirname + '/users').includes(`,${username},,`)) flag = true;
	
	return flag;
}	

function authCheck (username, password) {
	flag = false;
	if (username.length == 0 || password.length == 0) return false;
	if (require('fs').readFileSync(__dirname + '/users').includes(`,${username},,${password},`)) flag = true;
	return flag;
}
			       
function isSuperUser (username) {
	flag = false;
	if (username.length == 0) return false;
	if (require('fs').readFileSync(__dirname + '/users').includes(`,,,${username},,,`)) flag = true;
	return flag;
}		

function removeUser (user, suser) {
	if (user.length == 0 || !userExists (user)) return;
	shell = require('shelljs');
	
	var s = shell.exec('iptables-save | grep \"/* ' + user + ' /*\"', {silent: true}).stdout.replace(/-A PRX/g, 'iptables -D PRX');
	
	shell.exec (`sed -i \'/,${user},,/d\' /root/arre/users`);  

	console.log (user + ` :REMOVED BY ${suser}`);
}

function addUser (user, pass, suser) {
	if (user.length == 0 || pass.length == 0) return;
	shell = require('shelljs');
	removeUser (user, suser);
	console.log (user + ` :ADDED BY ${suser}`);
	shell.exec (`echo \',${user},,${pass},\' >> ${storageRoot}/users`); 
}

function addIP (session) {
	shell = require('shelljs');
	if (!shell.exec('iptables-save', {silent: true}).stdout.includes('-A PRX -s ' + session.ip + `/32 -m comment --comment ${session.username} -j ACCEPT`)) {
		
		console.log (session.username + ': ' + session.ip);
		shell.exec ('iptables -I PRX -s ' + session.ip + ' -j ACCEPT -m comment --comment ' + session.username); 
	}
}

function resett (suser) {
	shell = require('shelljs');
	console.log (`RESET BY ${suser}`);
	shell.exec ('iptables -F PRX && iptables -A PRX -j DROP'); 
}

function removeIP (session) {
	shell = require('shelljs');
	var s = shell.exec(`iptables-save | grep \"/* ${session.username} /*\"`, {silent: true}).stdout.replace(/-A PRX/g, 'iptables -D PRX');
	if (s.length > 2){
		console.log ('x: ' + session.username);
		shell.exec (s); 
	}
}

app.use(session({
	secret: 'secret',
	resave: true,
	saveUninitialized: false
}));
app.use(bodyParser.urlencoded({extended : true}));
app.use(bodyParser.json());

app.get('/', function(request, response) {
	if (request.session.loggedin) {
		if (request.session.superUser) {
			if (request.session.ip != getIP (request)) {
				request.session.ip = getIP (request);
				addIP (request.session);
			}
			response.sendFile(path.join(__dirname + '/views/users/manage.html'));
		} else {
			response.sendFile(path.join(__dirname + '/views/users/status.html'));;
		}
	} else {
		response.sendFile(path.join(__dirname + '/views/users/login.html'));;
	}
	
});

app.get('/style.css', function(request, response) {
	response.sendFile(path.join(__dirname + '/views/users/style.css'));
});

app.get('/script.js', function(request, response) {
	response.sendFile(path.join(__dirname + '/views/users/script.js'));
});

app.post('/auth', function(request, response) {
	var username = request.body.username;
	var password = request.body.password;
	if (username.length == 0 || password.length == 0) return;
	
	  if(authCheck(username, password)){
	   request.session.loggedin = true;
	   request.session.username = username;
	   request.session.ip = getIP(request);
	   request.session.superUser = false;
	   if (isSuperUser(username)) request.session.superUser = true;
	   request.session.secret = username + ':' + getIP (request);
	   if (!request.session.superUser)removeIP(request.session);
	   addIP(request.session);
	  }
	  response.redirect('/');
	
});

app.post('/signout', function(request, response) {
	removeIP(request.session);
	request.session.loggedin = false;
	request.session.secret = 'secret';
	response.redirect('/');
	
});
app.post('/reset', function(request, response) {
	if (request.session.superUser) {
		resett(request.session.username);
		addIP (request.session);
	}
	response.redirect('/');
	
});
app.post('/register', function(request, response) {
	if (isSuperUser(request.body.username)) return;
	if (request.session.superUser) {
		if (request.body.password == 'R3m0ve') {
			removeUser(request.body.username, request.session.username);
		} else {
			addUser (request.body.username, request.body.password, request.session.username);
		}
	}
	response.redirect('/');
	
});
let redirApp = express();
redirApp.use(secure);

var httpServer = http.createServer(redirApp);
var httpsServer = https.createServer(credentials, app);
httpsServer.listen(443);
httpServer.listen(80);
