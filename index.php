<?php
include __DIR__ . '/JWT.php';
?>
<!DOCTYPE html>
<!--[if IE 8]> <html lang="en" class="ie8"> <![endif]-->
<!--[if !IE]><!-->
<html lang="ru">
<!--<![endif]-->
<head>
    <link rel="icon" href="/img/des/favicon.jpg" type="image/jpeg">
    <link href="//fonts.googleapis.com/css?family=Open+Sans:300,400,600,700" rel="stylesheet" />
    <meta name="google-site-verification" content="LXYPp2NccOhIJLG_v4uBfBkJL8_8JPojm_qOsrvtqX4" />
    <meta name="w1-verification" content="191896626004" />

    <title></title>
    <script>
        var ioSocketConnect = {
            host : '//127.0.0.1:8080',
            path : 'socket'
        };
        var USERID = 0;
    </script>
    <script src="//cdn.jsdelivr.net/sockjs/0.3.4/sockjs.min.js?v=166"></script>
    <script src="/socketPHP.js?ver=3&v=166"></script>
</head>

<body>
<div class="main-container">
    <script>

        var jwt = '<?=JWT::encode(4,'89d9dd66-36b6-47d4-8b83-39f293998d38')?>';
        var sockPHP = new socketPHP(ioSocketConnect.host, ioSocketConnect.path, 'sssss', jwt);
        sockPHP.on('auth', function() {
            console.log('auth ok');
            sockPHP.channel('test', function (data) {
                console.log(data);
            });
        });
    </script>
</div>
</body>
