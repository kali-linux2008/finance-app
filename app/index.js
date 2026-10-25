// Startpunt van de app. Naast de schermen (expo-router) ook de widgets op het startscherm,
// die Android op de achtergrond laat tekenen; die bestaan alleen in de eigen Android-app.
import 'expo-router/entry';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

if (Platform.OS === 'android' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient) {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  registerWidgetTaskHandler(require('./src/widgets/handler').widgetTaskHandler);
}
