# 📱 Application Mobile React Native

## Installation

### Prérequis

- Node.js >= 18
- React Native CLI
- Android Studio (pour Android)
- Xcode (pour iOS, macOS uniquement)

### Installation des dépendances

```bash
cd frontend-mobile
npm install
```

### Configuration Android

1. Installer Android Studio
2. Configurer les variables d'environnement:
   - ANDROID_HOME
   - PATH (ajouter platform-tools)

### Configuration iOS (macOS uniquement)

```bash
cd ios
pod install
cd ..
```

## Développement

### Android

```bash
npm run android
```

### iOS

```bash
npm run ios
```

## Build

### Android APK

```bash
npm run build:apk
```

### Android Bundle

```bash
npm run build:bundle
```

### iOS

```bash
npm run build:ios
```

## Structure

```
frontend-mobile/
├── src/
│   ├── components/      # Composants React
│   ├── screens/         # Écrans de l'app
│   ├── navigation/      # Navigation
│   ├── services/        # Services API
│   ├── db/             # Base de données locale (SQLite)
│   ├── sync/           # Système de sync
│   └── utils/          # Utilitaires
├── android/            # Code natif Android
├── ios/                # Code natif iOS
└── package.json
```

## Technologies

- React Native
- React Navigation
- @react-native-async-storage/async-storage
- react-native-sqlite-storage
- axios
- i18next
