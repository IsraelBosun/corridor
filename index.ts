/**
 * The app's entry point. Background location can start the JavaScript with no
 * screen mounted, and then no route file is loaded, so the task has to be
 * defined here as well as expo-router being started.
 */
import 'expo-router/entry';

import '@/lib/background-sharing';
