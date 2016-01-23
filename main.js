var express = require('express');
var path = require('path');
var fs = require('fs');
var bodyParser = require('body-parser');
var mysql = require('mysql');
var crypto = require('crypto');
var Recaptcha = require('recaptcha-v2').Recaptcha;
var c = require('chalk');
var nunjucks = require('nunjucks');

var CLIENT_VERSION = '4';

var config = JSON.parse(fs.readFileSync('config.json'));

var jsonParser = bodyParser.json();

setTimeout(function() {
	process.exit();
}, 150000);

var app = express();

app.set('trust proxy', 1);

function killEndpoint(req, res) {
	res.status(501).json({
		status: 'unavailable'
	});
}

var connPool = mysql.createPool({
	host: config.mysql.host,
	port: config.mysql.port || 3306,
	user: config.mysql.user,
	password: config.mysql.password,
	database: config.mysql.database,
	connectionLimit: 20
});

app.use('/res', express.static(path.join(__dirname, 'res')));

app.use(function(req, res, next) {
	if ([].indexOf(req.ip) !== -1 || req.headers['user-agent']) {
		req.rejected = true;
	}
	return next();
});

app.use(function(req, res, next) {
	var a = (req.method + '    ').substr(0,5) + ' ' + (req.ip + '                ').substr(0,20) + ' ' + req.url;
	console.log(req.rejected || req.url.indexOf('/nextpassword?client=2&') !== -1 || req.url.indexOf('/nextpassword?client=3&') !== -1 || req.url.indexOf('/nextpassword?applist=8ef8f') !== -1 ? c.grey(a) : a);
	fs.appendFile('server-log.txt', Date.now() + ' ' + (req.method + '    ').substr(0,5) + ' ' + (req.ip + '                ').substr(0,20) + ' ' + req.url + '\n')
	next();
});

app.get('/', function(req, res) {
	res.send(nunjucks.render('index2.html', {theme: req.query.theme || 'opl'}));
});

app.get('/stats', function(req, res) {
	connPool.query('SELECT (SELECT COUNT(*) FROM `passwords`) AS `total`, (SELECT COUNT(*) FROM `passwords` WHERE `status` IN (2,3)) AS `solved`, 1 AS `id`', function(err, rows) {
		if (err) throw err;

		res.status(200).json({
			status: 'success',
			data: rows[0]
		});
	});
});

app.get('/status', function(req, res) {
	connPool.query('SELECT `result`, `requested`, `solved`, `valid` FROM `results` JOIN `passwords` ON `passwords`.`id` = `results`.`passwordID` WHERE `passwords`.`password` LIKE ? AND `solved` IS NOT NULL', [req.query.password], function(err, rows) {
		if (err) throw err;

		res.status(200).json({
			status: 'success',
			data: rows
		});
	});
});

app.get('/latest', function(req, res) {
	connPool.query('SELECT `password`, `result`, `requested`, `solved`, `valid` FROM `results` JOIN `passwords` ON `passwords`.`id` = `results`.`passwordID` WHERE `solved` IS NOT NULL ORDER BY `results`.`requested` DESC LIMIT ?, 25', [(req.query.page || 0) * 25], function(err, rows) {
		if (err) throw err;

		res.status(200).json({
			status: 'success',
			data: rows
		});
	});
});

app.get('/hits', function(req, res) {
	connPool.query('SELECT `passwords`.`password`, `results`.`result`, `results`.`requested`, `results`.`solved`, `results`.`valid` FROM `results` JOIN `passwords` ON `passwords`.`id` = `results`.`passwordID` WHERE `results`.`result` != \'[]\' ORDER BY `results`.`solved` DESC', function(err, rows) {
		if (err) throw err;

		res.status(200).json({
			status: 'success',
			data: rows
		});
	});
});

