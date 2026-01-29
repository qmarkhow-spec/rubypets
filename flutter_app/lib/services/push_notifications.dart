import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';
import 'notification_router.dart';

class PushNotificationsService {
  static final FlutterLocalNotificationsPlugin _localNotifications = FlutterLocalNotificationsPlugin();
  static bool _initialized = false;

  static Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;

    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosInit = DarwinInitializationSettings();

    await _localNotifications.initialize(
      const InitializationSettings(android: androidInit, iOS: iosInit),
      onDidReceiveNotificationResponse: (details) {
        if (details.payload == null || details.payload!.isEmpty) return;
        try {
          final data = _parsePayload(details.payload!);
          NotificationRouter.handleMessageData(data);
        } catch (_) {
          // Ignore malformed payloads
        }
      },
    );

    await FirebaseMessaging.instance.requestPermission();

    if (Platform.isAndroid) {
      const channel = AndroidNotificationChannel(
        'rubypets_notifications',
        'Rubypets notifications',
        description: 'Rubypets notification channel',
        importance: Importance.max,
        enableVibration: true,
        playSound: true,
        showBadge: true,
      );
      await _localNotifications
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(channel);
      await _localNotifications
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
          ?.requestNotificationsPermission();
    }

    await syncTokenWithBackend();

    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);
    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      NotificationRouter.handleMessageData(message.data);
    });

    final initialMessage = await FirebaseMessaging.instance.getInitialMessage();
    if (initialMessage != null) {
      NotificationRouter.handleMessageData(initialMessage.data);
    }

    FirebaseMessaging.instance.onTokenRefresh.listen(registerTokenForCurrentUser);
  }

  static Future<void> syncTokenWithBackend({int retries = 2}) async {
    for (var attempt = 0; attempt <= retries; attempt += 1) {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null && token.isNotEmpty) {
        await registerTokenForCurrentUser(token);
        return;
      }
      if (attempt < retries) {
        await Future.delayed(const Duration(seconds: 2));
      }
    }
  }

  static Future<void> registerTokenForCurrentUser(String token) async {
    final prefs = await SharedPreferences.getInstance();
    final accessToken = prefs.getString('access_token');
    if (accessToken == null || accessToken.isEmpty) return;

    final api = ApiClient();
    api.setToken(accessToken);

    try {
      await api.registerPushToken(
        platform: Platform.isIOS ? 'ios' : 'android',
        fcmToken: token,
      );
    } catch (err) {
      debugPrint('Register push token failed: $err');
    }
  }

  static Future<void> _handleForegroundMessage(RemoteMessage message) async {
    final notification = message.notification;
    if (notification == null) return;

    const androidDetails = AndroidNotificationDetails(
      'rubypets_notifications',
      'Rubypets notifications',
      channelDescription: 'Rubypets notification channel',
      importance: Importance.max,
      priority: Priority.high,
    );
    const iosDetails = DarwinNotificationDetails();

    final payload = _encodePayload(message.data);

    await _localNotifications.show(
      notification.hashCode,
      notification.title ?? 'Rubypets',
      notification.body,
      const NotificationDetails(android: androidDetails, iOS: iosDetails),
      payload: payload,
    );
  }

  static String _encodePayload(Map<String, dynamic> data) {
    final buffer = StringBuffer();
    data.forEach((key, value) {
      buffer.write('$key=${value ?? ''};');
    });
    return buffer.toString();
  }

  static Map<String, dynamic> _parsePayload(String payload) {
    final entries = payload.split(';');
    final data = <String, dynamic>{};
    for (final entry in entries) {
      if (entry.trim().isEmpty) continue;
      final parts = entry.split('=');
      if (parts.length < 2) continue;
      final key = parts.first;
      final value = parts.sublist(1).join('=');
      data[key] = value;
    }
    return data;
  }
}
