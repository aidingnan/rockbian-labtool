# Provision

## Certification Signing Request (CSR)

csr使用winasd的bpp.js生成，需要提供domain参数；可以为aws-cn或者test。

```
ssh root@169.254.51.76 node /root/winasd/src/bpp.js --domain aws-cn
```

subject字段包括：

```
O  - Shanghai Dingnan Co., Ltd.
CN - IntelliDrive
OU - aws-cn
serialNumber - 01237d497240a110ee
```

查看csr内容

```
$ openssl req -in test.csr -noout -text
Certificate Request:
    Data:
        Version: 1 (0x0)
        Subject: O = "Shanghai Dingnan Co., Ltd.", CN = IntelliDrive, OU = aws-cn, serialNumber = 01237d497240a110ee
        Subject Public Key Info:
            Public Key Algorithm: id-ecPublicKey
                Public-Key: (256 bit)
                pub:
                    04:a6:7a:67:31:ea:60:cb:1e:ab:a0:45:87:a5:f3:
                    4d:14:64:4e:de:9a:b3:55:2e:c3:0f:26:5e:62:3f:
                    77:19:68:72:7c:03:46:6f:92:e2:7f:3c:a9:47:a1:
                    e2:a7:57:ed:e3:f2:e2:ec:d1:f0:26:78:77:94:9b:
                    04:21:1e:2a:24
                ASN1 OID: prime256v1
                NIST CURVE: P-256
        Attributes:
        Requested Extensions:
    Signature Algorithm: ecdsa-with-SHA256
         30:45:02:20:61:97:2f:69:a7:6c:0b:0b:c1:47:3c:c1:b1:a6:
         9c:5c:e9:6d:e8:3d:fe:af:18:b7:3e:f5:de:68:c5:b4:1f:6f:
         02:21:00:f7:eb:62:de:1d:54:4b:80:a7:38:d7:62:59:20:25:
         3b:6d:b4:18:46:ac:46:a2:92:16:bf:38:bd:4c:18:8a:fa
```

提取subject

```
$ openssl req -in test.csr -noout -subject
subject=O = "Shanghai Dingnan Co., Ltd.", CN = IntelliDrive, OU = aws-cn, serialNumber = 01237d497240a110ee
```

验证csr有效

```
$ openssl req -in test.csr -noout -verify
verify OK

```

## 从云提取证书

## 签署证书

## 检查签署的证书

总览

