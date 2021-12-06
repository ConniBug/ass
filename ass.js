let doSetup = null;
try {
	// Check if config.json exists
	require('./config.json');
} catch (err) {
	doSetup = require('./setup').doSetup;
}

// Run first time setup if using Docker (pseudo-process, setup will be run with docker exec)
if (doSetup) {
	doSetup();
	return;
}

// Load the config
const { host, port, useSsl, isProxied, s3enabled } = require('./config.json');

//#region Imports
const handleCD = require("./cd.js").handleCD;
const fs = require('fs-extra');
const express = require('express');
const nofavicon = require('@tycrek/express-nofavicon');
const helmet = require('helmet');
const marked = require('marked');
const uploadRouter = require('./routers/upload');
const resourceRouter = require('./routers/resource');
const { path, log, getTrueHttp, getTrueDomain } = require('./utils');
const { CODE_INTERNAL_SERVER_ERROR } = require('./MagicNumbers.json');
const { name: ASS_NAME, version: ASS_VERSION } = require('./package.json');
//#endregion

// Welcome :D
log.blank().info(`* ${ASS_NAME} v${ASS_VERSION} *`).blank();

// Set up premium frontend
const FRONTEND_NAME = 'conni-ass-frontend'; // <-- Change this to use a custom frontend
const ASS_PREMIUM = fs.existsSync(`./${FRONTEND_NAME}/package.json`) ? (/*require('submodule'), */require(`./${FRONTEND_NAME}`)) : { enabled: false };

//#region Variables, module setup
const app = express();
const ROUTERS = {
	upload: uploadRouter,
	resource: resourceRouter
};

// Read users and data
const users = require('./auth');
const data = require('./data');
//#endregion

var timeBetweenChecks = 10; // seconds
setInterval(async function(){
    handleCD();
}, timeBetweenChecks * 1000);

// Enable/disable Express features
app.enable('case sensitive routing');
app.disable('x-powered-by');

// Set Express variables
app.set('trust proxy', isProxied);
app.set('view engine', 'pug');

// Express logger middleware
app.use(log.express(true));

// Helmet security middleware
app.use(helmet.noSniff());
app.use(helmet.ieNoOpen());
app.use(helmet.xssFilter());
app.use(helmet.referrerPolicy());
app.use(helmet.dnsPrefetchControl());
useSsl && app.use(helmet.hsts({ preload: true })); // skipcq: JS-0093

// Don't process favicon requests
app.use(nofavicon);

// Index can be overridden by a frontend
app.get('/', (req, res, next) =>
	(ASS_PREMIUM.enabled && ASS_PREMIUM.index)
		? ASS_PREMIUM.index(req, res, next)
		: fs.readFile(path('README.md'))
			.then((bytes) => bytes.toString())
			.then(marked)
			.then((d) => res.render('index', { data: d }))
			.catch(next));

// Upload router
app.use('/', ROUTERS.upload);

// Attach frontend, if enabled
ASS_PREMIUM.enabled && app.use(ASS_PREMIUM.endpoint, ASS_PREMIUM.router); // skipcq: JS-0093

// '/:resouceId' always needs to be LAST since it's a catch-all route
app.use('/:resourceId', (req, _, next) => (req.resourceId = req.params.resourceId, next()), ROUTERS.resource); // skipcq: JS-0086, JS-0090

app.use((err, req, res, next) => {
	console.error(err);
	res.sendStatus(CODE_INTERNAL_SERVER_ERROR);
});

// Host the server
log
	.info('Users', `${Object.keys(users).length}`)
	.info('Files', `${data.size}`)
	.info('StorageEngine', data.name, data.type)
	.info('Frontend', ASS_PREMIUM.enabled ? ASS_PREMIUM.brand : 'disabled', `${ASS_PREMIUM.enabled ? `${getTrueHttp()}${getTrueDomain()}${ASS_PREMIUM.endpoint}` : ''}`)
	.info('Index redirect', ASS_PREMIUM.enabled && ASS_PREMIUM.index ? `enable` : 'disabled')
	.blank()
	.express().Host(app, port, host, () => log.success('Ready for uploads', `Storing resources ${s3enabled ? 'in S3' : 'on disk'}`));
