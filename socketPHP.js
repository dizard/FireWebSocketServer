// author Mankov Mikhail
// email expertcode@gmail.com

var listAnsId = {};

// FOR ie 8 and early
if (!Function.prototype.bind) {
    Function.prototype.bind = function(oThis) {
        if (typeof this !== 'function') {
            // closest thing possible to the ECMAScript 5
            // internal IsCallable function
            throw new TypeError('Function.prototype.bind - what is trying to be bound is not callable');
        }

        var aArgs   = Array.prototype.slice.call(arguments, 1),
            fToBind = this,
            fNOP    = function() {},
            fBound  = function() {
                return fToBind.apply(this instanceof fNOP && oThis
                        ? this
                        : oThis,
                    aArgs.concat(Array.prototype.slice.call(arguments)));
            };

        fNOP.prototype = this.prototype;
        fBound.prototype = new fNOP();

        return fBound;
    };
}

// check web worker

var socketPHP = function(host, path, siteId, authString) {
    this.socket = null;
    this.subList = {};
    this.counter = 0;
    this.stackClb = {};
    this.authString = authString;
    this.siteId = siteId;
    //this.transports = ['websocket', 'xdr-streaming', 'xhr-streaming', 'iframe-eventsource', 'iframe-htmlfile','xdr-polling', 'xhr-polling', 'iframe-xhr-polling','jsonp-polling'];


    this.isAuth = false;
    this.connId = null;

    this.sockWorker = function(host, path) {
        return new SockJS(host + '/' + path, null, {
            'protocols_whitelist': this.transports
        });
    }.bind(this);

    this.onMessage = function(data) {
        try{
            var data = JSON.parse(data);
            // answer
            if (data.event=='auth ok') {
                this.isAuth = true;
                this.connId = data.data.cid;
                if (this.subList['auth']) {
                    for (var i = 0; i < this.subList['auth'].length; i++) {
                        try{
                            this.subList['auth'][i](this.connId);
                        }catch(e) {
                            console.log(e);
                        }
                    }
                }
            }else if (data.event=='callBackAnswer') {
                try{
                    this.stackClb[data.clb](data.data);
                }catch(e) {
                    console.log(e);
                }
                delete this.stackClb[data.clb];
            }else if (this.subList[data.event]) {
                for (var i = 0; i < this.subList[data.event].length; i++) {
                    try{
                        this.subList[data.event][i](data.data);
                    }catch(e) {
                        console.log(e);
                    }
                }
            }
        }catch(e) {

        }
    }.bind(this);

    this.init = function() {
        this.socket.send(JSON.stringify({event:'auth', data: {
            i:this.siteId,
            s:this.authString
        }}));
    }.bind(this);

    this.on = function(event, clb) {
        if (!this.subList[event]) this.subList[event] = [];
        this.subList[event].push(clb);

        if (event=='auth' && this.isAuth) {
            clb(this.connId);
        }
        if (event=='connected' && this.connId) {
            clb(this.connId);
        }
    }.bind(this);

    //this.getState = function(event, clb) {
    //    var dataSend = {event:event, data:{}};
    //    dataSend.clb = ++this.counter;
    //    this.stackClb[this.counter] = clb;
    //    this.socket.send(JSON.stringify(dataSend));
    //};

    this.emit = function(event, data) {
        if (this.socket==null) {
            if (console) console.log('cant emit, not connect');
            return false;
        }

        var dataSend = {event:event, data:data};

        // have call back function
        if (arguments.length>=3) {
            dataSend.clb = ++this.counter;
            this.stackClb[this.counter] = arguments[2];
        }


        this.socket.send(JSON.stringify(dataSend));
    }.bind(this);


    // CHANNEL
    this.channel = function(eventName, callback) {
        if (this.socket==null) {
            return false;
        }
        this.emit('subscribe', eventName);

        this.on(eventName, callback);
    }.bind(this);

    this.off = function(eventName) {
        this.unsubscribe(eventName);
        this.subList[eventName] = [];
        return this;
    }.bind(this);

    this.unsubscribe = function(eventName) {
        if (arguments.length>1) {
            this.emit('unsubscribe', eventName, arguments[1]);
        }else{
            this.emit('unsubscribe', eventName);
        }

        return this;
    }.bind(this);

    this.listen = function(eventName, callback) {
        if (this.socket==null)
            return false;

        this.emit('subscribeUser', eventName);
        this.on(eventName, function(data) {
            var id = data.id;
            var answer = function(data) {
                this.emit('answer',{
                    id:id,
                    data:data
                });
            }

            callback(data.data, answer)
        }.bind(this));
    }.bind(this);

    // SEND
    this.send = function(eventName, data, callback) {
        if (this.socket==null) {
            return false;
        }
        this.emit('send', {event:eventName, data:data}, function(ans) {
            //console.log(ans);
            listAnsId[ans] = callback;
        });
    }




    this.connect = function(host, path) {
        this.socket = this.sockWorker(host, path);

        ///////////////////////////////
        // On OPEN
        this.socket.onopen = function () {
            //console.log('sockphp connected');
            // Тут уже логика
            this.init();

            if (this.subList['connected']) {
                //console.log(this.subList['connected'].length);
                for (var i = 0; i < this.subList['connected'].length; i++) {
                    try{
                        this.subList['connected'][i]();
                    }catch(e) {
                        console.log(e);
                    }
                }
            }


            this.socket.onmessage = function(e) {
                this.onMessage(e.data);
            }.bind(this);
        }.bind(this);

        ///////////////////////////////
        // On CLOSE
        this.socket.onclose = function () {
            console.log('sock php closed');
            this.socket = null;
            this.isAuth = false;
            this.connId = null;

            if (this.subList['disconnect']) {
                for (var i = 0; i < this.subList['disconnect'].length; i++) {
                    this.subList['disconnect'][i]();
                }
            };
            this.subList = {
                connected : this.subList['connected'],
                auth : this.subList['auth'],
                disconnect : this.subList['disconnect']
            };



            // reconnect if lost connect
            setTimeout(function () {
                this.connect(host, path);
            }.bind(this), 2000);
        }.bind(this);

    }.bind(this);

    this.connect(host, path);
}
