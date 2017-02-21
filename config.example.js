var path       = require('path');
var settings = {
    secretKey  : 'asd82nvakadfs',
    portWS     : 8080,
    hostWS     : '0.0.0.0',
    portNET    : 8085,
    hostNET    : '0.0.0.0',
//    useSsl     : false,
//    sslKey     : '/etc/apache2/ssl/apache.key',
//    sslCert    : '/etc/apache2/ssl/apache.crt',
    path       : path.normalize(path.join(__dirname, '..')),
    port       : process.env.NODE_PORT || 3000,
//    workers    : 1,//require('os').cpus().length,
    redis : {
//		cluster : [{
//			port: 7000,
//			host: '10.102.0.1'
//		}, {
//			port: 7000,
//			host: '10.102.0.2'
//		}, {
//			port: 7000,
//			host: '10.102.0.3'
//		}, {
//			port: 7000,
//			host: '10.102.0.4'
//		}, {
//			port: 7000,
//			host: '10.102.0.5'
//		}, {
//			port: 7000,
//			host: '10.102.0.7'
//		}],
        port : 6379,
        host : "127.0.0.1",
        password  : "",
        family : 4
    }
};
module.exports = settings;