app.post('/add', jsonParser, function(req, res) {
	if (!req.body.password || req.body.password.length === 0) {
		return res.status(400).json({
			status: 'missing_password'
		});
	}

	if (/($| )(gaben?|nigg(a|er)s?|fuck(er|ing)|gays?|porn|dicks?)(^| )/.exec(req.body.password) !== null) {
		return res.status(200).json({
			status: 'success'
		});
	}
	console.log(req.body.password);
	connPool.getConnection(function(err, conn) {
		if (err) throw err;

		conn.beginTransaction(function(err) {
			if (err) throw err;

			conn.query('SELECT `passwords`.`password`, `passwords`.`status`, `results`.`result`, `results`.`requested`, `results`.`solved`, `results`.`valid` FROM `passwords` LEFT JOIN `results` ON `results`.`passwordID` = `passwords`.`id` WHERE `password` = ?', [req.body.password], function(err, rows) {
				if (err) throw err;

				if (rows.length > 0) {
					var password = rows[0].password;
					var status = rows[0].status;

					for (var row of rows) {
						delete row.password;
						delete row.status;
					}

					conn.commit(function(err) {
						if (err) throw err;

						conn.release();
						return res.status(400).json({
							status: 'already_exists',
							data: {
								password: password,
								status: status,
								results: rows[0].requested ? rows : []
							}
						});
					});
				} else {
					return killEndpoint(req, res);

					var recaptcha = new Recaptcha(config.recaptcha.publicKey, config.recaptcha.privateKey, {
						remoteip: req.ip,
						response: req.body.recaptchaResponse,
						secret: config.recaptcha.privateKey
					});

					recaptcha.verify(function(success, error_code) {
						if (!success) {
							res.status(403).json({
								status: 'recaptcha_required'
							});
						} else {
							conn.query('INSERT INTO `passwords` (`password`, `added`, `lastStatusChange`, `client`) VALUES (?, ?, ?, ?)', [req.body.password, ~~(new Date().getTime() / 1000), ~~(new Date().getTime() / 1000), crypto.createHash('md5').update(req.ip).digest('hex')], function(err) {
								if (err) throw err;

								conn.commit(function(err) {
									if (err) throw err;

									conn.release();
									return res.status(200).json({
										status: 'success'
									});
								});
							});
						}
					});
				}
			});
		});
	});
});

