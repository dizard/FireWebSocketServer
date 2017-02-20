const uuid = require('node-uuid');
const Redis = require('ioredis');
const JWT = require('json-web-token');
const debug = require('debug')('WS');

const Config = require('./config.js');

const RedisClient = new Redis(Config.redis);

const Store = {
    Connections: [],
    NS: {}, // Name spaces
    NS_USER: {}, // Name spaces - [siteId][userId][conn.id] = conn
    SecretKeys: {},
    NS_CHANNEL_USER : {}, // Name spaces - [siteId][channel][userId][conn.id] = conn


    save : function(siteId, channel, data, userId, ttl) {
        debug('Store.save siteId:%s, channel:%s, data:%o, userId:%s', siteId, channel, data, userId);

        let key = 'LaWS_Server:store:'+siteId+':'+channel;
        if (userId) {
            key = 'LaWS_Server:store:'+siteId+':'+userId+':'+channel;
        }
        RedisClient.set(key, JSON.stringify(data));
        if (ttl) {
            RedisClient.expire(key, Number(ttl));
        }
    },
    load : function(siteId, channel, userId, clb) {
        debug('Store.load siteId:%s, channel:%s, userId:%s', siteId, channel, userId);
        let key = 'LaWS_Server:store:'+siteId+':'+channel;
        if (userId) {
            key = 'LaWS_Server:store:'+siteId+':'+userId+':'+channel;
        }
        RedisClient.get(key, (err, result) => {
            if (err) return clb(null);
            if (result===null) return clb(null);
            return clb(JSON.parse(result));
        });
    },
    delete : function(siteId, channel, userId) {
        let key = 'LaWS_Server:store:'+siteId+':'+channel;
        if (userId) {
            key = 'LaWS_Server:store:'+siteId+':'+userId+':'+channel;
        }
        RedisClient.del(key);
    }
};

// Make Socket server for receiving command
/**
 * Send data to client
 *
 * @param sock
 * @param data
 */
var sendData = function (sock, data) {
    data = JSON.stringify(data);
    let length = Buffer.byteLength(data);
    let sendBuf = new Buffer(length + 5);
    sendBuf.writeInt32LE(length, 0);
    sendBuf.write(data + "\x00", 4);
    sock.write(sendBuf.toString('binary'), 'binary');
};

//=========================
// WS Server
const http = require('http');
const SockJs = require('sockjs');
const WS_Server = SockJs.createServer();

WS_Server.installHandlers(http.createServer().listen(Config.portWS, Config.hostWS), {
    prefix: '/socket', log: function logger(severity, message) {
        if (severity == "error") console.error(message);
    }
});

const EventEmitter = require('events');
class Connection extends EventEmitter {
    /**
     *
     * @param WS_Server
     * @param connection
     */
    constructor(WS_Server, connection) {
        super();
        var self = this;

        this.siteId = null;
        this.userId = null;
        this.channels = {};
        this.WS_Server = WS_Server;
        this.conn = connection;
        this.id = connection.id;
        this.conn.on('data', (message) => {
            try {
                let data = JSON.parse(message);
                if (!data.event || !data.data) return;

                this.emit('data', data);
                this.emit(data.event, data.data);
            } catch (e) {
            }
        });

        this.conn.on('close', () => {
            this.emit('close', {});
            Object.keys(this.channels).filter((channel) => {
                delete Store.NS_CHANNEL_USER[this.siteId][channel][this.userId][this.id];
            });
        });
    }

    /**
     * Write Data to Socket
     *
     * @param channel
     * @param data
     */
    write(channel, data) {
        try {
            this.conn.write(JSON.stringify({
                event: channel,
                data: data
            }));
        } catch (e) {

        }
    }

    close(code, reason) {
        this.conn.close(code, reason);
    }

    join(channel, fn) {
        debug('joining room %s', channel);
        if (this.channels.hasOwnProperty(channel)) {
            fn && fn(null);
            return this;
        }
        this.channels[channel] = channel;
        if (!Store.NS_CHANNEL_USER.hasOwnProperty(this.siteId))
            Store.NS_CHANNEL_USER[this.siteId] = {};

        if (!Store.NS_CHANNEL_USER[this.siteId].hasOwnProperty(channel))
            Store.NS_CHANNEL_USER[this.siteId][channel] = {};

        if (!Store.NS_CHANNEL_USER[this.siteId][channel].hasOwnProperty(this.userId))
            Store.NS_CHANNEL_USER[this.siteId][channel][this.userId] = {};

        Store.NS_CHANNEL_USER[this.siteId][channel][this.userId][this.id] = this;
        debug('Store.NS_CHANNEL_USER %o', Store.NS_CHANNEL_USER);
        fn && fn(null);
        return this;
    }
}

