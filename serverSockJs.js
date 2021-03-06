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
    PRIVATE: {}, //
    NS_CHANNEL_USER : {}, // Name spaces - [siteId][channel][userId][conn.id] = conn,
    CACHE:{},


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

WS_Server.installHandlers(http.createServer().on('listening', function () {
    console.info('WS_Server STARTED', this.address());
    console.info('SecretKey', Config.secretKey);
}).listen(Config.portWS, Config.hostWS), {
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
                if (Object.keys(Store.NS_CHANNEL_USER[this.siteId][channel][this.userId]).length===0) {
                    delete Store.NS_CHANNEL_USER[this.siteId][channel][this.userId];
                }
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

    unjoin(channel, all, fn) {
        debug('unjoin room %s', channel);
        if (!this.channels.hasOwnProperty(channel)) {
            fn && fn(null);
            return this;
        }
        if (!Store.NS_CHANNEL_USER.hasOwnProperty(this.siteId)) {
            fn && fn(null);
            return this;
        }
        if (!Store.NS_CHANNEL_USER[this.siteId].hasOwnProperty(channel)) {
            fn && fn(null);
            return this;
        }
        if (!Store.NS_CHANNEL_USER[this.siteId][channel].hasOwnProperty(this.userId)) {
            fn && fn(null);
            return this;
        }

        delete Store.NS_CHANNEL_USER[this.siteId][channel][this.userId][this.id];
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
        if (conn.siteId)
            delete Store.NS_USER[conn.siteId][conn.userId][conn.id];
    });

    conn.on('subscribe', (channel) => {
        debug('subscribe %s',channel);
        if(channel[0]=='#') {
            if (!Store.PRIVATE[conn.siteId]) return ;
            if (!Store.PRIVATE[conn.siteId][channel]) return ;
            if (!Store.PRIVATE[conn.siteId][channel][conn.userId]) return ;
        }
        conn.join(channel);

        if(channel[0]=='@') {
            return Store.load(conn.siteId, channel, conn.userId, (data) => {
                if (data) conn.write(channel, data);
            });
        }
        return Store.load(conn.siteId, channel, null, (data) => {
            if (data) conn.write(channel, data);
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
            return JWT.decode(secretKey, data.s, function (err, obj) {
                if (err || !obj.i) return conn.close(3404, 'invalid JWT');
                auth(conn, siteId, obj.i);
            })
        }
        return RedisClient.get('LaWS_Server:name_spaces:'+siteId, (err, secretKey) => {
            if (!secretKey) return conn.close(3404, 'site id not registered');
            JWT.decode(secretKey, data.s, function (err, obj) {
                if (err || !obj.i) return conn.close(3404, 'invalid JWT');
                auth(conn, siteId, obj.i);
            })
        });
    });
});
WS_Server.sendToChannel = (siteId, channel, data, params) => {
    debug('sendToChannel: siteId:%s channel:%o data:%s params:%o', siteId, channel, data, params);
    if (!Store.NS_CHANNEL_USER[siteId]) return;
    if (!Store.NS_CHANNEL_USER[siteId][channel]) return;

    if (params.userId) {
        if (!Store.NS_CHANNEL_USER[siteId][channel][params.userId]) return;
        return Object.keys(Store.NS_CHANNEL_USER[siteId][channel][params.userId]).filter((connId) => {
            Store.NS_CHANNEL_USER[siteId][channel][params.userId][connId].write(channel, data);
        })
    }
    return Object.keys(Store.NS_CHANNEL_USER[siteId][channel]).filter((userId) => {
        Object.keys(Store.NS_CHANNEL_USER[siteId][channel][userId]).filter((connId) => {
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
    debug('WS_Server.channelInfo siteId:%s ,channel:%s', siteId, channel);

    let countUser = 0,
        countConnections = 0,
        listConnection = {};
    if (!Store.NS_CHANNEL_USER[siteId]) return clb(false);
    if (!Store.NS_CHANNEL_USER[siteId][channel]) return clb(false);

    Object.keys(Store.NS_CHANNEL_USER[siteId][channel]).filter((userId) => {
        countUser++;
        Object.keys(Store.NS_CHANNEL_USER[siteId][channel][userId]).filter((connId) => {
            countConnections++;
            listConnection[connId] = userId;
        });
    });
    return clb({
        'countUser' : countUser,
        'countConnection' : countConnections,
        'connId_UserId' : listConnection
    });
};
WS_Server.subscribeChannel = (siteId, channel, params) => {
    debug('subscribePrivateChannel: siteId:%s, channel:%s, params:%o', siteId, channel, params);
    if (!Store.PRIVATE.hasOwnProperty(siteId)) Store.PRIVATE[siteId] = {};
    if (!Store.PRIVATE[siteId].hasOwnProperty(channel)) Store.PRIVATE[siteId][channel] = {};

    Store.PRIVATE[siteId][channel][params.userId] = params.userId;
};
WS_Server.unsubscribeChannel = (siteId, channel, params) => {
    debug('unsubscribePrivateChannel: siteId:%s, channel:%s, params:%o', siteId, channel, params);
    if (!Store.PRIVATE.hasOwnProperty('siteId')) return ;
    if (!Store.PRIVATE[siteId].hasOwnProperty('channel')) return ;

    delete Store.PRIVATE[siteId][channel][params.userId];
};


//================================
// Command reciver
const NET_Server = require('net').createServer(function (sock) {
    let outstandingData;

    sock.on('error', function (data) {
    });
    //sock.on('close', function(data) {});

    sock.on('data', function (data) {
        if (outstandingData != null) {
            data = Buffer.concat([outstandingData, data], outstandingData.length + data.length);
            outstandingData = null;
        }
        if (data.length) {
            let len = data.readInt32LE(0);
            if (!len) return;
            if (len >= 1 && data.length >= len + 5) {
                data = data.slice(4, len + 4);
                try{
                    let oData = JSON.parse(data);
                    debug('income %o', oData);
                    if (!oData.hasOwnProperty('action')) return sendData(sock, {success : false, reason : 'Need action', code: 300});

                    // Региструет данный NameSpace в системе и отдает ключ шифрования
                    if (oData.action == 'registerNameSpace') {
                        if (!oData.hasOwnProperty('name')) return sendData(sock, {success : false, reason : 'Need name', code: 300});
                        if (!oData.hasOwnProperty('key')) return sendData(sock, {success : false, reason : 'Need key', code: 300});
                        if (oData.key!=Config.secretKey) return sendData(sock, {success : false, reason : 'Invalid key', code: 306});

                        return RedisClient.exists('LaWS_Server:name_spaces:'+oData.name, function(err, res) {
                            if (err) return sendData(sock, {success : false, reason : 'Error store, try latter...', code: 302});
                            if (res) return sendData(sock, {success : false, reason : 'Name space is busy', code: 309});

                            let secretKey = uuid.v4();
                            RedisClient.set('LaWS_Server:name_spaces:'+oData.name, secretKey);
                            return sendData(sock, {success : true, secretKey : secretKey});
                        });
                    }

                    // Авторизует соединение
                    if (oData.action == 'auth') {
                        if (!oData.hasOwnProperty('name')) return sendData(sock, {success : false, reason : 'Need name - name space', code: 300});
                        if (!oData.hasOwnProperty('sKey')) return sendData(sock, {success : false, reason : 'Need sKey - secret key',code: 300});

                        let key = 'LaWS_Server:name_spaces:'+oData.name;
                        if (Store.CACHE.hasOwnProperty(key)) {
                            let sKey = Store.CACHE[key];
                            if (oData.sKey!=sKey) return sendData(sock, {success : false, reason : 'Invalid sKey', code: 305});
                            sock.auth = true;
                            sock.siteId = oData.name;
                            return sendData(sock, {success : true});
                        }else{
                            return RedisClient.get(key, function(err, sKey) {
                                if (err) return sendData(sock, {success : false, reason : 'Error store, try latter...', code: 302});
                                if (!sKey) return sendData(sock, {success : false, reason : 'Name space not found', code : 404});
                                if (oData.sKey!=sKey) return sendData(sock, {success : false, reason : 'Invalid sKey', code: 305});
                                sock.auth = true;
                                sock.siteId = oData.name;
                                Store.CACHE[key] = sKey;
                                return sendData(sock, {success : true});
                            });
                        }
                    }


                    if (oData.action == 'emit') {
                        if (sock.auth!==true) return sendData(sock, {success : false, reason : 'Need auth', code: 311});

                        if (!oData.hasOwnProperty('channel')) return sendData(sock, {success : false, reason : 'Need argument channel', code: 300});
                        if (!oData.hasOwnProperty('data')) return sendData(sock, {success : false, reason : 'Need argument data', code: 300});
                        sendData(sock, {success : true});
                        return WS_Server.sendToChannel(sock.siteId, oData.channel, oData.data, oData.params);
                    }


                    if (oData.action == 'set') {
                        if (sock.auth!==true) return sendData(sock, {success : false, reason : 'Need auth', code: 311});

                        if (!oData.hasOwnProperty('channel')) return sendData(sock, {success : false, reason : 'Need argument channel', code: 300});
                        if (!oData.hasOwnProperty('data')) return sendData(sock, {success : false, reason : 'Need argument data', code: 300});
                        sendData(sock, {success : true});
                        return WS_Server.setBaseState(sock.siteId, oData.channel, oData.data, oData.params);
                    }

                    if (oData.action == 'get') {
                        if (sock.auth!==true) return sendData(sock, {success : false, reason : 'Need auth', code: 311});

                        if (!oData.hasOwnProperty('channel')) return sendData(sock, {success : false, reason : 'Need argument channel', code: 300});

                        return WS_Server.getBaseState(sock.siteId, oData.channel, oData.params, (data) => {
                            return sendData(sock, data);
                        });
                    }

                    if (oData.action == 'channelInfo') {
                        if (sock.auth!==true) return sendData(sock, {success : false, reason : 'Need auth', code: 311});

                        if (!oData.hasOwnProperty('channel')) return sendData(sock, {success : false, reason : 'Need argument channel', code: 300});

                        return WS_Server.channelInfo(sock.siteId, oData.channel, (data) => {
                            return sendData(sock, data);
                        });
                    }

                    if (oData.action == 'subscribe') {
                        if (sock.auth!==true) return sendData(sock, {success : false, reason : 'Need auth', code: 311});

                        if (!oData.hasOwnProperty('channel')) return sendData(sock, {success : false, reason : 'Need argument channel', code: 300});
                        if (oData.channel[0]!=='#') return sendData(sock, {success : false, reason : 'Private channel must begin with #', code: 343});

                        if (!oData.hasOwnProperty('params')) return sendData(sock, {success : false, reason : 'Need argument params', code: 300});
                        if (!oData.params.hasOwnProperty('userId')) return sendData(sock, {success : false, reason : 'Need argument params.userId', code: 300});

                        WS_Server.subscribeChannel(sock.siteId, oData.channel, oData.params);
                        return sendData(sock, {success : true});
                    }
                    if (oData.action == 'unsubscribe') {
                        if (sock.auth!==true) return sendData(sock, {success : false, reason : 'Need auth', code: 311});

                        if (!oData.hasOwnProperty('channel')) return sendData(sock, {success : false, reason : 'Need argument channel', code: 300});
                        if (oData.channel[0]!=='#') return sendData(sock, {success : false, reason : 'Private channel must begin with #', code: 343});

                        if (!oData.hasOwnProperty('params')) return sendData(sock, {success : false, reason : 'Need argument params', code: 300});
                        if (!oData.params.hasOwnProperty('userId')) return sendData(sock, {success : false, reason : 'Need argument params.userId', code: 300});

                        WS_Server.unsubscribeChannel(sock.siteId, oData.channel, oData.params);
                        return sendData(sock, {success : true});
                    }

                    return sendData(sock, {success : false, 'reason' : 'Invalid action...', code: 312});
                }catch (e) {
                    debug.error('%o', e);
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
    console.info('NET_Server STARTED', this.address());
}).listen(Config.portNET, Config.hostNET);