```
$ openssl x509 -in cert.pem -noout -text
Certificate:
    Data:
        Version: 3 (0x2)
        Serial Number:
            20:54:1d:f4:81:1d:88:43:57:ab:85:36:e1:49:1f:bf:7a:7e:95:74
        Signature Algorithm: sha256WithRSAEncryption
        Issuer: OU = Amazon Web Services O=Amazon.com Inc. L=Seattle ST=Washington C=US
        Validity
            Not Before: Aug 14 09:42:26 2019 GMT
            Not After : Dec 31 23:59:59 2049 GMT
        Subject: O = "Shanghai Dingnan Co., Ltd.", CN = IntelliDrive, OU = aws-cn, serialNumber = 01237d497240a110ee
        Subject Public Key Info:
            Public Key Algorithm: id-ecPublicKey
                Public-Key: (256 bit)
                pub:
                    04:a6:7a:67:31:ea:60:cb:1e:ab:a0:45:87:a5:f3:
                    4d:14:64:4e:de:9a:b3:55:2e:c3:0f:26:5e:62:3f:
                    77:19:68:72:7c:03:46:6f:92:e2:7f:3c:a9:47:a1:
                    e2:a7:57:ed:e3:f2:e2:ec:d1:f0:26:78:77:94:9b:
                    04:21:1e:2a:24
                ASN1 OID: prime256v1
                NIST CURVE: P-256
        X509v3 extensions:
            X509v3 Authority Key Identifier: 
                keyid:60:1F:3A:82:7D:A7:DE:49:A2:37:A4:2E:10:97:1D:53:4F:64:0F:7D

            X509v3 Subject Key Identifier: 
                C3:4A:45:67:47:EC:49:84:81:78:4A:F6:FE:7C:33:DC:D9:76:0B:97
            X509v3 Basic Constraints: critical
                CA:FALSE
            X509v3 Key Usage: critical
                Digital Signature
    Signature Algorithm: sha256WithRSAEncryption
         e3:fe:74:aa:12:ef:20:92:67:38:39:32:d0:31:1a:bb:a7:24:
         8f:72:38:26:a3:82:21:cb:4f:0d:cf:fc:cf:11:e5:b1:2d:b7:
         85:bc:eb:c6:11:3c:69:20:47:da:26:3d:c1:47:db:a8:c0:df:
         aa:78:4b:ea:ac:66:a8:a8:b4:a2:77:6e:2e:7d:9c:0c:f9:69:
         05:9f:0e:5d:7f:29:a2:f6:10:70:cd:ad:d7:7e:6f:81:a9:cd:
         2f:ea:6b:45:c5:82:f9:71:f4:9b:6b:88:3a:5a:81:15:62:d8:
         62:f7:37:99:b4:47:db:ed:a3:98:60:ec:2f:4f:bd:af:b8:8e:
         07:66:ad:e7:c1:bc:62:58:a3:46:b5:21:fe:b6:b6:28:d6:1a:
         0e:0d:eb:c0:85:1f:83:4b:b3:05:bb:b7:24:ed:f0:ec:ae:fc:
         a4:e5:3d:f0:39:38:0d:10:09:3f:bf:c0:e6:e0:63:27:9d:e2:
         51:4e:f4:5e:ad:e9:5b:15:2d:49:59:0d:5c:5f:af:e5:0a:1b:
         5c:e6:50:6d:58:d4:1d:6b:eb:e8:ba:b8:a0:16:5e:95:55:98:
         48:9c:7d:e1:d8:77:df:5d:d2:87:81:d7:53:74:e9:c3:86:7f:
         ac:1d:4c:3a:f2:ec:52:79:6a:5b:a8:60:ba:d8:4e:99:05:5b:
         3d:cd:a1:49
```
Subject（和CSR一致）

```
$ openssl x509 -in cert.pem -noout -subject
subject=O = "Shanghai Dingnan Co., Ltd.", CN = IntelliDrive, OU = aws-cn, serialNumber = 01237d497240a110ee
```

颁发者信息

```
$ openssl x509 -in cert.pem -noout -issuer
issuer=OU = Amazon Web Services O=Amazon.com Inc. L=Seattle ST=Washington C=US
```

证书的序列号

```
$ openssl x509 -in cert.pem -noout -serial
serial=20541DF4811D884357AB8536E1491FBF7A7E9574
```

证书的有效时间

```
$ openssl x509 -in cert.pem -noout -startdate
notBefore=Aug 14 09:42:26 2019 GMT

$ openssl x509 -in cert.pem -noout -enddate
notAfter=Dec 31 23:59:59 2049 GMT

$ openssl x509 -in cert.pem -noout -dates
notBefore=Aug 14 09:42:26 2019 GMT
notAfter=Dec 31 23:59:59 2049 GMT
```

证书指纹

```
$ openssl x509 -in cert.pem -noout -fingerprint 
SHA1 Fingerprint=D5:D9:D9:A9:B7:3A:ED:24:C5:9F:AA:BD:47:B0:F1:C3:A9:54:7F:FE
```

上述指纹可以如下方式计算：
- 从PEM格式转化为DER格式
- 计算DER格式证书的sha1

```
$ openssl x509 -in cert.pem -outform DER -out cert.der
$ sha1sum cert.der
d5d9d9a9b73aed24c59faabd47b0f1c3a9547ffe  cert.der
```

Amazon AWS没有提供ROOT CA和Intermediate证书用于验证，该证书仅能在Amazon AWS服务上验证有效性。

