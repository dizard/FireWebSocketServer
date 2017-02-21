#Fire Web Socket

Fire Web Socket is a WebSocket server based on NodeJs

Имеет две части
 - Net Server - принимает сигналы управления
 - Web Socket Server - рассылает данные
 
Для работы с Net сервером используется tcp коннект с бинарным протоколом обмена.

####Формат протокола для работы с NET сервером
Структура запроса
- 32-bit little-endian Signed Integer
- Body
- Empty String	0x00

Управляюшие запросы принимает в формате JSON

##Команды

####registerNameSpace

С этого начинается работа с сервером, мы региструем свой NameSpace и работаем в нем.

```JSON
{
  action : 'registerNameSpace',
  name : 'name NameSpace',
  key : 'secret key'
}
```
- key - Секретный ключ задается в конфиге сервера
- name - Название Name Space

Ответ
```JSON
{
  success : true, 
  secretKey : secretKey
}
```
В случае ошибки как пример
```JSON
{
  success : false, 
  reason : 'Need name', 
  code: 300
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

####auth
```JSON
{
  action : 'auth',
  name   : 'nameSpace',
  sKey   : 'sKey'
}
```
В случае успеха
```JSON
{success : true}
```

####emit
```JSON
{
  action  : 'emit',
  channel : 'nameChannel',
  data    : 'data...',
  userId  : 3 // не обязательный аргумент, если нужно отправить сообщение конкретному пользователю
}
```

####set
```JSON
{
  action   : 'set',
  channel  : 'channelName',
  data     : 'data...',
  params : {
    userId : 1, // не обязательный параметр если мы хотим установить состояние канала для конкретного пользователя
    emit   : false, // Отправить новое состоние 
    ttl    : 10 // Не обязательный параметр, указывает время жизни сохраняемого состояния
  }
```

####get
```JSON
{
  action  : 'get',
  channel : 'channelName',
  params  : {
    userId : 1 // Не обязательный параметр, если хотим получить состояния пользовательского канала
  }
}
```

####channelInfo
```JSON
{
  action  : 'channelInfo',
  channel : 'channelName'
}
```
В случае успеха вернет
```JSON
{
  countUser : 1,
  countConnection : 1,
  connId_UserId : {
    'asd98enYasffs-sdfjksf' : 2
  }
}
```
connId_UserId список **connectId : userId**



