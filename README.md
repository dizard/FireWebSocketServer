# Fire Web Socket

Docker Container: **dizard/fire-ws**
```
docker pull dizard/fire-ws:1.0
docker run -itd --name fire-ws  -p 80:8080 -p 8085:8085 -e "FWS_SECRETKEY=yoursecretkey" dizard/fire-ws:1.0
```

Fire Web Socket is a WebSocket server based on NodeJs


Идея всего этого проста, у вас есть много сайтов где нужны вебсокеты из коробки
и не хочется плодить вебсокет сервер на каждый проект. 

Решение простое сайт регистрирует себя на сервере в ответ получает ключ шифрования и дальше отправляет команду используя полученный ключ.
Многие решения предлагают в качестве транспорта http запрос что очень медленно либо очереди через редис, что быстрее, но не то что хотелось бы. 

Это нам не понравилось и вот что получилось))

Есть NET сервер с бинарным протокол обмена поддерживает как tcp соединение так и сокет соединение UNIX. Работает шустро и нет лишних транспортных расходов. 

Отказ от транспорта Redis решает проблему доступа сторонних сайтов.
  
### Что в планах?
- Сделать версию под GO
- Добавить поддержку кластера

 
Имеет две части
- Net Server - принимает сигналы управления
- Web Socket Server - рассылает данные клиентам

Для работы с Net сервером используется tcp коннект с бинарным протоколом обмена.

**Оглавление**
- [Регистрация NameSpace](#registernamespace)
- [Авторизация](#auth)
- [Отправка сообщения](#emit)
- [Установка базового состояния канала](#set)
- [Получение базового состояния канала](#get)
- [Получение информации о канале](#channelinfo)


#### Формат протокола для работы с NET сервером
Структура запроса
- 32-bit little-endian Signed Integer
- Body
- Empty String	0x00

Управляюшие запросы принимает в формате JSON

## Команды

### registerNameSpace

С этого начинается работа с сервером, мы региструем свой NameSpace и работаем в нем.
В ответ получаем secretKey его нужно сохранить так как дальше он будет нужен для работы
с зарегистрированным NameSpace.

```javascript
{
  "action" : 'registerNameSpace',
  "name" : 'name NameSpace',
  "key" : 'secret key'
}
```
- key - Секретный ключ задается в конфиге сервера
- name - Название Name Space

Ответ
```javascript
{
  "success" : true, 
  "secretKey" : secretKey // Его нужно сохранить
}
```
В случае ошибки как пример
```javascript
{
  "success" : false, 
  "reason" : 'Need name', 
  "code" : 300
}
```

Коды ошибок
- 300 - не хватает аргумента в запросе
- 302 - ошибка при попытке работы с внутренним хранилищем сервера
- 309 - регистрируемый NameSpace занят
- 305 - не верный ключ управления NameSpace
- 306 - не верный ключ управления сервером 
- 404 - Name space не найден
- 311 - Необходима авторизация

### auth
```javascript
{
  "action" : 'auth',
  "name"   : 'nameSpace',
  "sKey"   : 'sKey'
}
```
В случае успеха
```javascript
{"success" : true}
```

### emit
```javascript
{
  "action"  : 'emit',
  "channel" : 'nameChannel',
  "data"    : 'data...',
  "params"  : {
    "userId"  : 3 // не обязательный аргумент, если нужно отправить сообщение конкретному пользователю
  }
}
```

### set
Это данные которые получит пользователь как только подпишется на канал
```javascript
{
  "action"   : 'set',
  "channel"  : 'channelName',
  "data"     : 'data...',
  "params" : {
    "userId" : 1, // не обязательный параметр если мы хотим установить состояние канала для конкретного пользователя
    "emit"   : false, // Отправить новое состоние, тоже самое если вызвать метод emit
    "ttl"    : 10 // Не обязательный параметр, указывает время жизни сохраняемого состояния
  }
```

### get
```javascript
{
  "action"  : 'get',
  "channel" : 'channelName',
  "params"  : {
    "userId" : 1 // Не обязательный параметр, если хотим получить состояния пользовательского канала
  }
}
```

### subscribe
подписывает на приватный канал пользователя, имена приватных каналов должны начинаться с #
```javascript
{
  "action"  : 'subscribe',
  "channel" : '#channelName',
  "params"  : {
    "userId" : 1
  }
}
```

### unsubscribe
```javascript
{
  "action"  : 'unsubscribe',
  "channel" : '#channelName',
  "params"  : {
    "userId" : 1
  }
}
```

### channelInfo
```javascript
{
  "action"  : 'channelInfo',
  "channel" : 'channelName'
}
```
В случае успеха вернет
```javascript
{
  "countUser" : 1,
  "countConnection" : 1,
  "connId_UserId" : {
    'asd98enYasffs-sdfjksf' : 2
  }
}
```
connId_UserId список **connectId : userId**



