<?php

class JWT
{
    /**
     * @param $payload
     * @param $key
     * @param string $algo
     * @return string
     */
    public static function encode($payload, $key, $algo = 'HS256')
    {
        $header = array('typ' => 'JWT', 'alg' => $algo);
        $segments = array(
            self::urlsafeB64Encode(json_encode($header)),
            self::urlsafeB64Encode(json_encode($payload))
        );
        $signing_input = implode('.', $segments);
        $signature = self::sign($signing_input, $key, $algo);
        $segments[] = self::urlsafeB64Encode($signature);
        return implode('.', $segments);
    }

    /**
     * @param $jwt
     * @param null $key
     * @param null $algo
     * @return mixed
     * @throws Exception
     */
    public static function decode($jwt, $key = null, $algo = null)
    {
        $tks = explode('.', $jwt);
        if (count($tks) != 3) {
            throw new Exception('Wrong number of segments');
        }
        list($headb64, $payloadb64, $cryptob64) = $tks;
        if (null === ($header = json_decode(self::urlsafeB64Decode($headb64)))) {
            throw new Exception('Invalid segment encoding');
        }
        if (null === $payload = json_decode(self::urlsafeB64Decode($payloadb64))) {
            throw new Exception('Invalid segment encoding');
        }
        $sig = self::urlsafeB64Decode($cryptob64);
        if (isset($key)) {
            if (empty($header->alg)) {
                throw new DomainException('Empty algorithm');
            }
            if (!JWT::verifySignature($sig, "$headb64.$payloadb64", $key, $algo)) {
                throw new UnexpectedValueException('Signature verification failed');
            }
        }
        return $payload;
    }

    /**
     * @param $signature
     * @param $input
     * @param $key
     * @param $algo
     * @return bool
     * @throws Exception
     */
    private static function verifySignature($signature, $input, $key, $algo)
    {
        switch ($algo) {
            case'HS256':
            case'HS384':
            case'HS512':
                return self::sign($input, $key, $algo) === $signature;
            case 'RS256':
                return (boolean)openssl_verify($input, $signature, $key, OPENSSL_ALGO_SHA256);
            case 'RS384':
                return (boolean)openssl_verify($input, $signature, $key, OPENSSL_ALGO_SHA384);
            case 'RS512':
                return (boolean)openssl_verify($input, $signature, $key, OPENSSL_ALGO_SHA512);
            default:
                throw new Exception("Unsupported or invalid signing algorithm.");
        }
    }

    /**
     * @param $input
     * @param $key
     * @param $algo
     * @return mixed|string
     * @throws Exception
     */
    private static function sign($input, $key, $algo)
    {
        switch ($algo) {
            case 'HS256':
                return hash_hmac('sha256', $input, $key, true);
            case 'HS384':
                return hash_hmac('sha384', $input, $key, true);
            case 'HS512':
                return hash_hmac('sha512', $input, $key, true);
            case 'RS256':
                return self::generateRSASignature($input, $key, OPENSSL_ALGO_SHA256);
            case 'RS384':
                return self::generateRSASignature($input, $key, OPENSSL_ALGO_SHA384);
            case 'RS512':
                return self::generateRSASignature($input, $key, OPENSSL_ALGO_SHA512);
            default:
                throw new Exception("Unsupported or invalid signing algorithm.");
        }
    }

    /**
     * @param $input
     * @param $key
     * @param $algo
     * @return mixed
     * @throws Exception
     */
    private static function generateRSASignature($input, $key, $algo)
    {
        if (!openssl_sign($input, $signature, $key, $algo)) {
            throw new Exception("Unable to sign data.");
        }
        return $signature;
    }

    /**
     * @param $data
     * @return mixed|string
     */
    private static function urlSafeB64Encode($data)
    {
        $b64 = base64_encode($data);
        $b64 = str_replace(array('+', '/', '\r', '\n', '='),
            array('-', '_'),
            $b64);
        return $b64;
    }

    /**
     * @param $b64
     * @return string
     */
    private static function urlSafeB64Decode($b64)
    {
        $b64 = str_replace(array('-', '_'),
            array('+', '/'),
            $b64);
        return base64_decode($b64);
    }
}
