import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/user.dart';
import '../services/api_client.dart';

// 1. 為 ApiClient 建立一個簡單的 Provider
// 其他 Provider 可以透過 ref.read(apiClientProvider) 來取得 ApiClient 的實例
final apiClientProvider = Provider((ref) => ApiClient());

// 2. Session 狀態的 AsyncNotifier
// 它將管理使用者的登入、登出以及初始化的非同步操作
class SessionNotifier extends AsyncNotifier<ApiUser?> {
  @override
  Future<ApiUser?> build() async {
    // 'build' 方法取代了舊的 'load' 方法，Riverpod 會自動處理初始化的載入狀態
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('access_token');

    if (token != null && token.isNotEmpty) {
      ref.read(apiClientProvider).setToken(token);
      try {
        // 嘗試獲取使用者資料。如果失敗，Provider 會自動進入 error 狀態
        final user = await ref.read(apiClientProvider).fetchMe();
        return user;
      } catch (e) {
        // 如果獲取失敗（例如 token 過期），清除 token 並讓 Provider 進入錯誤狀態
        await prefs.remove('access_token');
        ref.read(apiClientProvider).setToken(null);
        rethrow;
      }
    }
    // 如果沒有 token，則初始狀態為 null (未登入)
    return null;
  }

  Future<void> login({required String email, required String password}) async {
    // 將狀態設定為 loading，UI 會自動顯示載入指示器
    state = const AsyncValue.loading();
    // AsyncValue.guard 會自動處理 try/catch
    state = await AsyncValue.guard(() async {
      final result = await ref.read(apiClientProvider).login(email: email, password: password);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('access_token', result.accessToken);
      ref.read(apiClientProvider).setToken(result.accessToken);
      return result.user;
    });
  }

  Future<void> logout() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('access_token');
      ref.read(apiClientProvider).setToken(null);
      // 登出後，使用者狀態為 null
      return null;
    });
  }
}

// 3. 這是最終提供給 UI 使用的 Provider
// UI 會監聽這個 sessionProvider 來獲得使用者狀態的改變
final sessionProvider = AsyncNotifierProvider<SessionNotifier, ApiUser?>(SessionNotifier.new);
