import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/notification.dart';
import 'session_provider.dart';

final notificationsProvider = FutureProvider.autoDispose<NotificationsPage>((ref) async {
  final apiClient = ref.watch(apiClientProvider);
  final session = ref.watch(sessionProvider);

  if (session.valueOrNull == null) {
    return NotificationsPage(items: [], nextCursor: null);
  }

  return apiClient.listNotifications(limit: 20);
});