WS_Server.on('connection', (connection) => {
    let conn = new Connection(this, connection);
    debug('connect %s',conn.id);

    conn.on('close', () => {
        debug('close:%s, siteId:%s userId:%s',conn.id, conn.siteId, conn.userId);
        debug('Store.Ns_USER %o', Store.NS_USER[conn.siteId]);
        delete Store.NS_USER[conn.siteId][conn.userId][conn.id];
    });

    conn.on('subscribe', (channel) => {
        debug('subscribe %s',channel);
        if(channel[0]=='#') return ;
        conn.join(channel);

        if(channel[0]=='@') {
            return Store.load(conn.siteId, channel, conn.userId, (data) => {
                conn.write(channel, data);
            })
        }
        return Store.load(conn.siteId, channel, null, (data) => {
            conn.write(channel, data);
        })
    });

    conn.on('auth', (data) => {
        let auth = (conn, siteId, userId) => {
            debug("auth ok: siteId:%s userId:%s", siteId, userId);
            conn.userId = userId;
            conn.siteId = siteId;

            conn.write('auth ok', {cid:conn.id});
            if (!Store.NS_USER.hasOwnProperty(siteId)) Store.NS_USER[siteId] = {};
            if (!Store.NS_USER[siteId].hasOwnProperty(userId)) Store.NS_USER[siteId][userId] = {};
            Store.NS_USER[siteId][userId][conn.id] = conn;
        };

        //data.s - string connect
        if (!data.hasOwnProperty('s')) return conn.close(3002, 'not found s - param, auth string');
        if (!data.hasOwnProperty('i')) return conn.close(3002, 'not found i - param, site id');
        let siteId = data.i;

        if (Store.SecretKeys[siteId]) {
            let secretKey = Store.SecretKeys[siteId];
            return JWT.decode(secretKey, data.s, function (err, userId) {
                if (err || !userId) return conn.close(3404, 'invalid JWT');
                auth(conn, siteId, userId);
            })
        }
        return RedisClient.get('LaWS_Server:name_spaces:'+siteId, (err, secretKey) => {
            if (!secretKey) return conn.close(3404, 'site id not registered');
            JWT.decode(secretKey, data.s, function (err, userId) {
                if (err || !userId) return conn.close(3404, 'invalid JWT');
                auth(conn, siteId, userId);
            })
        });
    });
});
WS_Server.sendToChannel = (siteId, channel, data, params) => {
    debug('sendToChannel: siteId:%s channel:%o data:%s params:%o', siteId, channel, data, params);
    if (params.userId) {
        return Object.keys(Store.NS_CHANNEL_USER[siteId][channel][userId]).filter(function (connId) {
            Store.NS_CHANNEL_USER[siteId][channel][userId][connId].write(channel, data);
        })
    }
    return Object.keys(Store.NS_CHANNEL_USER[siteId][channel]).filter(function (userId) {
        Object.keys(Store.NS_CHANNEL_USER[siteId][channel][userId]).filter(function (connId) {
            Store.NS_CHANNEL_USER[siteId][channel][userId][connId].write(channel, data);
        })
    });
};
WS_Server.setBaseState = (siteId, channel, data, params) => {
    debug('setBaseState: siteId:%s channel:%s data:%o params:%o', siteId, channel, data, params);
    if (data===null) {
        Store.delete(siteId, channel, params.userId);
    }else{
        Store.save(siteId, channel, data, params.userId, params.ttl);
    }
    if (params.emit) {
        WS_Server.sendToChannel(siteId, channel, data, params);
    }
};
WS_Server.getBaseState = (siteId, channel, params, clb) => {
    Store.load(siteId, channel, params.userId, (result) => {
        return clb(result);
    });
};
WS_Server.channelInfo = (siteId, channel, clb) => {
    // TODO
    return clb('todo');
};



