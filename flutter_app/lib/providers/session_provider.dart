import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/user.dart';
import '../services/api_client.dart';
import '../services/push_notifications.dart';

final apiClientProvider = Provider((ref) => ApiClient());

class SessionNotifier extends AsyncNotifier<ApiUser?> {
  @override
  Future<ApiUser?> build() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('access_token');

    if (token != null && token.isNotEmpty) {
      ref.read(apiClientProvider).setToken(token);
      try {
        final user = await ref.read(apiClientProvider).fetchMe();
        final fcmToken = await FirebaseMessaging.instance.getToken();
        if (fcmToken != null && fcmToken.isNotEmpty) {
          await PushNotificationsService.registerTokenForCurrentUser(fcmToken);
        }
        return user;
      } catch (_) {
        await prefs.remove('access_token');
        ref.read(apiClientProvider).setToken(null);
        rethrow;
      }
    }

    return null;
  }

  Future<void> login({required String email, required String password}) async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final result = await ref.read(apiClientProvider).login(email: email, password: password);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('access_token', result.accessToken);
      ref.read(apiClientProvider).setToken(result.accessToken);
      final fcmToken = await FirebaseMessaging.instance.getToken();
      if (fcmToken != null && fcmToken.isNotEmpty) {
        await PushNotificationsService.registerTokenForCurrentUser(fcmToken);
      }
      return result.user;
    });
  }

  Future<void> logout() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('access_token');
      ref.read(apiClientProvider).setToken(null);
      return null;
    });
  }
}

final sessionProvider = AsyncNotifierProvider<SessionNotifier, ApiUser?>(SessionNotifier.new);
