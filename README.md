# Kick Bot Manager

Telegram бот для управления аккаунтами и рассылки сообщений на платформе Kick.com.

## 🚀 Установка

### 1. Клонирование репозитория
```bash
git clone https://github.com/your-username/kick-script.git
cd kick-script
```

### 2. Установка зависимостей
```bash
npm install
```

### 3. Сборка проекта
```bash
npm run build
```

### 4. Настройка окружения
Создайте файл `.env` в корне проекта:
```env
BOT_TOKEN=your_telegram_bot_token_here
ALLOWED_USERS=123456789,987654321,555666777
```

**Переменные окружения:**
- `BOT_TOKEN` - токен вашего Telegram бота (получить у @BotFather)
- `ALLOWED_USERS` - список ID пользователей Telegram через запятую, которым разрешен доступ к боту

> 💡 **Как узнать свой Telegram ID:**
> 1. Напишите боту @userinfobot
> 2. Или напишите боту @IDBot команду `/getid`
> 3. Скопируйте полученный числовой ID

## 📁 Настройка файла аккаунтов

### Формат accounts.yml

Создайте файл `accounts.yml` в корне проекта со следующей структурой:

```yaml
streamers:
  streamer_nickname:
    nickname: streamer_nickname
    chatId: "chat_id_here"

users:
  username1:
    username: username1
    accessToken: userId|token
    userAgent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
  username2:
    username: username2  
    accessToken: userId|token
    userAgent: Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15
```

### Описание полей:

#### Пользователи (users):
- **username** - имя пользователя на Kick.com
- **accessToken** - токен доступа в формате `userId|token`
- **userAgent** (опционально) - пользовательский агент браузера

#### Стримеры (streamers):
- **nickname** - никнейм стримера
- **chatId** - ID чата стримера

### ⚠️ Важные замечания:

1. **User Agent**: Поле `userAgent` является опциональным. Если оно не указано, система автоматически сгенерирует случайный user agent с помощью библиотеки `user-agents`.

2. **Токен доступа**: `accessToken` должен содержать полную строку в формате `userId|token`, где:
   - `userId` - ID пользователя на Kick
   - `token` - токен авторизации

3. **Chat ID**: Получить `chatId` можно из URL чата стримера или через API Kick.

## 🎮 Запуск

```bash
npm run prod
```

## 📱 Функционал Telegram бота

### Основные возможности:

- **👥 Управление пользователями** - добавление, удаление, просмотр списка
- **🎬 Управление стримерами** - настройка чатов для рассылки
- **📢 Рассылка сообщений** - массовая отправка сообщений
- **💬 Отправка от пользователя** - отправка сообщений от конкретного аккаунта
- **📁 Управление файлами** - импорт/экспорт конфигураций
- **📊 Статистика** - информация о загруженных аккаунтах

### Команды:

- `/start` - запуск бота и главное меню
- `/menu` - показать главное меню
- `/sendas <username> <chatId> <message>` - отправить сообщение от пользователя
- `/export` - экспорт конфигурации в YML
- `/exporttxt` - экспорт аккаунтов в текстовый формат
- `/stats` - показать статистику

## 📄 Форматы файлов

### Импорт из .txt файла
Текстовый формат для импорта аккаунтов:
```
username1=userId1|token1
username2=userId2|token2
username3=userId3|token3
```

### Экспорт в .txt файл
Экспорт создает файл в том же формате `username=userId|token` для удобного обмена аккаунтами.

## 🔧 Технические детали

- **TypeScript** - основной язык разработки
- **Telegraf** - библиотека для работы с Telegram Bot API
- **Axios** - HTTP клиент для API запросов
- **YAML** - парсинг и генерация конфигурационных файлов
- **User-agents** - автоматическая генерация user agent'ов

## 📋 Требования

- Node.js 18+
- npm 9+
- Telegram Bot Token

## 🤝 Поддержка

При возникновении проблем создавайте issue в репозитории проекта.