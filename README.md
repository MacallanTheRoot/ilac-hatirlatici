# İlaç Hatırlatıcı

Offline Android medication reminder app. Medication details and schedules are stored locally in SQLite. Reminder scheduling, photos, and dose logging are not implemented yet.

## Development

```bash
npm install
npx expo start --go
```

The shell can be viewed in Expo Go. Native notification work will require a development build:

```bash
npx expo run:android
```

`eas.json` also contains development and Android APK preview build profiles for later use.