app.get('/nextpassword', /*killEndpoint, */function(req, res) {
	var checkApplist = false, checkClient = false, checkClientVersion = false;
	if ((checkApplist = !req.query.applist) || (checkClient = !req.query.client) || (checkClientVersion = (req.query.client != CLIENT_VERSION))) {
		return res.status(400).json({
			status: checkApplist ? 'missing_applist' : checkClient ? 'missing_client' : checkClientVersion ? 'outdated_client' : 'this_should_never_happen',
			comment: 'Please, download a new version of the client from https://github.com/opl-/winter-arg-tester'
		});
	}

	if (req.rejected) {
		return res.status(200).json({
			status: 'success',
			password: ['blood', 'murderer', 'murder', 'Molly', '1v7531', 'wanted', 'poisonouscupcakes'][~~(Math.random()*6)],
			id: crypto.createHash('md5').update(req.ip).digest('hex')
		});
	}

	if (['8ef8fce03ed4f50cb6efe3044fca22f4'].indexOf(req.query.applist) === -1) {
		return res.status(403).json({
			status: 'invalid_applist'
		});
	} else {
		connPool.getConnection(function(err, conn) {
			if (err) throw err;

			conn.beginTransaction(function(err) {
				if (err) throw err;

				/*conn.query('SELECT `results`.`id`, `passwords`.`password` FROM `results` JOIN `passwords` ON `passwords`.`id` = `results`.`passwordID` WHERE `results`.`client` = ? AND `result` IS NULL AND `requested` > ?', [crypto.createHash('md5').update(req.ip).digest('hex'), ~~(new Date().getTime() / 1000) - 420], function(err, rows) {
					if (err) throw err;

					if (rows.length > 0) {
						console.log(c.red('REPEAT'));
						conn.commit(function(err) {
							if (err) throw err;

							conn.release();
							return res.status(200).json({
								status: 'success',
								password: rows[0].password,
								id: rows[0].id
							});
						});
					} else {*/
						conn.query('SELECT `id`, `password` FROM `passwords` WHERE `status` IN (0,1) AND (SELECT COUNT(*) FROM `results` WHERE `results`.`passwordID` = `passwords`.`id` AND `results`.`valid` = 1 AND (`results`.`requested` + 420 > UNIX_TIMESTAMP() OR `solved` IS NOT NULL)) < 3 ORDER BY `added` ASC LIMIT 0,1', function(err, rows) {
							if (err) throw err;

							if (rows.length === 0) {
								conn.commit(function(err) {
									if (err) throw err;

									conn.release();
									return res.status(404).json({
										status: 'queue_empty'
									});
								});
							} else {
								var id = crypto.createHash('md5').update(Math.random() + '' + Math.random()).digest('hex');
								conn.query('INSERT INTO `results` (`id`, `passwordID`, `requested`, `client`) VALUES (?, ?, ?, ?)', [id, rows[0].id, ~~(new Date().getTime() / 1000), crypto.createHash('md5').update(req.ip).digest('hex')], function(err) {
									if (err) throw err;

									conn.query('UPDATE `passwords` SET `status` = 1, `lastStatusChange` = ? WHERE `passwords`.`id` = ?', [~~(new Date().getTime() / 1000), rows[0].id], function(err) {
										if (err) throw err;

										conn.commit(function(err) {
											if (err) throw err;

											conn.release();
											return res.status(200).json({
												status: 'success',
												password: rows[0].password,
												id: id
											});
										});
									});
								});
							}
						});
					/*}
				});*/
			});
		});
	}
});

app.post('/solve', /*killEndpoint, */jsonParser, function(req, res) {
	if (!req.body.id || !req.body.result) {
		return res.status(400).json({
			status: 'invalid_request'
		});
	}

	console.log(req.rejected ? c.grey(req.body.result) : req.body.result);

	if (req.rejected) {
		return res.status(200).json({
			status: 'success'
		});
	}

	/*if (req.body.result.length > 0) {
		var i = 0;
		function tryNext() {
			tester.tryPassword(req.body.result[0].password)
		}
	}*/

	connPool.getConnection(function(err, conn) {
		if (err) throw err;

		conn.beginTransaction(function(err) {
			if (err) throw err;

			conn.query('UPDATE `results` SET `result` = ?, `solved` = ? WHERE `id` = ?', [JSON.stringify(req.body.result), ~~(new Date().getTime() / 1000), req.body.id], function(err, result) {
				if (err) throw err;

				if (result.rowsAffected === 0) {
					console.log(c.blue('was invalid'));
					conn.commit(function(err) {
						if (err) throw err;

						conn.release();
						return res.status(403).json({
							status: 'invalid_request'
						});
					});
				} else {
					conn.query('SELECT `password` FROM `passwords` JOIN `results` ON `results`.`passwordID` = `passwords`.`id` WHERE `results`.`id` = ?', [req.body.id], function(err, rows) {
						if (err) throw err;
						console.log(c.blue('was valid'), req.body.id, rows[0].password);

						conn.query('UPDATE `passwords` SET `status` = 2 WHERE (SELECT COUNT(*) FROM `results` WHERE `results`.`passwordID` = `passwords`.`id` AND `solved` IS NOT NULL AND `results`.`valid` = 1) >= 3', function(err) {
							if (err) throw err;

							conn.commit(function(err) {
								if (err) throw err;

								conn.release();
								return res.status(200).json({
									status: 'success'
								});
							});
						});
					});
				}
			});
		});
	});
});

app.use(function(err, req, res, next) {
	console.log(err);
	res.status(500).json({
		status: 'internal_server_error'
	});
	throw err;
});

app.listen(580);