//================================
// Command reciver
const NET_Server = require('net').createServer(function (sock) {
    var outstandingData;

    sock.on('error', function (data) {
    });
    //sock.on('close', function(data) {});

    sock.on('data', function (data) {
        if (outstandingData != null) {
            data = Buffer.concat([outstandingData, data], outstandingData.length + data.length);
            outstandingData = null;
        }
        if (data.length) {
            var len = data.readInt32LE(0);
            if (!len) return;
            if (len >= 1 && data.length >= len + 5) {
                data = data.slice(4, len + 4);
                try{
                    let oData = JSON.parse(data);
                    if (!oData.hasOwnProperty('action')) return sendData(sock, {'success' : false, reason : 'Need action'});

                    // Региструет данный NameSpace в системе и отдает ключ шифрования
                    if (oData.action == 'registerNameSpace') {
                        if (!oData.hasOwnProperty('name')) return sendData(sock, {'success' : false, reason : 'Need name'});
                        if (!oData.hasOwnProperty('key')) return sendData(sock, {'success' : false, reason : 'Need key'});
                        if (oData.key!='AdfoqDaPdVkamHdj') return sendData(sock, {'success' : false, reason : 'Invalid key'});

                        return RedisClient.exists('LaWS_Server:name_spaces:'+oData.name, function(err, res) {
                            if (err) return sendData(sock, {'success' : false, reason : 'Error store, try latter...'});
                            if (res) return sendData(sock, {'success' : false, reason : 'Name space is busy'});

                            let secretKey = uuid.v4();
                            RedisClient.set('LaWS_Server:name_spaces:'+oData.name, secretKey)
                            return sendData(sock, {'success' : true, secretKey : secretKey});
                        });
                    }

                    // Авторизует соединение
                    if (oData.action == 'auth') {
                        if (!oData.hasOwnProperty('name')) return sendData(sock, {'success' : false, reason : 'Need name - name space'});
                        if (!oData.hasOwnProperty('sKey')) return sendData(sock, {'success' : false, reason : 'Need sKey - secret key'});

                        return RedisClient.get('LaWS_Server:name_spaces:'+oData.name, function(err, sKey) {
                            if (err) return sendData(sock, {'success' : false, reason : 'Error store, try latter...'});
                            if (!sKey) return sendData(sock, {'success' : false, reason : 'Name space not found'});
                            if (oData.sKey!=sKey) return sendData(sock, {'success' : false, reason : 'Invalid sKey'});
                            sock.auth = true;
                            sock.siteId = oData.name;
                            return sendData(sock, {'success' : true});
                        });
                    }


                    if (oData.action == 'emit') {
                        if (sock.auth!==true) return sendData(sock, {'success' : false, reason : 'Need auth'});

                        if (!oData.hasOwnProperty('channel')) return sendData(sock, {'success' : false, reason : 'Need argument channel'});
                        if (!oData.hasOwnProperty('data')) return sendData(sock, {'success' : false, reason : 'Need argument data'});

                        WS_Server.sendToChannel(sock.siteId, oData.channel, oData.data, oData.params);
                        return sendData(sock, {'success' : true});
                    }


                    if (oData.action == 'set') {
                        if (sock.auth!==true) return sendData(sock, {'success' : false, reason : 'Need auth'});

                        if (!oData.hasOwnProperty('channel')) return sendData(sock, {'success' : false, reason : 'Need argument channel'});
                        if (!oData.hasOwnProperty('data')) return sendData(sock, {'success' : false, reason : 'Need argument data'});

                        WS_Server.setBaseState(sock.siteId, oData.channel, oData.data, oData.params);

                        return sendData(sock, {'success' : true});
                    }

                    if (oData.action == 'get') {
                        if (sock.auth!==true) return sendData(sock, {'success' : false, reason : 'Need auth'});

                        if (!oData.hasOwnProperty('channel')) return sendData(sock, {'success' : false, reason : 'Need argument channel'});

                        return WS_Server.getBaseState(sock.siteId, oData.channel, oData.params, (data) => {
                            return sendData(sock, data);
                        });
                    }

                    if (oData.action == 'channelInfo') {
                        if (sock.auth!==true) return sendData(sock, {'success' : false, reason : 'Need auth'});

                        if (!oData.hasOwnProperty('channel')) return sendData(sock, {'success' : false, reason : 'Need argument channel'});

                        return WS_Server.channelInfo(sock.siteId, oData.channel, (data) => {
                            return sendData(sock, data);
                        });
                    }

                    return sendData(sock, {'success' : false, 'reason' : 'Invalid action...'});
                }catch (e) {
                    sock.end();
                }
            } else {
                outstandingData = data;
            }
        }
    });
}).on('error', function (e) {
    if (e.code == 'EADDRINUSE') {
        console.error('Address in use');
        throw e;
    }
}).on('listening', function () {
    console.log('STARTED SUCCESS', this.address());
}).listen(Config.portNET, Config.hostNET);
