import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/user.dart';
import 'api_client.dart';

class SessionController extends ChangeNotifier {
  SessionController._();

  static final SessionController instance = SessionController._();

  final ApiClient api = ApiClient();
  ApiUser? _user;
  String? _token;
  bool _isLoading = false;
  bool _isReady = false;

  ApiUser? get user => _user;
  bool get isLoggedIn => _token != null && _token!.isNotEmpty;
  bool get isLoading => _isLoading;
  bool get isReady => _isReady;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString('access_token');
    if (_token != null && _token!.isNotEmpty) {
      api.setToken(_token);
      try {
        _user = await api.fetchMe();
      } catch (_) {
        _token = null;
        _user = null;
        api.setToken(null);
        await prefs.remove('access_token');
      }
    }
    _isReady = true;
    notifyListeners();
  }

  Future<void> login({required String email, required String password}) async {
    _isLoading = true;
    notifyListeners();
    try {
      final result = await api.login(email: email, password: password);
      _user = result.user;
      _token = result.accessToken;
      api.setToken(_token);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('access_token', _token!);
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    _user = null;
    _token = null;
    api.setToken(null);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('access_token');
    notifyListeners();
  }
}
